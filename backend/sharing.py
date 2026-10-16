"""Admin management of shared maps and their stable links."""

import secrets
from contextlib import closing
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

if __package__:
    from .database import connect_database
    from .images import upload_dir
else:
    from database import connect_database
    from images import upload_dir


router = APIRouter()
public_router = APIRouter()


class SharedMapInput(BaseModel):
    internal_name: str
    public_title: str
    zone_ids: list[int]
    category_ids: list[int]
    expires_at: datetime


class ArchiveInput(BaseModel):
    archived: bool


def _values(connection, shared_map: SharedMapInput, *, creating: bool) -> tuple:
    internal_name = shared_map.internal_name.strip()
    public_title = shared_map.public_title.strip()
    zone_ids = list(dict.fromkeys(shared_map.zone_ids))
    category_ids = list(dict.fromkeys(shared_map.category_ids))
    expiry = shared_map.expires_at
    if not internal_name or not public_title or not zone_ids or not category_ids:
        raise HTTPException(status_code=422, detail="Enter both names and select zones and categories")
    if expiry.tzinfo is None or expiry.utcoffset() is None:
        raise HTTPException(status_code=422, detail="Expiry must include a time zone")
    if creating and expiry <= datetime.now(timezone.utc):
        raise HTTPException(status_code=422, detail="Expiry must be in the future")
    for table, ids in (("zones", zone_ids), ("categories", category_ids)):
        placeholders = ",".join("?" for _ in ids)
        count = connection.execute(
            f"SELECT COUNT(*) FROM {table} WHERE id IN ({placeholders})", ids
        ).fetchone()[0]
        if count != len(ids):
            raise HTTPException(status_code=422, detail=f"Select existing {table}")
    return (
        internal_name, public_title,
        expiry.astimezone(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        zone_ids, category_ids,
    )


def _shared_map(connection, map_id: int) -> dict:
    row = connection.execute("SELECT * FROM share_links WHERE id = ?", (map_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Shared map not found")
    result = dict(row)
    result["zone_ids"] = [item[0] for item in connection.execute(
        "SELECT zone_id FROM share_link_zones WHERE share_link_id = ? ORDER BY zone_id", (map_id,)
    )]
    result["category_ids"] = [item[0] for item in connection.execute(
        "SELECT category_id FROM share_link_categories WHERE share_link_id = ? ORDER BY category_id", (map_id,)
    )]
    result["status"] = (
        "ARCHIVED" if result["archived"] else
        "EXPIRED" if datetime.fromisoformat(result["expires_at"].replace("Z", "+00:00")) <= datetime.now(timezone.utc)
        else "ACTIVE"
    )
    return result


@router.get("/shared-maps")
def list_shared_maps(archived: bool = False) -> list[dict]:
    with closing(connect_database()) as connection:
        rows = connection.execute(
            "SELECT id FROM share_links WHERE archived = ? ORDER BY id DESC", (int(archived),)
        ).fetchall()
        return [_shared_map(connection, row["id"]) for row in rows]


@router.get("/shared-maps/{map_id}")
def get_shared_map(map_id: int) -> dict:
    with closing(connect_database()) as connection:
        return _shared_map(connection, map_id)


@router.post("/shared-maps", status_code=201)
def create_shared_map(shared_map: SharedMapInput) -> dict:
    with closing(connect_database()) as connection, connection:
        name, title, expiry, zone_ids, category_ids = _values(connection, shared_map, creating=True)
        cursor = connection.execute(
            "INSERT INTO share_links (internal_name, public_title, token, expires_at) VALUES (?, ?, ?, ?)",
            (name, title, secrets.token_urlsafe(32), expiry),
        )
        map_id = cursor.lastrowid
        connection.executemany(
            "INSERT INTO share_link_zones (share_link_id, zone_id) VALUES (?, ?)",
            [(map_id, zone_id) for zone_id in zone_ids],
        )
        connection.executemany(
            "INSERT INTO share_link_categories (share_link_id, category_id) VALUES (?, ?)",
            [(map_id, category_id) for category_id in category_ids],
        )
        return _shared_map(connection, map_id)


@router.put("/shared-maps/{map_id}")
def update_shared_map(map_id: int, shared_map: SharedMapInput) -> dict:
    with closing(connect_database()) as connection, connection:
        _shared_map(connection, map_id)
        name, title, expiry, zone_ids, category_ids = _values(connection, shared_map, creating=False)
        connection.execute(
            "UPDATE share_links SET internal_name = ?, public_title = ?, expires_at = ? WHERE id = ?",
            (name, title, expiry, map_id),
        )
        connection.execute("DELETE FROM share_link_zones WHERE share_link_id = ?", (map_id,))
        connection.execute("DELETE FROM share_link_categories WHERE share_link_id = ?", (map_id,))
        connection.executemany(
            "INSERT INTO share_link_zones (share_link_id, zone_id) VALUES (?, ?)",
            [(map_id, zone_id) for zone_id in zone_ids],
        )
        connection.executemany(
            "INSERT INTO share_link_categories (share_link_id, category_id) VALUES (?, ?)",
            [(map_id, category_id) for category_id in category_ids],
        )
        return _shared_map(connection, map_id)


@router.patch("/shared-maps/{map_id}/archive")
def archive_shared_map(map_id: int, change: ArchiveInput) -> dict:
    with closing(connect_database()) as connection, connection:
        _shared_map(connection, map_id)
        connection.execute(
            "UPDATE share_links SET archived = ? WHERE id = ?", (int(change.archived), map_id)
        )
        return _shared_map(connection, map_id)


@public_router.get("/api/shared/{token}")
def public_shared_map(token: str) -> dict:
    """Resolve current published places inside the selected zone union."""
    with closing(connect_database()) as connection:
        link = _active_link(connection, token)
        map_id = link["id"]
        categories = connection.execute(
            "SELECT categories.id, categories.name, categories.icon, categories.color "
            "FROM categories JOIN share_link_categories ON categories.id = share_link_categories.category_id "
            "WHERE share_link_categories.share_link_id = ? ORDER BY categories.name", (map_id,)
        ).fetchall()
        zones = connection.execute(
            "SELECT zones.id, zones.name, zones.min_lat, zones.max_lat, zones.min_lon, zones.max_lon "
            "FROM zones JOIN share_link_zones ON zones.id = share_link_zones.zone_id "
            "WHERE share_link_zones.share_link_id = ? ORDER BY zones.name", (map_id,)
        ).fetchall()
        places = connection.execute(
            "SELECT places.id, places.kind, places.name, places.description, places.author, "
            "places.latitude, places.longitude, places.category_id, "
            "categories.name AS category_name, categories.icon AS category_icon, "
            "categories.color AS category_color "
            "FROM places JOIN categories ON places.category_id = categories.id "
            "WHERE places.kind = 'PLACE' AND places.published = 1 "
            "AND EXISTS (SELECT 1 FROM share_link_categories sc "
            "WHERE sc.share_link_id = ? AND sc.category_id = places.category_id) "
            "AND EXISTS (SELECT 1 FROM share_link_zones sz JOIN zones z ON z.id = sz.zone_id "
            "WHERE sz.share_link_id = ? AND places.latitude BETWEEN z.min_lat AND z.max_lat "
            "AND places.longitude BETWEEN z.min_lon AND z.max_lon) "
            "ORDER BY places.name COLLATE NOCASE, places.id", (map_id, map_id),
        ).fetchall()
        public_places = []
        for row in places:
            place = dict(row)
            place["images"] = [
                {"id": image["id"], "caption": image["caption"] or "",
                 "url": f"/api/shared/{token}/images/{image['id']}"}
                for image in connection.execute(
                    "SELECT id, caption FROM place_images WHERE place_id = ? ORDER BY sort_order, id",
                    (place["id"],),
                )
            ]
            public_places.append(place)
        return {
            "public_title": link["public_title"],
            "expires_at": link["expires_at"],
            "categories": [dict(row) for row in categories],
            "zones": [dict(row) for row in zones],
            "places": public_places,
        }


def _active_link(connection, token: str):
    link = connection.execute(
        "SELECT id, public_title, expires_at, archived FROM share_links WHERE token = ?", (token,)
    ).fetchone()
    if link is None or link["archived"]:
        raise HTTPException(status_code=404, detail="Shared map not found")
    if datetime.fromisoformat(link["expires_at"].replace("Z", "+00:00")) <= datetime.now(timezone.utc):
        raise HTTPException(status_code=410, detail="Shared map expired")
    return link


@public_router.get("/api/shared/{token}/images/{image_id}")
def public_place_image(token: str, image_id: int):
    with closing(connect_database()) as connection:
        link = _active_link(connection, token)
        row = connection.execute(
            "SELECT place_images.file_path FROM place_images "
            "JOIN places ON places.id = place_images.place_id "
            "WHERE place_images.id = ? AND places.kind = 'PLACE' AND places.published = 1 "
            "AND EXISTS (SELECT 1 FROM share_link_categories sc "
            "WHERE sc.share_link_id = ? AND sc.category_id = places.category_id) "
            "AND EXISTS (SELECT 1 FROM share_link_zones sz JOIN zones z ON z.id = sz.zone_id "
            "WHERE sz.share_link_id = ? AND places.latitude BETWEEN z.min_lat AND z.max_lat "
            "AND places.longitude BETWEEN z.min_lon AND z.max_lon)",
            (image_id, link["id"], link["id"]),
        ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Image not found")
    path = upload_dir() / row["file_path"]
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Image not found")
    return FileResponse(path, headers={"Cache-Control": "private, no-store"})
