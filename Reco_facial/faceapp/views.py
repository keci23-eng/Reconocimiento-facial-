import json

from django.shortcuts import render, redirect
from django.http import HttpResponseForbidden
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.decorators import login_required
from django.utils.decorators import method_decorator
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from django.contrib import messages
from django.contrib.auth.models import User, Group
from django.views.decorators.csrf import csrf_exempt, ensure_csrf_cookie
from django.utils.decorators import method_decorator
from rest_framework.permissions import AllowAny
from rest_framework.views import APIView

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny
from .utils.emailing import send_email_brevo_template
from .models import Student, Detection, Consentimiento
from .serializers import StudentSerializer, DetectionSerializer
from .utils.recognition import (
    get_face_encodings_from_fileobj,
    encoding_to_json,
    find_best_match,
)
from .utils.emailing import send_email_brevo
from rest_framework.authentication import BasicAuthentication
from rest_framework.permissions import AllowAny
from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator
from PIL import Image
import io
from django.core.files.base import ContentFile

ALLOWED_CAREER = "SISTEMAS Y GESTION DE DATA"


# ==========================
# INDEX
# ==========================
@method_decorator(ensure_csrf_cookie, name='dispatch')
class IndexView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        if not request.user.is_authenticated:
            return redirect("/login/")

        groups = [g.name for g in request.user.groups.all()]

        if "GUARD" in groups:
            return redirect("/guard/")
        if "STUDENT" in groups:
            return redirect("/student/")

        is_admin = request.user.is_superuser or "ADMIN" in groups
        return render(request, "index.html", {"is_admin": is_admin})


# ==========================
# LOGIN / LOGOUT
# ==========================
class LoginView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        return render(request, "login.html")

    def post(self, request):
        username = request.POST.get("username")
        password = request.POST.get("password")

        user = authenticate(request, username=username, password=password)

        if not user:
            return render(request, "login.html", {"error": "Credenciales inválidas"})

        login(request, user)

        groups = [g.name for g in user.groups.all()]

        if "ADMIN" in groups or user.is_superuser:
            return redirect("/app/")
        if "GUARD" in groups:
            return redirect("/guard/")
        if "STUDENT" in groups:
            consentimiento = Consentimiento.objects.filter(user=user).first()
            if consentimiento and consentimiento.accepted:
                return redirect("/student/")
            return redirect("/consentimiento/")

        return redirect("/")


class LogoutView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        logout(request)
        return redirect("/login/")


# ==========================
# CONSENTIMIENTO
# ==========================
class ConsentView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        if not request.user.is_authenticated:
            return redirect("/login/")

        if not request.user.groups.filter(name="STUDENT").exists():
            return HttpResponseForbidden("No autorizado")

        return render(request, "consentimiento.html")

    def post(self, request):
        if not request.user.is_authenticated:
            return redirect("/login/")

        accept = request.POST.get("accept")

        if accept == "on":
            consentimiento, _ = Consentimiento.objects.get_or_create(
                user=request.user,
                defaults={"username": request.user.username},
            )

            consentimiento.accepted = True
            consentimiento.accepted_at = timezone.now()
            consentimiento.save()

            # 📧 EMAIL BREVO
            send_email_brevo(
                request.user.email,
                "Consentimiento aceptado",
                f"""
                <h2>Hola {request.user.username}</h2>
                <p>Gracias por aceptar el consentimiento.</p>
                <p>Ya puedes usar el sistema.</p>
                """
            )

            return redirect("/student/")

        messages.error(request, "Debes aceptar el consentimiento")
        logout(request)
        return redirect("/login/")


# ==========================
# DASHBOARDS
# ==========================
@method_decorator(ensure_csrf_cookie, name='dispatch')
class StudentDashboardView(APIView):
    @method_decorator(login_required)
    def get(self, request):
        return render(request, "student_register.html")


@method_decorator(ensure_csrf_cookie, name='dispatch')
class GuardView(APIView):
    @method_decorator(login_required)
    def get(self, request):
        return render(request, "guard_live.html")


class GuardDetectionsView(APIView):
    @method_decorator(login_required)
    def get(self, request):
        return render(request, "guard_detections.html")


