import os
import sys
# ensure project root is on sys.path when script is run from scripts/
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE','faceapi_server.settings')
import django
django.setup()
from django.db import connection

sql1 = '''CREATE TABLE IF NOT EXISTS `consentimiento` (
  `id` bigint AUTO_INCREMENT NOT NULL PRIMARY KEY,
  `username` varchar(150) NOT NULL,
  `accepted` bool NOT NULL,
  `accepted_at` datetime(6) NULL,
  `user_id` bigint NOT NULL UNIQUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;'''

sql2 = '''ALTER TABLE `consentimiento`
  ADD CONSTRAINT `consentimiento_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `auth_user` (`id`);'''

with connection.cursor() as cur:
    cur.execute(sql1)
    try:
        cur.execute(sql2)
    except Exception as e:
        # foreign key may already exist or fail if auth_user missing
        print('FK error (ignored):', e)

print('consentimiento table ensured')
