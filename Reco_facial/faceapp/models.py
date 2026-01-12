from django.db import models


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
