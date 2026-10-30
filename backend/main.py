"""FastAPI entry point for the Petassos Travel Map."""

import csv
import io
from contextlib import asynccontextmanager
from contextlib import closing

from fastapi import APIRouter, Depends, FastAPI, File, HTTPException, Request, Response, UploadFile
from pydantic import AnyHttpUrl, BaseModel, Field

if __package__:
    from .auth import (
        COOKIE_NAME,
        COOKIE_PATH,
        SESSION_LIFETIME_SECONDS,
        AuthPrincipal,
        AuthSettings,
        authenticate,
        create_session,
        load_auth_settings,
        require_superadmin,
        revoke_session,
        session_identity,
    )
    from .database import SUPPORTED_PLACE_LANGUAGES, connect_database, initialize_database, place_translations
    from .images import router as images_router, remove_record_files
    from .sharing import router as sharing_router, public_router as public_sharing_router
    from .zones import router as zones_router
else:
    from auth import (
        COOKIE_NAME,
        COOKIE_PATH,
        SESSION_LIFETIME_SECONDS,
        AuthPrincipal,
        AuthSettings,
        authenticate,
        create_session,
        load_auth_settings,
        require_superadmin,
        revoke_session,
        session_identity,
    )
    from database import SUPPORTED_PLACE_LANGUAGES, connect_database, initialize_database, place_translations
    from images import router as images_router, remove_record_files
    from sharing import router as sharing_router, public_router as public_sharing_router
    from zones import router as zones_router


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


class PlaceTranslation(BaseModel):
    name: str = ""
    description: str = ""
    practical_info: str = ""


def auth_settings(request: Request) -> AuthSettings:
    return request.app.state.auth_settings


def require_admin(
    request: Request, settings: AuthSettings = Depends(auth_settings)
) -> AuthPrincipal:
    principal = session_identity(settings, request.cookies.get(COOKIE_NAME))
    if principal is None:
        raise HTTPException(status_code=401, detail="Admin session required")
    return principal


@app.post("/api/admin/login")
def admin_login(
    credentials: LoginRequest,
    response: Response,
    settings: AuthSettings = Depends(auth_settings),
) -> dict[str, object]:
    principal = authenticate(settings, credentials.username, credentials.password)
    if principal is None:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    response.set_cookie(
        COOKIE_NAME,
        create_session(settings, principal),
        max_age=SESSION_LIFETIME_SECONDS,
        path=COOKIE_PATH,
        secure=settings.cookie_secure,
        httponly=True,
        samesite="lax",
    )
    response.headers["Cache-Control"] = "no-store"
    return {"authenticated": True, "username": principal.username, "role": principal.role}


admin_router = APIRouter(prefix="/api/admin", dependencies=[Depends(require_admin)])


class NewRecord(BaseModel):
    name: str
    category_id: int | None = None
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    description: str = ""
    practical_info: str = ""
    author: str = ""
    link_url: AnyHttpUrl | None = None
    published: bool = False
    translations: dict[str, PlaceTranslation] = Field(default_factory=dict)


class ArchiveInput(BaseModel):
    archived: bool


@admin_router.get("/categories")
def admin_categories() -> list[dict]:
    with closing(connect_database()) as connection:
        rows = connection.execute(
            "SELECT categories.id, categories.name, categories.icon, "
            "COALESCE(parent.color, categories.color) AS color, "
            "categories.parent_id, parent.name AS parent_name, parent.icon AS parent_icon, "
            "COALESCE(parent.marker_style, categories.marker_style) AS marker_style "
            "FROM categories LEFT JOIN categories parent ON parent.id = categories.parent_id "
            "WHERE NOT EXISTS (SELECT 1 FROM categories child WHERE child.parent_id = categories.id) "
            "ORDER BY COALESCE(parent.sort_order, categories.sort_order), "
            "categories.sort_order, categories.id"
        ).fetchall()
    return [dict(row) for row in rows]


