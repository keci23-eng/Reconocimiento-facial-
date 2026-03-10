import secrets
import hashlib


def make_otp():
    """Genera un código OTP de 6 dígitos como string."""
    return f"{secrets.randbelow(1000000):06d}"


def hash_otp(otp: str) -> str:
    """Hash SHA256 del OTP para almacenamiento seguro."""
    return hashlib.sha256(otp.encode("utf-8")).hexdigest()
