from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('faceapp', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='student',
            name='correo',
            field=models.EmailField(max_length=254, null=True, blank=True),
        ),
    ]
