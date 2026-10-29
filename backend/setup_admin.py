"""Create a private local .env with the initial Superadmin account."""

import getpass
import os
import re
import secrets

from argon2 import PasswordHasher
from argon2.low_level import Type

from database import PROJECT_ROOT


def main() -> None:
    env_path = PROJECT_ROOT / ".env"
    if env_path.exists():
        raise SystemExit(".env already exists; refusing to overwrite it")

    username = input("Superadmin username [admin]: ").strip() or "admin"
    if not re.fullmatch(r"[A-Za-z0-9._-]+", username):
        raise SystemExit("Username may contain letters, digits, dot, underscore or hyphen")

    password = getpass.getpass("Superadmin password (at least 5 characters): ")
    if len(password) < 5:
        raise SystemExit("Password must contain at least 5 characters")
    if getpass.getpass("Confirm password: ") != password:
        raise SystemExit("Passwords do not match")

    password_hash = PasswordHasher(type=Type.ID).hash(password)
    session_secret = secrets.token_urlsafe(32)
    content = (
        f"ADMIN_USERNAME={username}\n"
        f"ADMIN_PASSWORD_HASH={password_hash}\n"
        f"SESSION_SECRET={session_secret}\n"
        "SESSION_COOKIE_SECURE=false\n"
    )
    try:
        descriptor = os.open(env_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    except FileExistsError:
        raise SystemExit(".env already exists; refusing to overwrite it") from None
    with os.fdopen(descriptor, "w", encoding="utf-8") as file:
        file.write(content)
    print("Superadmin configuration saved to ../.env")


if __name__ == "__main__":
    main()
