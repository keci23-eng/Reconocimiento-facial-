import requests
from django.conf import settings


def send_email_brevo(to_email, subject, html_content):
    url = "https://api.brevo.com/v3/smtp/email"

    payload = {
        "sender": {
            "name": settings.BREVO_SENDER_NAME,
            "email": settings.BREVO_SENDER_EMAIL,
        },
        "to": [{"email": to_email}],
        "subject": subject,
        "htmlContent": html_content,
    }

    headers = {
        "accept": "application/json",
        "api-key": settings.BREVO_API_KEY,
        "content-type": "application/json",
    }

    response = requests.post(url, json=payload, headers=headers)

    if response.status_code >= 400:
        print("❌ Error Brevo:", response.status_code, response.text)
        return False

    print("✅ Email enviado con Brevo")
    return True


def send_email_brevo_template(to_email, template_id, params):
    """
    Envía un correo usando una plantilla (template) transaccional de Brevo.
    template_id: int (por ejemplo 2)
    params: dict (por ejemplo {"NOMBRE": "Juan"})
    """
    url = "https://api.brevo.com/v3/smtp/email"

    payload = {
        "sender": {
            "name": settings.BREVO_SENDER_NAME,
            "email": settings.BREVO_SENDER_EMAIL,
        },
        "to": [{"email": to_email}],
        "templateId": int(template_id),
        "params": params,
    }

    headers = {
        "accept": "application/json",
        "api-key": settings.BREVO_API_KEY,
        "content-type": "application/json",
    }

    response = requests.post(url, json=payload, headers=headers)

    if response.status_code >= 400:
        print("❌ Error Brevo Template:", response.status_code, response.text)
        return False

    print("✅ Email template enviado con Brevo")
    return True