def _localized_place_values(record: NewRecord) -> tuple[str, str, str, dict[str, dict[str, str]]]:
    translations = {}
    for language, values in record.translations.items():
        if language not in SUPPORTED_PLACE_LANGUAGES:
            raise HTTPException(status_code=422, detail=f"Unsupported place language: {language}")
        translations[language] = {
            "name": values.name.strip(),
            "description": values.description.strip(),
            "practical_info": values.practical_info.strip(),
        }
    if not translations:
        translations["en"] = {
            "name": record.name.strip(),
            "description": record.description.strip(),
            "practical_info": record.practical_info.strip(),
        }
    if not any(values["name"] for values in translations.values()):
        raise HTTPException(status_code=422, detail="Enter a name in at least one language")
    primary_language = "en" if translations.get("en", {}).get("name") else next(
        language for language in SUPPORTED_PLACE_LANGUAGES if translations.get(language, {}).get("name")
    )
    primary = translations[primary_language]
    return primary["name"], primary["description"], primary["practical_info"], translations


def _records(kind: str, archived: bool = False) -> list[dict]:
    with closing(connect_database()) as connection:
        rows = connection.execute(
            "SELECT places.id, places.kind, places.name, places.description, places.practical_info, places.author, places.link_url, "
            "places.latitude, places.longitude, places.published, places.category_id, places.archived_at, "
            "categories.name AS category_name, parent.name AS category_parent_name, "
            "COALESCE(parent.color, categories.color) AS category_color, "
            "categories.icon AS category_icon, "
            "COALESCE(parent.marker_style, categories.marker_style) AS category_marker_style, "
            "(SELECT id FROM place_images WHERE place_id = places.id ORDER BY sort_order LIMIT 1) AS cover_image_id "
            "FROM places LEFT JOIN categories ON categories.id = places.category_id "
            "LEFT JOIN categories parent ON parent.id = categories.parent_id "
            f"WHERE places.kind = ? AND places.archived_at IS {'NOT ' if archived else ''}NULL "
            "ORDER BY places.id DESC", (kind,)
        ).fetchall()
        records = [dict(row) for row in rows]
        if kind == "PLACE":
            for record in records:
                record["translations"] = place_translations(connection, record["id"])
        return records


def _save_record(kind: str, record: NewRecord, record_id: int | None = None) -> dict:
    if kind == "PLACE":
        name, description, practical_info, translations = _localized_place_values(record)
    else:
        name, description, practical_info, translations = record.name.strip(), record.description.strip(), record.practical_info.strip(), {}
    if not name:
        raise HTTPException(status_code=422, detail="Name is required")
    with closing(connect_database()) as connection, connection:
        if record_id is not None and connection.execute(
            "SELECT 1 FROM places WHERE id = ? AND kind = ? AND archived_at IS NULL", (record_id, kind)
        ).fetchone() is None:
            raise HTTPException(status_code=404, detail="Record not found")
        if kind == "PLACE":
            category = connection.execute(
                "SELECT id FROM categories WHERE id = ? AND NOT EXISTS "
                "(SELECT 1 FROM categories child WHERE child.parent_id = categories.id)",
                (record.category_id,),
            ).fetchone()
            if category is None:
                raise HTTPException(status_code=422, detail="Choose an existing category")
        elif record.category_id is not None or record.published:
            raise HTTPException(status_code=422, detail="Notes cannot have a category or be published")
        values = (
            record.category_id, name, description, practical_info, record.author.strip(),
            str(record.link_url) if record.link_url else None,
            record.latitude, record.longitude, int(record.published),
        )
        if record_id is None:
            cursor = connection.execute(
                "INSERT INTO places "
                "(kind, category_id, name, description, practical_info, author, link_url, latitude, longitude, published) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (kind, *values),
            )
            record_id = cursor.lastrowid
        else:
            connection.execute(
                "UPDATE places SET category_id = ?, name = ?, description = ?, practical_info = ?, author = ?, link_url = ?, "
                "latitude = ?, longitude = ?, published = ?, "
                "updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?",
                (*values, record_id),
            )
        if kind == "PLACE":
            connection.execute("DELETE FROM place_translations WHERE place_id = ?", (record_id,))
            connection.executemany(
                "INSERT INTO place_translations (place_id, language, name, description, practical_info) VALUES (?, ?, ?, ?, ?)",
                [(record_id, language, values["name"], values["description"], values["practical_info"])
                 for language, values in translations.items()],
            )
        row = connection.execute(
            "SELECT places.id, places.kind, places.name, places.description, places.practical_info, places.author, places.link_url, "
            "places.latitude, places.longitude, places.published, places.category_id, places.archived_at, "
            "categories.name AS category_name, parent.name AS category_parent_name, "
            "COALESCE(parent.color, categories.color) AS category_color, "
            "categories.icon AS category_icon, "
            "COALESCE(parent.marker_style, categories.marker_style) AS category_marker_style, "
            "(SELECT id FROM place_images WHERE place_id = places.id ORDER BY sort_order LIMIT 1) AS cover_image_id "
            "FROM places LEFT JOIN categories ON categories.id = places.category_id "
            "LEFT JOIN categories parent ON parent.id = categories.parent_id "
            "WHERE places.id = ?", (record_id,)
        ).fetchone()
        result = dict(row)
        if kind == "PLACE":
            result["translations"] = place_translations(connection, record_id)
    return result


