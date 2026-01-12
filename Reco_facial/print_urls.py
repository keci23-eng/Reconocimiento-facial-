import os
import sys

# Ensure project root is on path
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'faceapi_server.settings')

import django
django.setup()

from django.urls import reverse

if __name__ == '__main__':
    print(reverse('guard-detections'))
    print(reverse('api-detections'))
