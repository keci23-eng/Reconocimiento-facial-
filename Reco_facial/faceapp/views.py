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
from django.conf import settings
from django.core.signing import dumps, loads, BadSignature, SignatureExpired
from datetime import timedelta
from .models import Student, Detection, Consentimiento
from .models import PasswordResetOTP
from .utils.otp import make_otp, hash_otp

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
        username_or_email = (request.POST.get("username") or '').strip()
        password = request.POST.get("password")

        # intentar autenticar usando lo que el usuario ingresó como username
        user = authenticate(request, username=username_or_email, password=password)

        # si falla, intentar buscar por email y autenticar con el username real
        if not user:
            try:
                from django.contrib.auth import get_user_model
                UserModel = get_user_model()
                u = UserModel.objects.get(email__iexact=username_or_email)
                user = authenticate(request, username=u.username, password=password)
            except Exception:
                user = None

        if not user:
            print(f"Login failed for input={username_or_email}")
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
                # enviar notificación opcional de inicio de sesión (si está configurado Brevo)
                try:
                    tpl_id = getattr(settings, 'BREVO_LOGIN_TEMPLATE_ID', None)
                    if tpl_id:
                        send_email_brevo_template(user.email, tpl_id, params={"NOMBRE": user.first_name or user.username})
                    else:
                        # si no hay plantilla, enviar un pequeño aviso (no bloquear el login si falla)
                        send_email_brevo(user.email, "Nuevo inicio de sesión", f"<p>Hola {user.first_name or user.username}, se ha iniciado sesión en tu cuenta.</p>")
                except Exception as e:
                    print('Warning: fallo al enviar email de login:', e)
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

            # 📧 EMAIL BREVO – usar plantilla si está configurada
            try:
                tpl_id = getattr(settings, 'BREVO_CONSENT_TEMPLATE_ID', None)
                # use localtime() so the email shows the server's configured local timezone
                local_dt = timezone.localtime(timezone.now())
                params = {
                    "NOMBRE": request.user.first_name or request.user.username,
                    "USUARIO": request.user.username,
                    "FECHA": local_dt.strftime("%Y-%m-%d %H:%M"),
                    "SITIO": settings.BREVO_SENDER_NAME,
                    "SUPPORT_EMAIL": settings.BREVO_SENDER_EMAIL,
                }
                if tpl_id:
                    print(f"Sending consent email with params={params} tpl_id={tpl_id}")
                    send_email_brevo_template(request.user.email, tpl_id, params=params)
                else:
                    # fallback simple html
                    html = f"""
                    <h2>Hola {params['NOMBRE']}</h2>
                    <p>Gracias por aceptar el consentimiento.</p>
                    <p>Fecha: {params['FECHA']}</p>
                    """
                    send_email_brevo(request.user.email, "Consentimiento aceptado", html)
            except Exception as e:
                print('Error enviando email consentimiento:', e)

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
        # determine admin flag so templates can show admin-only controls
        groups = [g.name for g in request.user.groups.all()]
        is_admin = request.user.is_superuser or "ADMIN" in groups
        return render(request, "student_register.html", {"is_admin": is_admin, "ALLOWED_CAREER": ALLOWED_CAREER})


@method_decorator(ensure_csrf_cookie, name='dispatch')
class GuardView(APIView):
    @method_decorator(login_required)
    def get(self, request):
        return render(request, "guard_live.html")


@method_decorator(ensure_csrf_cookie, name='dispatch')
class StudentUploadView(APIView):
    @method_decorator(login_required)
    def get(self, request):
        groups = [g.name for g in request.user.groups.all()]
        is_admin = request.user.is_superuser or "ADMIN" in groups
        return render(request, "student_upload.html", {"is_admin": is_admin})


class GuardDetectionsView(APIView):
    @method_decorator(login_required)
    def get(self, request):
        return render(request, "guard_detections.html", {"back_url": "/guard/"})


