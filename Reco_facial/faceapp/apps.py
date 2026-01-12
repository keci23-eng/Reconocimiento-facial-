from django.apps import AppConfig


class FaceappConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'faceapp'

    def ready(self):
        # Ensure required groups exist
        from django.contrib.auth.models import Group

        for grp in ('ADMIN', 'STUDENT', 'GUARD'):
            Group.objects.get_or_create(name=grp)
