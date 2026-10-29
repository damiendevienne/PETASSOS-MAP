"""Create, reset or remove an Admin login from backend/."""

import argparse
import getpass
import re
from contextlib import closing

from argon2 import PasswordHasher
from argon2.low_level import Type

from auth import load_auth_settings
from database import connect_database, initialize_database


def main() -> None:
    parser = argparse.ArgumentParser(description="Manage Admin logins; the .env account is Superadmin")
    parser.add_argument("action", choices=("add", "reset", "remove"))
    parser.add_argument("username")
    args = parser.parse_args()
    settings = load_auth_settings()
    initialize_database()
    if not re.fullmatch(r"[A-Za-z0-9._-]+", args.username):
        raise SystemExit("Username may contain letters, digits, dot, underscore or hyphen")
    if args.username.casefold() == settings.username.casefold():
        raise SystemExit("This is the Superadmin login; use change_password.py instead")

    password_hash = None
    if args.action != "remove":
        password = getpass.getpass("Admin password (at least 5 characters): ")
        if len(password) < 5:
            raise SystemExit("Password must contain at least 5 characters")
        if getpass.getpass("Confirm password: ") != password:
            raise SystemExit("Passwords do not match")
        password_hash = PasswordHasher(type=Type.ID).hash(password)

    with closing(connect_database()) as connection, connection:
        existing = connection.execute(
            "SELECT username FROM admin_accounts WHERE username = ?", (args.username,)
        ).fetchone()
        if args.action == "add":
            if existing:
                raise SystemExit("Admin already exists; use reset to change its password")
            connection.execute(
                "INSERT INTO admin_accounts (username, password_hash) VALUES (?, ?)",
                (args.username, password_hash),
            )
        else:
            if not existing:
                raise SystemExit("Admin not found")
            if args.action == "reset":
                connection.execute(
                    "UPDATE admin_accounts SET password_hash = ? WHERE username = ?",
                    (password_hash, args.username),
                )
            else:
                connection.execute("DELETE FROM admin_accounts WHERE username = ?", (args.username,))
            connection.execute(
                "DELETE FROM admin_sessions WHERE role = 'admin' AND username = ?",
                (existing["username"],),
            )
    print(f"Admin {args.username}: {args.action} complete")


if __name__ == "__main__":
    main()
