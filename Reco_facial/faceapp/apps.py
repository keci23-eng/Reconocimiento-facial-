from django.apps import AppConfig


class FaceappConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'faceapp'

    def ready(self):
        # Create required groups after migrations have run to avoid
        # accessing the database during app import/initialization.
        from django.db.models.signals import post_migrate

        def _create_groups(sender, **kwargs):
            from django.contrib.auth.models import Group

            for grp in ('ADMIN', 'STUDENT', 'GUARD'):
                Group.objects.get_or_create(name=grp)

        post_migrate.connect(_create_groups, sender=self)