def _delete_record(kind: str, record_id: int) -> None:
    with closing(connect_database()) as connection, connection:
        row = connection.execute(
            "SELECT archived_at FROM places WHERE id = ? AND kind = ?", (record_id, kind)
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Record not found")
        if row["archived_at"] is None:
            raise HTTPException(status_code=409, detail="Archive this record before deleting it permanently")
        filenames = [row["file_path"] for row in connection.execute(
            "SELECT file_path FROM place_images WHERE place_id = ?", (record_id,)
        ).fetchall()]
        cursor = connection.execute(
            "DELETE FROM places WHERE id = ? AND kind = ?", (record_id, kind)
        )
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Record not found")
    remove_record_files(filenames)


def _archive_record(kind: str, record_id: int, archived: bool) -> None:
    with closing(connect_database()) as connection, connection:
        cursor = connection.execute(
            "UPDATE places SET archived_at = "
            "CASE WHEN ? THEN strftime('%Y-%m-%dT%H:%M:%fZ', 'now') ELSE NULL END "
            "WHERE id = ? AND kind = ?", (int(archived), record_id, kind),
        )
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Record not found")


@admin_router.get("/places")
def admin_places(archived: bool = False) -> list[dict]:
    return _records("PLACE", archived)


@admin_router.post("/places", status_code=201)
def admin_create_place(place: NewRecord) -> dict:
    return _save_record("PLACE", place)


def _import_bool(value: str, default: bool = True) -> bool:
    normalized = value.strip().casefold()
    if not normalized:
        return default
    if normalized in {"1", "true", "yes", "y", "oui"}:
        return True
    if normalized in {"0", "false", "no", "n", "non"}:
        return False
    raise ValueError("published must be true or false")


def _find_import_category(connection, category_name: str, subcategory_name: str):
    category_name = category_name.strip()
    subcategory_name = subcategory_name.strip()
    if subcategory_name:
        row = connection.execute(
            "SELECT child.id FROM categories child "
            "LEFT JOIN categories parent ON parent.id = child.parent_id "
            "WHERE child.parent_id IS NOT NULL AND child.name = ? "
            "AND (parent.name = ? OR ? = '')",
            (subcategory_name, category_name, category_name),
        ).fetchone()
        if row is not None:
            return row["id"]
        row = connection.execute(
            "SELECT id FROM categories WHERE parent_id IS NOT NULL AND name = ?",
            (subcategory_name,),
        ).fetchone()
        if row is not None:
            return row["id"]
        raise ValueError(f"subcategory not found: {subcategory_name}")
    row = connection.execute(
        "SELECT id FROM categories WHERE parent_id IS NOT NULL AND name = ?",
        (category_name,),
    ).fetchone()
    if row is not None:
        return row["id"]
    row = connection.execute(
        "SELECT child.id FROM categories child JOIN categories parent ON parent.id = child.parent_id "
        "WHERE parent.name = ? ORDER BY child.sort_order, child.id LIMIT 1",
        (category_name,),
    ).fetchone()
    if row is not None:
        return row["id"]
    raise ValueError(f"category not found: {category_name}")


@admin_router.post("/places/import")
async def admin_import_places(file: UploadFile = File(...)) -> dict:
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=422, detail="Choose a CSV file")
    raw = await file.read()
    try:
        text = raw.decode("utf-8-sig")
        reader = csv.DictReader(io.StringIO(text))
    except UnicodeDecodeError as error:
        raise HTTPException(status_code=422, detail="The CSV file must use UTF-8 encoding") from error
    required = {"name", "description", "practical_info", "category", "subcategory", "author", "link_url", "latitude", "longitude", "published"}
    headers = {header.strip() for header in (reader.fieldnames or []) if header}
    missing = sorted(required - headers)
    if missing:
        raise HTTPException(status_code=422, detail=f"Missing CSV columns: {', '.join(missing)}")

    created = []
    errors = []
    with closing(connect_database()) as connection, connection:
        for line_number, row in enumerate(reader, start=2):
            try:
                name = (row.get("name") or "").strip()
                if not name:
                    raise ValueError("name is required")
                latitude = float((row.get("latitude") or "").strip())
                longitude = float((row.get("longitude") or "").strip())
                if not -90 <= latitude <= 90 or not -180 <= longitude <= 180:
                    raise ValueError("latitude or longitude is out of range")
                link_url = (row.get("link_url") or "").strip() or None
                if link_url and not link_url.lower().startswith(("http://", "https://")):
                    raise ValueError("link_url must start with http:// or https://")
                category_id = _find_import_category(connection, row.get("category") or "", row.get("subcategory") or "")
                published = _import_bool(row.get("published") or "", True)
                cursor = connection.execute(
                    "INSERT INTO places "
                    "(kind, category_id, name, description, practical_info, author, link_url, latitude, longitude, published) "
                    "VALUES ('PLACE', ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (
                        category_id, name, (row.get("description") or "").strip(),
                        (row.get("practical_info") or "").strip(), (row.get("author") or "").strip(),
                        link_url, latitude, longitude, int(published),
                    ),
                )
                created.append({"line": line_number, "id": cursor.lastrowid, "name": name})
                connection.execute(
                    "INSERT INTO place_translations (place_id, language, name, description, practical_info) VALUES (?, 'en', ?, ?, ?)",
                    (cursor.lastrowid, name, (row.get("description") or "").strip(), (row.get("practical_info") or "").strip()),
                )
            except (ValueError, TypeError) as error:
                errors.append({"line": line_number, "name": (row.get("name") or "").strip(), "error": str(error)})
    return {"created": created, "errors": errors, "created_count": len(created), "error_count": len(errors)}


