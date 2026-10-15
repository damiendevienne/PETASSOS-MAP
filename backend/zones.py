"""Editable rectangular zones used by Admin and future shared maps."""

import sqlite3
from contextlib import closing

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

if __package__:
    from .database import connect_database
else:
    from database import connect_database


router = APIRouter()


class ZoneInput(BaseModel):
    name: str
    min_lat: float = Field(ge=-90, le=90)
    max_lat: float = Field(ge=-90, le=90)
    min_lon: float = Field(ge=-180, le=180)
    max_lon: float = Field(ge=-180, le=180)


def _values(zone: ZoneInput) -> tuple:
    name = zone.name.strip()
    if not name or zone.min_lat >= zone.max_lat or zone.min_lon >= zone.max_lon:
        raise HTTPException(status_code=422, detail="Enter a name and valid rectangle")
    return name, zone.min_lat, zone.max_lat, zone.min_lon, zone.max_lon


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
    zone["can_edit"] = True
    zone["can_delete"] = zone["used_by_count"] == 0
    return zone


@router.get("/zones")
def list_zones() -> list[dict]:
    with closing(connect_database()) as connection:
        rows = connection.execute("SELECT id FROM zones ORDER BY name COLLATE NOCASE, id").fetchall()
        return [_zone(connection, row["id"]) for row in rows]


@router.post("/zones", status_code=201)
def create_zone(zone: ZoneInput) -> dict:
    try:
        with closing(connect_database()) as connection, connection:
            values = _values(zone)
            _check_name(connection, values[0])
            cursor = connection.execute(
                "INSERT INTO zones (name, min_lat, max_lat, min_lon, max_lon) VALUES (?, ?, ?, ?, ?)",
                values,
            )
            return _zone(connection, cursor.lastrowid)
    except sqlite3.IntegrityError as exc:
        raise HTTPException(status_code=409, detail="A zone with this name already exists") from exc


@router.put("/zones/{zone_id}")
def update_zone(zone_id: int, zone: ZoneInput) -> dict:
    try:
        with closing(connect_database()) as connection, connection:
            _zone(connection, zone_id)
            values = _values(zone)
            _check_name(connection, values[0], zone_id)
            connection.execute(
                "UPDATE zones SET name = ?, min_lat = ?, max_lat = ?, min_lon = ?, max_lon = ? WHERE id = ?",
                (*values, zone_id),
            )
            return _zone(connection, zone_id)
    except sqlite3.IntegrityError as exc:
        raise HTTPException(status_code=409, detail="A zone with this name already exists") from exc


@router.delete("/zones/{zone_id}", status_code=204)
def delete_zone(zone_id: int) -> None:
    with closing(connect_database()) as connection, connection:
        zone = _zone(connection, zone_id)
        if not zone["can_delete"]:
            raise HTTPException(status_code=409, detail="This zone is used by shared maps and cannot be deleted")
        connection.execute("DELETE FROM zones WHERE id = ?", (zone_id,))
