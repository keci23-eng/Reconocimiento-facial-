import io
import json
from django.shortcuts import render, redirect
from django.http import HttpResponseForbidden
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny
from django.conf import settings
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.decorators import login_required
from django.utils.decorators import method_decorator
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from .models import Student, Detection
from .serializers import StudentSerializer
from .serializers import DetectionSerializer
from .utils.recognition import get_face_encodings_from_fileobj, encoding_to_json, json_to_encoding, find_best_match
from django.contrib.auth.models import User, Group
from django.contrib import messages


ALLOWED_CAREER = 'SISTEMAS Y GESTION DE DATA'


class IndexView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        user = request.user
        if not user or not user.is_authenticated:
            return redirect('/login/')
        groups = [g.name for g in user.groups.all()]
        if 'GUARD' in groups:
            return redirect('/guard/')
        if 'STUDENT' in groups:
            return redirect('/student/')
        is_admin = user.is_superuser or user.groups.filter(name='ADMIN').exists()
        return render(request, 'index.html', {'is_admin': is_admin})


class RegisterPageView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        user = request.user
        if not user or not user.is_authenticated:
            return redirect('/login/')
        # allow only ADMIN group members or superusers
        if not (user.is_superuser or user.groups.filter(name='ADMIN').exists()):
            return HttpResponseForbidden('No tienes permiso para acceder a esta página')
        return render(request, 'register.html')


class UploadPageView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        user = request.user
        if not user or not user.is_authenticated:
            return redirect('/login/')
        # allow only ADMIN group members or superusers
        if not (user.is_superuser or user.groups.filter(name='ADMIN').exists()):
            return HttpResponseForbidden('No tienes permiso para acceder a esta página')
        return render(request, 'student_upload.html')


class LoginView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        return render(request, 'login.html')

    def post(self, request):
        username = request.data.get('username') or request.POST.get('username')
        password = request.data.get('password') or request.POST.get('password')
        user = authenticate(request, username=username, password=password)
        if user is None:
            return render(request, 'login.html', {'error': 'Credenciales inválidas'})
        login(request, user)
        # Redirect based on group
        groups = [g.name for g in user.groups.all()]
        if 'ADMIN' in groups or user.is_superuser:
            return redirect('/app/')
        if 'GUARD' in groups:
            return redirect('/guard/')
        if 'STUDENT' in groups:
            return redirect('/student/')
        return redirect('/')


class LogoutView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        logout(request)
        return redirect('/login/')


class StudentDashboardView(APIView):
    @method_decorator(login_required)
    def get(self, request):
        return render(request, 'student_register.html')


class GuardView(APIView):
    @method_decorator(login_required)
    def get(self, request):
        # Guard user only sees live camera page
        return render(request, 'guard_live.html')


class GuardDetectionsView(APIView):
    @method_decorator(login_required)
    def get(self, request):
        return render(request, 'guard_detections.html')


class RegisterStudentAPIView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request, format=None):
        name = request.data.get('name') or request.POST.get('name')
        career = request.data.get('career') or request.POST.get('career')
        image = request.FILES.get('image')
        # optional client timestamp (ISO format)
        client_ts = request.data.get('client_timestamp') or request.POST.get('client_timestamp')

        # If logged-in user in STUDENT group, allow name-only registration and default career
        user = request.user if hasattr(request, 'user') else None
        if user and user.is_authenticated and user.groups.filter(name='STUDENT').exists():
            if not name or not image:
                return Response({'error': 'Nombre e imagen son obligatorios.'}, status=status.HTTP_400_BAD_REQUEST)
            career = ALLOWED_CAREER
        else:
            if not name or not career or not image:
                return Response({'error': 'Nombre, carrera e imagen son obligatorios.'}, status=status.HTTP_400_BAD_REQUEST)

        if career.strip().upper() != ALLOWED_CAREER:
            return Response({'error': f'Solo se permite registrar la carrera "{ALLOWED_CAREER}".'}, status=status.HTTP_400_BAD_REQUEST)

        encodings = get_face_encodings_from_fileobj(image)
        if not encodings:
            return Response({'error': 'No se encontró un rostro en la imagen proporcionada.'}, status=status.HTTP_400_BAD_REQUEST)

        encoding = encodings[0]
        student = Student(name=name, career=career)
        student.encoding = encoding_to_json(encoding)
        # set created_at from client if provided, else server time
        if client_ts:
            parsed = parse_datetime(client_ts)
            if parsed is not None:
                if timezone.is_naive(parsed):
                    parsed = timezone.make_aware(parsed, timezone.get_current_timezone())
                student.created_at = parsed
            else:
                student.created_at = timezone.now()
        else:
            student.created_at = timezone.now()
        # save image via model field
        try:
            image.seek(0)
        except Exception:
            pass
        student.image.save(image.name, image, save=False)
        student.save()

        return Response({'ok': True, 'student_id': student.id}, status=status.HTTP_201_CREATED)


