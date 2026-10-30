"""Editable rectangular zones used by Admin and future shared maps."""

import sqlite3
from contextlib import closing

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

if __package__:
    from .auth import require_superadmin
    from .database import SUPPORTED_ZONE_LANGUAGES, connect_database, zone_translations
else:
    from auth import require_superadmin
    from database import SUPPORTED_ZONE_LANGUAGES, connect_database, zone_translations


router = APIRouter()


class ZoneTranslation(BaseModel):
    about_title: str = ""
    about_text: str = ""


class ZoneInput(BaseModel):
    name: str
    about_title: str = ""
    about_text: str = ""
    translations: dict[str, "ZoneTranslation"] = Field(default_factory=dict)
    locked: bool | None = None
    min_lat: float = Field(ge=-90, le=90)
    max_lat: float = Field(ge=-90, le=90)
    min_lon: float = Field(ge=-180, le=180)
    max_lon: float = Field(ge=-180, le=180)


class ArchiveInput(BaseModel):
    archived: bool


def _localized_values(zone: ZoneInput) -> tuple[str, str, str, dict[str, dict[str, str]]]:
    translations = {}
    for language, values in zone.translations.items():
        if language not in SUPPORTED_ZONE_LANGUAGES:
            raise HTTPException(status_code=422, detail=f"Unsupported zone language: {language}")
        translations[language] = {"about_title": values.about_title.strip(), "about_text": values.about_text.strip()}
    if not translations:
        translations["en"] = {"about_title": zone.about_title.strip(), "about_text": zone.about_text.strip()}
    name = zone.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="Enter a name")
    for values in translations.values():
        if bool(values["about_title"]) != bool(values["about_text"]):
            raise HTTPException(status_code=422, detail="Enter both an About title and text in each language, or leave both empty")
    primary = translations.get("en", translations[next(iter(translations))])
    return name, primary["about_title"], primary["about_text"], translations


def _values(zone: ZoneInput) -> tuple:
    name, about_title, about_text, _ = _localized_values(zone)
    if zone.min_lat >= zone.max_lat or zone.min_lon >= zone.max_lon:
        raise HTTPException(status_code=422, detail="Enter a name and valid rectangle")
    return name, about_title, about_text, zone.min_lat, zone.max_lat, zone.min_lon, zone.max_lon


def _check_name(connection, name: str, zone_id: int | None = None) -> None:
    rows = connection.execute("SELECT id, name FROM zones").fetchall()
    if any(row["id"] != zone_id and row["name"].strip().casefold() == name.casefold() for row in rows):
        raise HTTPException(status_code=409, detail="A zone with this name already exists")


def _zone(connection, zone_id: int) -> dict:
    row = connection.execute(
        "SELECT zones.*, "
        "(SELECT COUNT(*) FROM share_link_zones WHERE zone_id = zones.id) AS used_by_count "
        "FROM zones WHERE zones.id = ?", (zone_id,)
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Zone not found")
    zone = dict(row)
    zone["can_edit"] = zone["archived_at"] is None
    zone["can_archive"] = zone["archived_at"] is None and zone["used_by_count"] == 0
    zone["can_delete"] = zone["archived_at"] is not None and zone["used_by_count"] == 0
    zone["translations"] = zone_translations(connection, zone_id)
    return zone


@router.get("/zones")
def list_zones(archived: bool = False) -> list[dict]:
    with closing(connect_database()) as connection:
        rows = connection.execute(
            f"SELECT id FROM zones WHERE archived_at IS {'NOT ' if archived else ''}NULL "
            "ORDER BY name COLLATE NOCASE, id"
        ).fetchall()
        return [_zone(connection, row["id"]) for row in rows]


@router.post("/zones", status_code=201)
def create_zone(zone: ZoneInput, request: Request) -> dict:
    try:
        with closing(connect_database()) as connection, connection:
            if zone.locked:
                require_superadmin(request)
            values = _values(zone)
            _, _, _, translations = _localized_values(zone)
            _check_name(connection, values[0])
            cursor = connection.execute(
                "INSERT INTO zones (name, about_title, about_text, min_lat, max_lat, min_lon, max_lon, locked) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (*values, int(bool(zone.locked))),
            )
            connection.executemany(
                "INSERT INTO zone_translations (zone_id, language, name, about_title, about_text) VALUES (?, ?, ?, ?, ?)",
                [(cursor.lastrowid, language, values[0], localized["about_title"], localized["about_text"])
                 for language, localized in translations.items()],
            )
            return _zone(connection, cursor.lastrowid)
    except sqlite3.IntegrityError as exc:
        raise HTTPException(status_code=409, detail="A zone with this name already exists") from exc


@router.put("/zones/{zone_id}")
def update_zone(zone_id: int, zone: ZoneInput, request: Request) -> dict:
    try:
        with closing(connect_database()) as connection, connection:
            existing = _zone(connection, zone_id)
            if not existing["can_edit"]:
                raise HTTPException(status_code=409, detail="Restore this zone before editing it")
            locked = bool(existing["locked"]) if zone.locked is None else zone.locked
            bounds_changed = any(getattr(zone, key) != existing[key] for key in ("min_lat", "max_lat", "min_lon", "max_lon"))
            name_changed = zone.name.strip() != existing["name"]
            if locked != bool(existing["locked"]) or (existing["locked"] and (bounds_changed or name_changed)):
                require_superadmin(request)
            values = _values(zone)
            _, _, _, translations = _localized_values(zone)
            _check_name(connection, values[0], zone_id)
            connection.execute(
                "UPDATE zones SET name = ?, about_title = ?, about_text = ?, "
                "min_lat = ?, max_lat = ?, min_lon = ?, max_lon = ?, locked = ? WHERE id = ?",
                (*values, int(locked), zone_id),
            )
            connection.execute("DELETE FROM zone_translations WHERE zone_id = ?", (zone_id,))
            connection.executemany(
                "INSERT INTO zone_translations (zone_id, language, name, about_title, about_text) VALUES (?, ?, ?, ?, ?)",
                [(zone_id, language, values[0], localized["about_title"], localized["about_text"])
                 for language, localized in translations.items()],
            )
            return _zone(connection, zone_id)
    except sqlite3.IntegrityError as exc:
        raise HTTPException(status_code=409, detail="A zone with this name already exists") from exc


@router.patch("/zones/{zone_id}/archive", status_code=204)
def archive_zone(zone_id: int, change: ArchiveInput) -> None:
    with closing(connect_database()) as connection, connection:
        zone = _zone(connection, zone_id)
        if change.archived and zone["used_by_count"]:
            raise HTTPException(status_code=409, detail="Remove this zone from shared maps before archiving it")
        connection.execute(
            "UPDATE zones SET archived_at = "
            "CASE WHEN ? THEN strftime('%Y-%m-%dT%H:%M:%fZ', 'now') ELSE NULL END "
            "WHERE id = ?", (int(change.archived), zone_id),
        )


@router.delete("/zones/{zone_id}", status_code=204, dependencies=[Depends(require_superadmin)])
def delete_zone(zone_id: int) -> None:
    with closing(connect_database()) as connection, connection:
        zone = _zone(connection, zone_id)
        if zone["archived_at"] is None:
            raise HTTPException(status_code=409, detail="Archive this zone before deleting it permanently")
        if not zone["can_delete"]:
            raise HTTPException(status_code=409, detail="This zone is used by shared maps and cannot be deleted")
        connection.execute("DELETE FROM zones WHERE id = ?", (zone_id,))
