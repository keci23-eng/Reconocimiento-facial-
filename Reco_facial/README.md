# Face recognition Django server (prototype)

Este repositorio contiene un prototipo de servidor Django que usa `face_recognition` y `opencv` para registro y detección facial. Incluye una interfaz Bootstrap mínima que captura la cámara y llama a endpoints REST.

Requisitos (Windows):
- Python 3.10+
- Visual C++ Build Tools (para compilar dlib/face_recognition)
- MySQL + phpMyAdmin (opcional)

Instalación rápida (recomendada en virtualenv):

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
# editar faceapi_server/settings.py para configurar la BD
python manage.py migrate
python manage.py runserver
```

Notas:
- En Windows la instalación de `face_recognition` puede requerir pasos adicionales (compilar dlib). Alternativa: ejecutar este servidor en WSL2 o en un contenedor Linux.