class DetectAPIView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request, format=None):
        image = request.FILES.get('image')
        # optional client timestamp (ISO format)
        client_ts = request.data.get('client_timestamp') or request.POST.get('client_timestamp')
        
        if not image:
            return Response({'error': 'image required'}, status=status.HTTP_400_BAD_REQUEST)

        # get encodings and face locations
        image.seek(0)
        # load image bytes for locations and encodings
        import face_recognition as fr
        img = fr.load_image_file(image)
        locations = fr.face_locations(img)
        encodings = fr.face_encodings(img, locations)
        
        # If no faces detected, return empty results (do NOT save to DB)
        if not encodings:
            return Response({'detections': []})

        # prepare known encodings
        students = list(Student.objects.all())
        known_encs = [json.loads(s.encoding) for s in students]

        results = []
        for enc, loc in zip(encodings, locations):
            idx, dist = find_best_match(known_encs, enc)
            # ONLY save if recognized (matched with distance <= 0.6)
            if idx is not None and dist is not None and dist <= 0.6:
                s = students[idx]
                # save detection record only for recognized faces
                image.seek(0)
                det = Detection(student=s, recognized_name=s.name, recognized_career=s.career, confidence=dist)
                # set timestamp from client if provided
                if client_ts:
                    parsed = parse_datetime(client_ts)
                    if parsed is not None:
                        if timezone.is_naive(parsed):
                            parsed = timezone.make_aware(parsed, timezone.get_current_timezone())
                        det.timestamp = parsed
                    else:
                        det.timestamp = timezone.now()
                else:
                    det.timestamp = timezone.now()
                det.image.save(image.name, image, save=False)
                det.save()
                results.append({'name': s.name, 'career': s.career, 'confidence': dist, 'box': {'top': loc[0], 'right': loc[1], 'bottom': loc[2], 'left': loc[3]}})
            else:
                # Face detected but not recognized: return result but DO NOT save to DB
                results.append({'name': None, 'career': None, 'confidence': None, 'box': {'top': loc[0], 'right': loc[1], 'bottom': loc[2], 'left': loc[3]}})

        return Response({'detections': results})


class StudentListAPIView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        qs = Student.objects.all()
        data = StudentSerializer(qs, many=True, context={'request': request}).data
        return Response(data)


class DetectionListAPIView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        # optional ?limit= param
        try:
            limit = int(request.GET.get('limit') or 50)
        except Exception:
            limit = 50
        qs = Detection.objects.order_by('-timestamp')[:limit]
        data = DetectionSerializer(qs, many=True, context={'request': request}).data
        return Response(data)


class CreateUserView(APIView):
    @method_decorator(login_required)
    def get(self, request):
        user = request.user
        if not (user.is_superuser or user.groups.filter(name='ADMIN').exists()):
            return HttpResponseForbidden('No tienes permiso para acceder a esta página')
        groups = Group.objects.all()
        return render(request, 'create_users.html', {'groups': groups})

    @method_decorator(login_required)
    def post(self, request):
        user = request.user
        if not (user.is_superuser or user.groups.filter(name='ADMIN').exists()):
            return HttpResponseForbidden('No tienes permiso para realizar esta acción')

        username = request.POST.get('username')
        password = request.POST.get('password')
        first_name = request.POST.get('first_name')
        last_name = request.POST.get('last_name')
        email = request.POST.get('email')
        is_staff = bool(request.POST.get('is_staff'))
        is_active = bool(request.POST.get('is_active'))
        is_superuser = bool(request.POST.get('is_superuser'))
        group_id = request.POST.get('group')

        if not username or not password:
            messages.error(request, 'El usuario y la contraseña son obligatorios.')
            return redirect('/create_users/')

        if User.objects.filter(username=username).exists():
            messages.error(request, 'Ya existe un usuario con ese nombre.')
            return redirect('/create_users/')

        new_user = User.objects.create_user(username=username, email=email, password=password)
        new_user.first_name = first_name or ''
        new_user.last_name = last_name or ''
        new_user.is_staff = is_staff
        new_user.is_active = is_active
        new_user.is_superuser = is_superuser
        new_user.save()

        try:
            if group_id:
                g = Group.objects.get(id=int(group_id))
                new_user.groups.add(g)
        except Exception:
            pass

        messages.success(request, 'Usuario creado correctamente.')
        return redirect('/app/')
