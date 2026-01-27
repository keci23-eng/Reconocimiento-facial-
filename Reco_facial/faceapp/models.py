from django.db import models
from django.contrib.auth.models import User


class Student(models.Model):
    name = models.CharField(max_length=200)
    career = models.CharField(max_length=200)
    image = models.ImageField(upload_to='students/')
    encoding = models.TextField(help_text='JSON array of floats for face embedding')
    created_at = models.DateTimeField(null=True, blank=True)

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
