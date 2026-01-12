import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'faceapi_server.settings')
django.setup()

from django.contrib.auth.models import User, Group

def ensure_group(name):
    g, _ = Group.objects.get_or_create(name=name)
    return g

def create_user(username, email, password, group_name, is_staff=False, is_superuser=False):
    if User.objects.filter(username=username).exists():
        print(f"User '{username}' already exists")
        return User.objects.get(username=username)
    u = User.objects.create_user(username=username, email=email, password=password)
    u.is_staff = is_staff
    u.is_superuser = is_superuser
    u.save()
    g = ensure_group(group_name)
    g.user_set.add(u)
    print(f"Created user '{username}' and added to group '{group_name}'")
    return u

def main():
    # Create groups explicitly (apps.ready also does this, but ensure here)
    for g in ('ADMIN', 'STUDENT', 'GUARD'):
        ensure_group(g)

    # Create one user for each role
    create_user('admin_user', 'admin@example.com', 'AdminPass123!', 'ADMIN', is_staff=True, is_superuser=True)
    create_user('guard_user', 'guard@example.com', 'GuardPass123!', 'GUARD')
    create_user('student_user', 'student@example.com', 'StudentPass123!', 'STUDENT')

if __name__ == '__main__':
    main()
