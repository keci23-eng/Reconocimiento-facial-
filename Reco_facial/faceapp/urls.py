from django.urls import path
from django.views.generic.base import RedirectView, TemplateView
from .views import (
    IndexView, RegisterStudentAPIView, DetectAPIView, StudentListAPIView,
    LoginView, LogoutView, StudentDashboardView, GuardView, ConsentView
   , GuardDetectionsView, DetectionListAPIView,
)
from .views import CreateUserView

urlpatterns = [
    path('', RedirectView.as_view(url='/login/', permanent=False)),
    path('app/', IndexView.as_view(), name='app-index'),
    # keep /register/ reachable but redirect to the upload-only page
    path('register/', RedirectView.as_view(url='/register/upload/', permanent=False)),
    # serve upload form for admins to register students via file upload
    path('register/upload/', TemplateView.as_view(template_name='student_upload.html')),
   
    path('login/', LoginView.as_view(), name='login'),
    path('consentimiento/', ConsentView.as_view(), name='consentimiento'),
    path('logout/', LogoutView.as_view(), name='logout'),
    path('student/', StudentDashboardView.as_view(), name='student-dashboard'),
    path('guard/', GuardView.as_view(), name='guard-view'),
    path('guard/detections/', GuardDetectionsView.as_view(), name='guard-detections'),
    path('create_users/', CreateUserView.as_view(), name='create-users'),
    path('api/register/', RegisterStudentAPIView.as_view(), name='api-register'),
    path('api/detect/', DetectAPIView.as_view(), name='api-detect'),
    path('api/detections/', DetectionListAPIView.as_view(), name='api-detections'),
    path('api/students/', StudentListAPIView.as_view(), name='api-students'),
    
]