# ==========================
# REGISTRO ESTUDIANTE
# ==========================
class RegisterStudentAPIView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        name = request.POST.get("name")
        career = request.POST.get("career")
        correo = request.POST.get("correo")
        image = request.FILES.get("image")

        if not name or not image:
            return Response({"error": "Datos incompletos"}, status=400)

        if career.strip().upper() != ALLOWED_CAREER:
            return Response({"error": "Carrera no permitida"}, status=400)

        encodings = get_face_encodings_from_fileobj(image)
        if not encodings:
            return Response({"error": "No se detectó rostro"}, status=400)

        student = Student(
            name=name,
            career=career,
            correo=correo,
            encoding=encoding_to_json(encodings[0]),
            created_at=timezone.now(),
        )

        student.image.save(image.name, image, save=False)
        student.save()

        # 📧 EMAIL BREVO – AVISO BIOMÉTRICO
        if correo:
             send_email_brevo_template(
        correo,
        template_id=2,   # 👈 ESTE ES EL ID DE TU PLANTILLA
        params={
            "NOMBRE": name
        }
    )

        return Response({"ok": True}, status=201)


# ==========================
# DETECCIÓN
# ==========================
@method_decorator(csrf_exempt, name="dispatch")
class DetectAPIView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = [BasicAuthentication]  # 🔥 CLAVE

    def post(self, request):
        image = request.FILES.get("image")
        if not image:
            return Response({"error": "Imagen requerida"}, status=400)

        import face_recognition as fr
        import json

        img = fr.load_image_file(image)
        locations = fr.face_locations(img)
        encodings = fr.face_encodings(img, locations)

        # Read original uploaded bytes so we can save the full frame later
        try:
            image.seek(0)
        except Exception:
            pass
        try:
            original_bytes = image.read()
        except Exception:
            original_bytes = None

        students = list(Student.objects.all())
        known_encs = [json.loads(s.encoding) for s in students]

        results = []

        for enc, loc in zip(encodings, locations):
            idx, dist = find_best_match(known_encs, enc)

            if idx is not None and dist <= 0.6:
                s = students[idx]
                # Save the full original frame for this detection (not a tight crop)
                try:
                    filename = f"detection_{timezone.now().strftime('%Y%m%d%H%M%S%f')}.jpg"
                    det = Detection(
                        student=s,
                        recognized_name=s.name,
                        recognized_career=s.career,
                        confidence=float(dist),
                        timestamp=timezone.now(),
                    )
                    if original_bytes:
                        det.image.save(filename, ContentFile(original_bytes), save=False)
                    det.save()
                except Exception:
                    Detection.objects.create(
                        student=s,
                        recognized_name=s.name,
                        recognized_career=s.career,
                        confidence=float(dist),
                        timestamp=timezone.now(),
                    )

                results.append({
                    "name": s.name,
                    "career": s.career,
                    "confidence": float(dist),
                    "box": {
                        "top": loc[0],
                        "right": loc[1],
                        "bottom": loc[2],
                        "left": loc[3],
                    }
                })
            else:
                # For unknown faces save the full original frame as well
                try:
                    filename = f"detection_unknown_{timezone.now().strftime('%Y%m%d%H%M%S%f')}.jpg"
                    det = Detection(
                        timestamp=timezone.now(),
                        confidence=None,
                    )
                    if original_bytes:
                        det.image.save(filename, ContentFile(original_bytes), save=False)
                    det.save()
                except Exception:
                    Detection.objects.create(timestamp=timezone.now())

                results.append({"name": None, "career": None})

        return Response({"detections": results})


# ==========================
# LISTADOS  
# ==========================
class StudentListAPIView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        students = Student.objects.all()
        return Response(StudentSerializer(students, many=True).data)


class DetectionListAPIView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        detections = Detection.objects.order_by("-timestamp")[:50]
        return Response(DetectionSerializer(detections, many=True).data)


# ==========================
# CREAR USUARIOS
# ==========================
class CreateUserView(APIView):
    @method_decorator(login_required)
    def get(self, request):
        if not request.user.groups.filter(name="ADMIN").exists():
            return HttpResponseForbidden()
        return render(request, "create_users.html", {"groups": Group.objects.all()})

    @method_decorator(login_required)
    def post(self, request):
        if not request.user.groups.filter(name="ADMIN").exists():
            return HttpResponseForbidden()

        user = User.objects.create_user(
            username=request.POST["username"],
            password=request.POST["password"],
            email=request.POST.get("email"),
        )

        group_id = request.POST.get("group")
        if group_id:
            user.groups.add(Group.objects.get(id=group_id))

        messages.success(request, "Usuario creado correctamente")
        return redirect("/app/")
