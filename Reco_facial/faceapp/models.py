from django.db import models
from django.contrib.auth.models import User
from django.utils import timezone


class Student(models.Model):
    name = models.CharField(max_length=200)
    career = models.CharField(max_length=200)
    correo = models.EmailField(max_length=254, null=True, blank=True)
    image = models.ImageField(upload_to='students/')
    encoding = models.TextField(help_text='JSON array of floats for face embedding')
    created_at = models.DateTimeField(null=True, blank=True)
    # 1 = activo, 0 = inactivo
    activo = models.SmallIntegerField(default=1, help_text='1 = activo, 0 = inactivo', db_index=True)

    def __str__(self):
        return f"{self.name} ({self.career})"


class Detection(models.Model):
    student = models.ForeignKey(Student, null=True, blank=True, on_delete=models.SET_NULL)
    timestamp = models.DateTimeField(null=True, blank=True)
    image = models.ImageField(upload_to='detections/')
    recognized_name = models.CharField(max_length=200, null=True, blank=True)
    recognized_career = models.CharField(max_length=200, null=True, blank=True)
    confidence = models.FloatField(null=True, blank=True)

    def __str__(self):
        return f"Detection {self.id} @ {self.timestamp} -> {self.recognized_name or 'Unknown'}"


class Consentimiento(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='consentimiento')
    username = models.CharField(max_length=150)
    accepted = models.BooleanField(default=False)
    accepted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'consentimiento'

    def __str__(self):
        return f"Consentimiento: {self.username} - {'Aceptado' if self.accepted else 'No aceptado'}"


class PasswordResetOTP(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    otp_hash = models.CharField(max_length=128)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    attempts = models.IntegerField(default=0)
    used = models.BooleanField(default=False)

    def is_expired(self):
        return timezone.now() > self.expires_at

    def __str__(self):
        return f"PasswordResetOTP(user={self.user.username}, used={self.used}, expires_at={self.expires_at})"
