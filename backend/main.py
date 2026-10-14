"""FastAPI entry point for the Petassos Travel Map."""

from contextlib import asynccontextmanager
from contextlib import closing

from fastapi import APIRouter, Depends, FastAPI, HTTPException, Request, Response
from pydantic import BaseModel, Field

if __package__:
    from .auth import (
        COOKIE_NAME,
        COOKIE_PATH,
        SESSION_LIFETIME_SECONDS,
        AuthSettings,
        create_session,
        credentials_match,
        load_auth_settings,
        revoke_session,
        session_is_valid,
    )
    from .database import connect_database, initialize_database
else:
    from auth import (
        COOKIE_NAME,
        COOKIE_PATH,
        SESSION_LIFETIME_SECONDS,
        AuthSettings,
        create_session,
        credentials_match,
        load_auth_settings,
        revoke_session,
        session_is_valid,
    )
    from database import connect_database, initialize_database


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.auth_settings = load_auth_settings()
    initialize_database()
    yield


app = FastAPI(title="Petassos Travel Map API", lifespan=lifespan)


@app.get("/api/health")
def health() -> dict[str, str]:
    """A small end-to-end check for the first development step."""
    return {"status": "ok"}


class LoginRequest(BaseModel):
    username: str
    password: str


def auth_settings(request: Request) -> AuthSettings:
    return request.app.state.auth_settings


def require_admin(
    request: Request, settings: AuthSettings = Depends(auth_settings)
) -> str:
    if not session_is_valid(settings, request.cookies.get(COOKIE_NAME)):
        raise HTTPException(status_code=401, detail="Admin session required")
    return settings.username


@app.post("/api/admin/login")
def admin_login(
    credentials: LoginRequest,
    response: Response,
    settings: AuthSettings = Depends(auth_settings),
) -> dict[str, object]:
    if not credentials_match(settings, credentials.username, credentials.password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    response.set_cookie(
        COOKIE_NAME,
        create_session(settings),
        max_age=SESSION_LIFETIME_SECONDS,
        path=COOKIE_PATH,
        secure=settings.cookie_secure,
        httponly=True,
        samesite="lax",
    )
    response.headers["Cache-Control"] = "no-store"
    return {"authenticated": True, "username": settings.username}


admin_router = APIRouter(prefix="/api/admin", dependencies=[Depends(require_admin)])


class NewRecord(BaseModel):
    name: str
    category_id: int | None = None
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    description: str = ""
    author: str = ""
    published: bool = False


@admin_router.get("/categories")
def admin_categories() -> list[dict]:
    with closing(connect_database()) as connection:
        rows = connection.execute(
            "SELECT id, name, icon, color FROM categories ORDER BY name"
        ).fetchall()
    return [dict(row) for row in rows]


def _records(kind: str) -> list[dict]:
    with closing(connect_database()) as connection:
        rows = connection.execute(
            "SELECT places.id, places.kind, places.name, places.description, places.author, "
            "places.latitude, places.longitude, places.published, places.category_id, "
            "categories.name AS category_name, categories.color AS category_color, "
            "categories.icon AS category_icon "
            "FROM places LEFT JOIN categories ON categories.id = places.category_id "
            "WHERE places.kind = ? ORDER BY places.id DESC", (kind,)
        ).fetchall()
    return [dict(row) for row in rows]


def _save_record(kind: str, record: NewRecord, record_id: int | None = None) -> dict:
    name = record.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="Name is required")
    with closing(connect_database()) as connection, connection:
        if record_id is not None and connection.execute(
            "SELECT 1 FROM places WHERE id = ? AND kind = ?", (record_id, kind)
        ).fetchone() is None:
            raise HTTPException(status_code=404, detail="Record not found")
        if kind == "PLACE":
            category = connection.execute(
                "SELECT id FROM categories WHERE id = ?", (record.category_id,)
            ).fetchone()
            if category is None:
                raise HTTPException(status_code=422, detail="Choose an existing category")
        elif record.category_id is not None or record.published:
            raise HTTPException(status_code=422, detail="Notes cannot have a category or be published")
        values = (
            record.category_id, name, record.description.strip(), record.author.strip(),
            record.latitude, record.longitude, int(record.published),
        )
        if record_id is None:
            cursor = connection.execute(
                "INSERT INTO places "
                "(kind, category_id, name, description, author, latitude, longitude, published) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (kind, *values),
            )
            record_id = cursor.lastrowid
        else:
            connection.execute(
                "UPDATE places SET category_id = ?, name = ?, description = ?, author = ?, "
                "latitude = ?, longitude = ?, published = ?, "
                "updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?",
                (*values, record_id),
            )
        row = connection.execute(
            "SELECT places.id, places.kind, places.name, places.description, places.author, "
            "places.latitude, places.longitude, places.published, places.category_id, "
            "categories.name AS category_name, categories.color AS category_color, "
            "categories.icon AS category_icon "
            "FROM places LEFT JOIN categories ON categories.id = places.category_id "
            "WHERE places.id = ?", (record_id,)
        ).fetchone()
    return dict(row)


def _delete_record(kind: str, record_id: int) -> None:
    with closing(connect_database()) as connection, connection:
        cursor = connection.execute(
            "DELETE FROM places WHERE id = ? AND kind = ?", (record_id, kind)
        )
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Record not found")


@admin_router.get("/places")
def admin_places() -> list[dict]:
    return _records("PLACE")


@admin_router.post("/places", status_code=201)
def admin_create_place(place: NewRecord) -> dict:
    return _save_record("PLACE", place)


@admin_router.put("/places/{record_id}")
def admin_update_place(record_id: int, place: NewRecord) -> dict:
    return _save_record("PLACE", place, record_id)


@admin_router.delete("/places/{record_id}", status_code=204)
def admin_delete_place(record_id: int) -> None:
    _delete_record("PLACE", record_id)


@admin_router.get("/notes")
def admin_notes() -> list[dict]:
    return _records("NOTE")


@admin_router.post("/notes", status_code=201)
def admin_create_note(note: NewRecord) -> dict:
    return _save_record("NOTE", note)


@admin_router.put("/notes/{record_id}")
def admin_update_note(record_id: int, note: NewRecord) -> dict:
    return _save_record("NOTE", note, record_id)


@admin_router.delete("/notes/{record_id}", status_code=204)
def admin_delete_note(record_id: int) -> None:
    _delete_record("NOTE", record_id)


@admin_router.get("/session")
def admin_session(response: Response, username: str = Depends(require_admin)) -> dict[str, object]:
    response.headers["Cache-Control"] = "no-store"
    return {"authenticated": True, "username": username}


@admin_router.post("/logout", status_code=204)
def admin_logout(
    request: Request,
    response: Response,
    settings: AuthSettings = Depends(auth_settings),
) -> None:
    revoke_session(settings, request.cookies.get(COOKIE_NAME))
    response.delete_cookie(COOKIE_NAME, path=COOKIE_PATH)
    response.headers["Cache-Control"] = "no-store"


app.include_router(admin_router)