@admin_router.put("/places/{record_id}")
def admin_update_place(record_id: int, place: NewRecord) -> dict:
    return _save_record("PLACE", place, record_id)


@admin_router.patch("/places/{record_id}/archive", status_code=204)
def admin_archive_place(record_id: int, change: ArchiveInput) -> None:
    _archive_record("PLACE", record_id, change.archived)


@admin_router.delete("/places/{record_id}", status_code=204, dependencies=[Depends(require_superadmin)])
def admin_delete_place(record_id: int) -> None:
    _delete_record("PLACE", record_id)


@admin_router.get("/notes")
def admin_notes(archived: bool = False) -> list[dict]:
    return _records("NOTE", archived)


@admin_router.post("/notes", status_code=201)
def admin_create_note(note: NewRecord) -> dict:
    return _save_record("NOTE", note)


@admin_router.put("/notes/{record_id}")
def admin_update_note(record_id: int, note: NewRecord) -> dict:
    return _save_record("NOTE", note, record_id)


@admin_router.patch("/notes/{record_id}/archive", status_code=204)
def admin_archive_note(record_id: int, change: ArchiveInput) -> None:
    _archive_record("NOTE", record_id, change.archived)


@admin_router.delete("/notes/{record_id}", status_code=204, dependencies=[Depends(require_superadmin)])
def admin_delete_note(record_id: int) -> None:
    _delete_record("NOTE", record_id)


@admin_router.get("/session")
def admin_session(response: Response, principal: AuthPrincipal = Depends(require_admin)) -> dict[str, object]:
    response.headers["Cache-Control"] = "no-store"
    return {"authenticated": True, "username": principal.username, "role": principal.role}


@admin_router.post("/logout", status_code=204)
def admin_logout(
    request: Request,
    response: Response,
    settings: AuthSettings = Depends(auth_settings),
) -> None:
    revoke_session(settings, request.cookies.get(COOKIE_NAME))
    response.delete_cookie(COOKIE_NAME, path=COOKIE_PATH)
    response.headers["Cache-Control"] = "no-store"


admin_router.include_router(images_router)
admin_router.include_router(zones_router)
admin_router.include_router(sharing_router)
app.include_router(admin_router)
app.include_router(public_sharing_router)