class AdminDetectionsView(APIView):
    @method_decorator(login_required)
    def get(self, request):
        # only admin users
        if not (request.user.is_superuser or request.user.groups.filter(name="ADMIN").exists()):
            return HttpResponseForbidden()
        return render(request, "guard_detections.html", {"back_url": "/app/"})


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

        # require name, email and image
        if not name or not correo or not image:
            return Response({"error": "Datos incompletos"}, status=400)

        # validate email format
        from django.core.validators import validate_email
        from django.core.exceptions import ValidationError
        try:
            validate_email(correo)
        except ValidationError:
            return Response({"error": "Correo inválido"}, status=400)

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
    """
    Detecta rostros y SOLO compara contra estudiantes activos (activo=1).
    """
    permission_classes = [AllowAny]
    authentication_classes = [BasicAuthentication]  # si lo usas

    def post(self, request):
        image = request.FILES.get("image")
        if not image:
            return Response({"error": "Imagen requerida"}, status=400)

        import face_recognition as fr

        img = fr.load_image_file(image)
        locations = fr.face_locations(img)
        encodings = fr.face_encodings(img, locations)

        # leer bytes originales para guardar evidencia
        try:
            image.seek(0)
        except Exception:
            pass
        try:
            original_bytes = image.read()
        except Exception:
            original_bytes = None

        # ✅ SOLO ACTIVOS (pero también necesitamos comparar contra TODOS
        # los estudiantes para detectar si el rostro corresponde a uno
        # desactivado y evitar identificarlo erróneamente como otra
        # persona activa)
        students = list(Student.objects.filter(activo=1))
        known_encs = [json.loads(s.encoding) for s in students]

        all_students = list(Student.objects.all())
        all_encs = [json.loads(s.encoding) for s in all_students]

        results = []

        for enc, loc in zip(encodings, locations):
            idx, dist = find_best_match(known_encs, enc)

            # mejor coincidencia global (incluye inactivos)
            overall_idx, overall_dist = find_best_match(all_encs, enc)

            # si la mejor coincidencia global es un estudiante INACTIVO y
            # está dentro del umbral, tratar como desconocido para evitar
            # identificarlo como otra persona activa
            if overall_idx is not None:
                maybe_student = all_students[overall_idx]
            else:
                maybe_student = None

            if maybe_student is not None and getattr(maybe_student, 'activo', 1) == 0 and overall_dist is not None and overall_dist <= 0.6:
                # marcar como unknown (no se asigna a ningún estudiante)
                try:
                    filename = f"detection_unknown_{timezone.now().strftime('%Y%m%d%H%M%S%f')}.jpg"
                    det = Detection(timestamp=timezone.now(), confidence=None)
                    if original_bytes:
                        det.image.save(filename, ContentFile(original_bytes), save=False)
                    det.save()
                except Exception:
                    Detection.objects.create(timestamp=timezone.now())

                results.append({
                    "name": None,
                    "career": None,
                    "confidence": None,
                    "box": {
                        "top": loc[0],
                        "right": loc[1],
                        "bottom": loc[2],
                        "left": loc[3],
                    }
                })
                continue

            # si no fue marcado como unknown por corresponder a un inactivo,
            # proceder con la comparación contra activos
            if idx is not None and dist <= 0.6:
                s = students[idx]

                # guardar detection (frame completo)
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
                # unknown
                try:
                    filename = f"detection_unknown_{timezone.now().strftime('%Y%m%d%H%M%S%f')}.jpg"
                    det = Detection(timestamp=timezone.now(), confidence=None)
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
    """
    Devuelve lista de estudiantes (activos e inactivos) para la tabla de administración.
    """
    permission_classes = [AllowAny]

    def get(self, request):
        students = Student.objects.all().order_by('-id')
        return Response(StudentSerializer(students, many=True, context={"request": request}).data)


class StudentDetailAPIView(APIView):
    """
    GET: ver estudiante
    POST: actualizar datos (incluye activo=0/1)
    DELETE: NO elimina -> desactiva
    """
    permission_classes = [AllowAny]

    def _is_admin(self, request):
        u = request.user
        return getattr(u, 'is_authenticated', False) and (
            u.is_superuser or u.groups.filter(name='ADMIN').exists()
        )

    def get(self, request, pk):
        try:
            s = Student.objects.get(pk=pk)
        except Student.DoesNotExist:
            return Response({"error": "Not found"}, status=404)
        return Response(StudentSerializer(s, context={"request": request}).data)

    def post(self, request, pk):
        # ✅ SOLO ADMIN
        if not self._is_admin(request):
            return Response({"error": "No autorizado"}, status=403)

        try:
            s = Student.objects.get(pk=pk)
        except Student.DoesNotExist:
            return Response({"error": "Not found"}, status=404)

        name = request.POST.get('name')
        career = request.POST.get('career')
        correo = request.POST.get('correo')
        activo_val = request.POST.get('activo')
        image = request.FILES.get('image')

        update_fields = {}

        if name is not None:
            update_fields['name'] = name
        if career is not None:
            update_fields['career'] = career
        if correo is not None:
            update_fields['correo'] = correo
        if activo_val is not None:
            try:
                update_fields['activo'] = int(activo_val)
            except Exception:
                pass

        # si NO hay imagen, update directo (no rompe FileField)
        if image is None:
            if update_fields:
                Student.objects.filter(pk=pk).update(**update_fields)
            s = Student.objects.get(pk=pk)
            return Response(StudentSerializer(s, context={"request": request}).data)

        # si HAY imagen, actualizar por instancia
        if 'name' in update_fields:
            s.name = update_fields['name']
        if 'career' in update_fields:
            s.career = update_fields['career']
        if 'correo' in update_fields:
            s.correo = update_fields['correo']
        if 'activo' in update_fields:
            s.activo = update_fields['activo']

        s.image.save(image.name, image, save=False)
        s.save()
        return Response(StudentSerializer(s, context={"request": request}).data)

    def delete(self, request, pk):
        # ✅ SOLO ADMIN
        if not self._is_admin(request):
            return Response({"error": "No autorizado"}, status=403)

        # ✅ NO borrar: desactivar
        if not Student.objects.filter(pk=pk).exists():
            return Response({"error": "Not found"}, status=404)

        Student.objects.filter(pk=pk).update(activo=0)
        return Response({"ok": True, "deactivated": True})


