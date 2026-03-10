from django.urls import path
from django.views.generic.base import RedirectView
from django.views.generic.base import RedirectView
from .views import (
    IndexView, RegisterStudentAPIView, DetectAPIView, StudentListAPIView,
    LoginView, LogoutView, StudentDashboardView, GuardView, ConsentView
   , GuardDetectionsView, DetectionListAPIView,
    StudentUploadView,
    RequestPasswordResetAPIView, VerifyOTPAPIView, ResetPasswordAPIView,
)
from .views import CreateUserView
from .views import StudentDetailAPIView, ManageStudentsView, AdminDetectionsView
from .views import StudentDetailAPIView

urlpatterns = [
    path('', RedirectView.as_view(url='/login/', permanent=False)),
    path('app/', IndexView.as_view(), name='app-index'),
    # keep /register/ reachable but redirect to the upload-only page
    path('register/', RedirectView.as_view(url='/register/upload/', permanent=False)),
    # serve upload form for admins to register students via file upload
    path('register/upload/', StudentUploadView.as_view()),
   
    path('login/', LoginView.as_view(), name='login'),
    path('consentimiento/', ConsentView.as_view(), name='consentimiento'),
    path('logout/', LogoutView.as_view(), name='logout'),
    path('student/', StudentDashboardView.as_view(), name='student-dashboard'),
    path('guard/', GuardView.as_view(), name='guard-view'),
    path('guard/detections/', GuardDetectionsView.as_view(), name='guard-detections'),
    path('create_users/', CreateUserView.as_view(), name='create-users'),
    path('api/register/', RegisterStudentAPIView.as_view(), name='api-register'),
    path('api/detect/', DetectAPIView.as_view(), name='api-detect'),
    path('password/forgot/', RequestPasswordResetAPIView.as_view(), name='password-forgot'),
    path('password/verify-otp/', VerifyOTPAPIView.as_view(), name='password-verify-otp'),
    # backward-compatible redirect for older links / caches
    path('password/verify/', RedirectView.as_view(url='/password/verify-otp/', permanent=False)),
    path('password/reset/', ResetPasswordAPIView.as_view(), name='password-reset'),
    path('password/reset', RedirectView.as_view(url='/password/reset/', permanent=False)),
    path('api/detections/', DetectionListAPIView.as_view(), name='api-detections'),
    path('api/students/', StudentListAPIView.as_view(), name='api-students'),
    path('api/students/<int:pk>/', StudentDetailAPIView.as_view(), name='api-student-detail'),
    path('manage_students/', ManageStudentsView.as_view(), name='manage-students'),
    path('app/detections/', AdminDetectionsView.as_view(), name='admin-detections'),
    
]
