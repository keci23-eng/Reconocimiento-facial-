from faceapp.models import Student

changed = 0
for s in Student.objects.all():
    val = s.image
    try:
        # If the field object itself is bytes (unexpected), decode and assign
        if isinstance(val, (bytes, bytearray)):
            s.image = val.decode()
            s.save(update_fields=['image'])
            changed += 1
            print('fixed_field_bytes', s.id)
            continue

        # If the FieldFile has a .name attribute
        name = getattr(val, 'name', None)
        if isinstance(name, (bytes, bytearray)):
            s.image.name = name.decode()
            s.save(update_fields=['image'])
            changed += 1
            print('fixed_name_bytes', s.id)
        elif isinstance(name, str) and name.startswith("b'") and name.endswith("'"):
            s.image.name = name[2:-1]
            s.save(update_fields=['image'])
            changed += 1
            print('fixed_name_str', s.id)
    except Exception as e:
        print('error_fixing', s.id, type(e).__name__, str(e))

print('total_fixed', changed)