class DetectionListAPIView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        qs = Detection.objects.all()

        # search query (name or career)
        q = request.GET.get('q') or request.GET.get('search')
        if q:
            from django.db.models import Q
            qs = qs.filter(
                Q(recognized_name__icontains=q) | Q(recognized_career__icontains=q)
            )

        # date filtering: expect YYYY-MM-DD
        start = request.GET.get('start')
        end = request.GET.get('end')
        try:
            from django.utils.dateparse import parse_date
            if start:
                sd = parse_date(start)
                if sd:
                    qs = qs.filter(timestamp__date__gte=sd)
            if end:
                ed = parse_date(end)
                if ed:
                    qs = qs.filter(timestamp__date__lte=ed)
        except Exception:
            pass

        # ordering
        qs = qs.order_by('-timestamp')

        # pagination: page & page_size
        try:
            page = max(1, int(request.GET.get('page') or 1))
        except Exception:
            page = 1
        try:
            page_size = int(request.GET.get('page_size') or request.GET.get('limit') or 50)
        except Exception:
            page_size = 50

        total = qs.count()
        total_pages = max(1, (total + page_size - 1) // page_size)
        if page > total_pages:
            page = total_pages

        start = (page - 1) * page_size
        end = start + page_size
        items = list(qs[start:end])

        serialized = DetectionSerializer(items, many=True).data
        return Response({
            'results': serialized,
            'count': total,
            'page': page,
            'page_size': page_size,
            'total_pages': total_pages,
        })


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
        username = request.POST.get("username")
        password = request.POST.get("password")
        email = request.POST.get("email")
        first_name = request.POST.get("first_name")
        last_name = request.POST.get("last_name")

        # create user with basic fields
        user = User.objects.create_user(
            username=username,
            password=password,
            email=email,
            first_name=first_name or '',
            last_name=last_name or '',
        )

        # flags: is_active, is_staff, is_superuser
        is_active = True if request.POST.get('is_active') in ['on', 'true', '1'] else False
        is_staff = True if request.POST.get('is_staff') in ['on', 'true', '1'] else False
        is_superuser = True if request.POST.get('is_superuser') in ['on', 'true', '1'] else False

        user.is_active = is_active
        user.is_staff = is_staff
        user.is_superuser = is_superuser
        user.save()

        group_id = request.POST.get("group")
        if group_id:
            try:
                user.groups.add(Group.objects.get(id=group_id))
            except Exception:
                pass

        messages.success(request, "Usuario creado correctamente")
        return redirect("/create_users/")


class ManageStudentsView(APIView):
    @method_decorator(login_required)
    def get(self, request):
        # Only allow admins
        if not (request.user.is_superuser or request.user.groups.filter(name="ADMIN").exists()):
            return HttpResponseForbidden()
        return render(request, "manage_students.html")


# ==========================
# PASSWORD RESET (OTP)
# ==========================
class RequestPasswordResetAPIView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        return render(request, 'password_forgot.html')

    def post(self, request):
        email = request.POST.get('email') or request.data.get('email')

        # Mensaje no revelador
        msg = 'Si el correo existe, se enviará un código de 6 dígitos para restablecer la contraseña.'

        # intentar buscar user; si no existe, devolvemos el mismo mensaje
        email_norm = (email or '').strip()
        user = User.objects.filter(email__iexact=email_norm).first()
        if not user:
            # no enviar nada si no hay user asociado
            print(f"Password reset requested for non-existent email: {email_norm}")
            return Response({'ok': True, 'message': msg})

        # generar OTP y guardarlo (hash)
        otp = make_otp()
        otp_h = hash_otp(otp)
        expires = timezone.now() + timedelta(minutes=5)

        otp_obj = PasswordResetOTP.objects.create(
            user=user,
            otp_hash=otp_h,
            expires_at=expires,
        )

        # DEBUG: registrar OTP generado (temporal)
        try:
            print(f"DEBUG: OTP created for user={user.email} id={otp_obj.id} otp={otp} otp_hash={otp_h} expires={expires}")
        except Exception:
            pass

        # enviar por Brevo (intentar plantilla si está configurada)
        try:
            print(f"Sending OTP to {user.email} (user_id={user.id})")
            template_id = getattr(settings, 'BREVO_OTP_TEMPLATE_ID', None)
            sent = False
            if template_id:
                sent = send_email_brevo_template(user.email, template_id, params={"OTP": otp, "MINUTOS": "5"})
            else:
                # fallback a mensaje simple
                sent = send_email_brevo(
                    user.email,
                    'Código de restablecimiento',
                    f"<p>Tu código es <strong>{otp}</strong>. Válido 5 minutos.</p>",
                )
            if not sent:
                print(f"Warning: email sending returned False for {user.email}")
        except Exception as e:
            # no fallar la petición por errores en el envío
            print('Error enviando OTP:', e)

        return Response({'ok': True, 'message': msg})


class VerifyOTPAPIView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        return render(request, 'password_verify.html')

    def post(self, request):
        email = request.POST.get('email') or request.data.get('email')
        otp = request.POST.get('otp') or request.data.get('otp')

        if not email or not otp:
            return Response({'ok': False, 'error': 'Email y código requeridos'}, status=400)

        # normalizar OTP: quitar espacios y extraer solo dígitos
        try:
            otp = str(otp).strip()
            otp = ''.join(ch for ch in otp if ch.isdigit())
        except Exception:
            otp = ''

        if not otp:
            return Response({'ok': False, 'error': 'Código inválido'}, status=400)

        # buscar user sin usar get() para evitar MultipleObjectsReturned
        email_norm = email.strip()
        users = User.objects.filter(email__iexact=email_norm)
        if not users.exists():
            return Response({'ok': False, 'error': 'Código inválido o expirado'}, status=400)
        if users.count() > 1:
            try:
                print(f"DEBUG: Multiple users found for email={email_norm} ids={[u.id for u in users]}")
            except Exception:
                pass
        user = users.first()

        qs = PasswordResetOTP.objects.filter(user=user, used=False).order_by('-created_at')
        if not qs.exists():
            return Response({'ok': False, 'error': 'Código inválido o expirado'}, status=400)

        otp_obj = qs.first()
        try:
            print(f"DEBUG: Verifying OTP for user={user.email} found_id={otp_obj.id} used={otp_obj.used} attempts={otp_obj.attempts} expires_at={otp_obj.expires_at} stored_hash={otp_obj.otp_hash}")
            print(f"DEBUG: Provided otp='{otp}' hashed='{hash_otp(otp)}'")
        except Exception:
            pass
        if otp_obj.is_expired():
            otp_obj.used = True
            otp_obj.save()
            return Response({'ok': False, 'error': 'Código inválido o expirado'}, status=400)

        if otp_obj.attempts >= 5:
            otp_obj.used = True
            otp_obj.save()
            return Response({'ok': False, 'error': 'Demasiados intentos'}, status=400)

        if hash_otp(otp) != otp_obj.otp_hash:
            otp_obj.attempts += 1
            if otp_obj.attempts >= 5:
                otp_obj.used = True
            otp_obj.save()
            return Response({'ok': False, 'error': 'Código inválido'}, status=400)

        # OK: marcar usado y devolver token firmado para permitir cambiar contraseña
        otp_obj.used = True
        otp_obj.save()

        token = dumps({'user_id': user.id}, salt='password-reset')
        return Response({'ok': True, 'reset_token': token})


class ResetPasswordAPIView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        return render(request, 'password_reset.html')

    def post(self, request):
        token = request.POST.get('token') or request.data.get('token')
        password = request.POST.get('password') or request.data.get('password')
        password2 = request.POST.get('password2') or request.data.get('password2')

        if not token or not password or not password2:
            return Response({'ok': False, 'error': 'Datos incompletos'}, status=400)

        if password != password2:
            return Response({'ok': False, 'error': 'Las contraseñas no coinciden'}, status=400)

        try:
            data = loads(token, salt='password-reset', max_age=300)
        except SignatureExpired:
            return Response({'ok': False, 'error': 'Token expirado'}, status=400)
        except BadSignature:
            return Response({'ok': False, 'error': 'Token inválido'}, status=400)

        user_id = data.get('user_id')
        try:
            user = User.objects.get(id=user_id)
        except Exception:
            return Response({'ok': False, 'error': 'Usuario no encontrado'}, status=400)

        user.set_password(password)
        user.save()

        # invalidar OTPs anteriores
        PasswordResetOTP.objects.filter(user=user, used=False).update(used=True)

        return Response({'ok': True, 'message': 'Contraseña actualizada'})
