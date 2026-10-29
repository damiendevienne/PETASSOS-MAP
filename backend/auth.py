"""Superadmin and Admin accounts with revocable, signed cookie sessions."""

import hashlib
import hmac
import os
import secrets
import time
from contextlib import closing
from dataclasses import dataclass, field

from argon2 import PasswordHasher, extract_parameters
from argon2.exceptions import InvalidHashError, VerificationError
from argon2.low_level import Type
from dotenv import load_dotenv
from fastapi import HTTPException, Request
from itsdangerous import BadSignature, URLSafeTimedSerializer

if __package__:
    from .database import PROJECT_ROOT, connect_database
else:
    from database import PROJECT_ROOT, connect_database


COOKIE_NAME = "petassos_admin"
COOKIE_PATH = "/api/admin"
SESSION_LIFETIME_SECONDS = 12 * 60 * 60
PASSWORD_HASHER = PasswordHasher(type=Type.ID)


@dataclass(frozen=True)
class AuthSettings:
    username: str
    password_hash: str = field(repr=False)
    session_secret: str = field(repr=False)
    cookie_secure: bool = True


@dataclass(frozen=True)
class AuthPrincipal:
    username: str
    role: str


def load_auth_settings() -> AuthSettings:
    """Read local configuration and reject missing or unsafe credentials."""
    load_dotenv(PROJECT_ROOT / ".env", override=False)
    username = os.environ.get("ADMIN_USERNAME", "").strip()
    password_hash = os.environ.get("ADMIN_PASSWORD_HASH", "")
    session_secret = os.environ.get("SESSION_SECRET", "")
    secure_value = os.environ.get("SESSION_COOKIE_SECURE", "true").lower()

    if not username:
        raise RuntimeError("ADMIN_USERNAME is required; run setup_admin.py from backend/")
    if not password_hash.startswith("$argon2id$"):
        raise RuntimeError("ADMIN_PASSWORD_HASH must be an Argon2id hash")
    try:
        if extract_parameters(password_hash).type != Type.ID:
            raise RuntimeError("ADMIN_PASSWORD_HASH must use Argon2id")
    except (InvalidHashError, ValueError) as exc:
        raise RuntimeError("ADMIN_PASSWORD_HASH is invalid") from exc
    if len(session_secret) < 32:
        raise RuntimeError("SESSION_SECRET must contain at least 32 characters")
    if secure_value not in {"true", "false"}:
        raise RuntimeError("SESSION_COOKIE_SECURE must be true or false")
    return AuthSettings(
        username=username,
        password_hash=password_hash,
        session_secret=session_secret,
        cookie_secure=(secure_value == "true"),
    )


def credentials_match(settings: AuthSettings, username: str, password: str) -> bool:
    """Run password verification even if the username is wrong."""
    try:
        password_matches = PASSWORD_HASHER.verify(settings.password_hash, password)
    except (VerificationError, InvalidHashError):
        password_matches = False
    return hmac.compare_digest(
        username.encode("utf-8"), settings.username.encode("utf-8")
    ) and password_matches


def authenticate(settings: AuthSettings, username: str, password: str) -> AuthPrincipal | None:
    if credentials_match(settings, username, password):
        return AuthPrincipal(settings.username, "superadmin")
    with closing(connect_database()) as connection:
        row = connection.execute(
            "SELECT username, password_hash FROM admin_accounts WHERE username = ?", (username,)
        ).fetchone()
    if row is None:
        return None
    try:
        PASSWORD_HASHER.verify(row["password_hash"], password)
    except (VerificationError, InvalidHashError):
        return None
    return AuthPrincipal(row["username"], "admin")


def _serializer(settings: AuthSettings) -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(
        settings.session_secret,
        salt="petassos-admin-session",
        signer_kwargs={"digest_method": hashlib.sha256},
    )


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _unsigned_token(settings: AuthSettings, cookie: str) -> str | None:
    try:
        token = _serializer(settings).loads(cookie, max_age=SESSION_LIFETIME_SECONDS)
    except BadSignature:
        return None
    return token if isinstance(token, str) else None


def create_session(settings: AuthSettings, principal: AuthPrincipal) -> str:
    """Store a hash of a random session ID and return its signed cookie value."""
    token = secrets.token_urlsafe(32)
    now = int(time.time())
    with closing(connect_database()) as connection, connection:
        connection.execute("DELETE FROM admin_sessions WHERE expires_at <= ?", (now,))
        connection.execute(
            "INSERT INTO admin_sessions (token_hash, created_at, expires_at, username, role) "
            "VALUES (?, ?, ?, ?, ?)",
            (_token_hash(token), now, now + SESSION_LIFETIME_SECONDS,
             principal.username, principal.role),
        )
    return _serializer(settings).dumps(token)


def session_identity(settings: AuthSettings, cookie: str | None) -> AuthPrincipal | None:
    if not cookie:
        return None
    token = _unsigned_token(settings, cookie)
    if token is None:
        return None
    with closing(connect_database()) as connection:
        row = connection.execute(
            "SELECT username, role FROM admin_sessions WHERE token_hash = ? AND expires_at > ?",
            (_token_hash(token), int(time.time())),
        ).fetchone()
    return AuthPrincipal(row["username"], row["role"]) if row else None


def require_superadmin(request: Request) -> AuthPrincipal:
    principal = session_identity(request.app.state.auth_settings, request.cookies.get(COOKIE_NAME))
    if principal is None:
        raise HTTPException(status_code=401, detail="Admin session required")
    if principal.role != "superadmin":
        raise HTTPException(status_code=403, detail="Superadmin required")
    return principal


def revoke_session(settings: AuthSettings, cookie: str | None) -> None:
    if not cookie:
        return
    token = _unsigned_token(settings, cookie)
    if token is None:
        return
    with closing(connect_database()) as connection, connection:
        connection.execute(
            "DELETE FROM admin_sessions WHERE token_hash = ?",
            (_token_hash(token),),
        )
