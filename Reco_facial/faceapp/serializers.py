from rest_framework import serializers
from django.conf import settings
from .models import Student, Detection

from urllib.parse import urljoin


class StudentSerializer(serializers.ModelSerializer):
    # return a URL string for the image, robust to bytes or unexpected storage
    image = serializers.SerializerMethodField()

    class Meta:
        model = Student
        fields = ['id', 'name', 'career', 'correo', 'image']

    def get_image(self, obj):
        try:
            val = getattr(obj, 'image', None)
            # handle bytes stored directly on field
            if isinstance(val, (bytes, bytearray)):
                name = val.decode()
            else:
                name = getattr(val, 'name', None) or (val if isinstance(val, str) else None)

            if not name:
                return None

            # build relative URL
            rel = name.lstrip('/')
            media_url = settings.MEDIA_URL or '/media/'
            # ensure single slash join
            url = media_url.rstrip('/') + '/' + rel
            req = self.context.get('request')
            if req:
                return req.build_absolute_uri(url)
            return url
        except Exception:
            return None


class DetectionSerializer(serializers.ModelSerializer):
    image = serializers.SerializerMethodField()

    class Meta:
        model = Detection
        fields = ['id', 'student', 'timestamp', 'image', 'recognized_name', 'recognized_career', 'confidence']

    def get_image(self, obj):
        try:
            val = getattr(obj, 'image', None)
            if isinstance(val, (bytes, bytearray)):
                name = val.decode()
            else:
                name = getattr(val, 'name', None) or (val if isinstance(val, str) else None)
            if not name:
                return None
            rel = name.lstrip('/')
            media_url = settings.MEDIA_URL or '/media/'
            url = media_url.rstrip('/') + '/' + rel
            req = self.context.get('request')
            if req:
                return req.build_absolute_uri(url)
            return url
        except Exception:
            return None
