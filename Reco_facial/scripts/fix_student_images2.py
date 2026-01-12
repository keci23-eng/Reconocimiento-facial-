from faceapp.models import Student

changed = 0
for s in Student.objects.all():
    val = s.image
    # handle direct bytes stored on the field
    if isinstance(val, (bytes, bytearray)):
        name = val.decode()
        Student.objects.filter(pk=s.pk).update(image=name)
        changed += 1
        print('updated_field_bytes', s.pk)
        continue

    name = getattr(val, 'name', None)
    if isinstance(name, (bytes, bytearray)):
        Student.objects.filter(pk=s.pk).update(image=name.decode())
        changed += 1
        print('updated_name_bytes', s.pk)
    elif isinstance(name, str) and name.startswith("b'") and name.endswith("'"):
        Student.objects.filter(pk=s.pk).update(image=name[2:-1])
        changed += 1
        print('updated_name_str', s.pk)

print('total_fixed', changed)
