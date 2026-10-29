"""Change the local Superadmin password and invalidate existing sessions."""

import getpass
import os
import secrets

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from argon2.low_level import Type
from dotenv import dotenv_values, set_key

from database import PROJECT_ROOT


def main() -> None:
    env_path = PROJECT_ROOT / ".env"
    if not env_path.is_file():
        raise SystemExit("No ../.env found; run setup_admin.py first")

    password_hash = dotenv_values(env_path).get("ADMIN_PASSWORD_HASH")
    if not password_hash:
        raise SystemExit("ADMIN_PASSWORD_HASH is missing from ../.env")

    hasher = PasswordHasher(type=Type.ID)
    current_password = getpass.getpass("Current Superadmin password: ")
    try:
        hasher.verify(password_hash, current_password)
    except (VerificationError, InvalidHashError):
        raise SystemExit("Current password is incorrect") from None

    new_password = getpass.getpass("New password (at least 5 characters): ")
    if len(new_password) < 5:
        raise SystemExit("Password must contain at least 5 characters")
    if getpass.getpass("Confirm new password: ") != new_password:
        raise SystemExit("Passwords do not match")

    # Rotating the signing secret makes all existing cookies unusable after restart.
    set_key(env_path, "SESSION_SECRET", secrets.token_urlsafe(32), quote_mode="never")
    set_key(env_path, "ADMIN_PASSWORD_HASH", hasher.hash(new_password), quote_mode="never")
    os.chmod(env_path, 0o600)
    print("Superadmin password changed. Restart the backend to apply it.")


if __name__ == "__main__":
    main()
