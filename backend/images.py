"""Admin image upload and storage for places and notes."""

import io
import json
import os
import warnings
from contextlib import closing
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from PIL import Image, ImageOps, UnidentifiedImageError

if __package__:
    from .database import PROJECT_ROOT, connect_database
else:
    from database import PROJECT_ROOT, connect_database


router = APIRouter()
FORMATS = {"JPEG": ("JPEG", ".jpg"), "PNG": ("PNG", ".png"), "WEBP": ("WEBP", ".webp")}
Image.MAX_IMAGE_PIXELS = 50_000_000


def upload_dir() -> Path:
    path = Path(os.environ.get("UPLOAD_DIR", "uploads"))
    return path if path.is_absolute() else PROJECT_ROOT / path


def _setting(name: str, default: int) -> int:
    value = int(os.environ.get(name, default))
    if value < 1:
        raise ValueError(f"{name} must be positive")
    return value


def _kind(collection: str) -> str:
    if collection not in {"places", "notes"}:
        raise HTTPException(status_code=404, detail="Not found")
    return "PLACE" if collection == "places" else "NOTE"


def _record(connection, collection: str, record_id: int) -> None:
    if connection.execute(
        "SELECT 1 FROM places WHERE id = ? AND kind = ?", (record_id, _kind(collection))
    ).fetchone() is None:
        raise HTTPException(status_code=404, detail="Record not found")


def _image(row) -> dict:
    return {"id": row["id"], "caption": row["caption"] or "", "url": f"/api/admin/images/{row['id']}/file"}


def _list_images(connection, record_id: int) -> list[dict]:
    rows = connection.execute(
        "SELECT id, caption FROM place_images WHERE place_id = ? ORDER BY sort_order, id", (record_id,)
    ).fetchall()
    return [_image(row) for row in rows]


@router.get("/{collection}/{record_id}/images")
def list_images(collection: str, record_id: int) -> list[dict]:
    with closing(connect_database()) as connection:
        _record(connection, collection, record_id)
        return _list_images(connection, record_id)


@router.get("/images/{image_id}/file")
def image_file(image_id: int):
    with closing(connect_database()) as connection:
        row = connection.execute("SELECT file_path FROM place_images WHERE id = ?", (image_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Image not found")
    path = upload_dir() / row["file_path"]
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Image file not found")
    return FileResponse(path, headers={"Cache-Control": "private, no-store"})


async def _prepare(upload: UploadFile) -> tuple[str, bytes]:
    limit = _setting("MAX_UPLOAD_MB", 10) * 1024 * 1024
    raw = await upload.read(limit + 1)
    if len(raw) > limit:
        raise HTTPException(status_code=413, detail="Image exceeds the upload size limit")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(raw)) as source:
                if source.format not in FORMATS:
                    raise HTTPException(status_code=422, detail="Only JPEG, PNG and WebP images are supported")
                output_format, extension = FORMATS[source.format]
                image = ImageOps.exif_transpose(source)
                image.load()
                image.thumbnail((_setting("MAX_IMAGE_DIMENSION", 2400),) * 2)
                output = io.BytesIO()
                image.save(output, format=output_format)
                return extension, output.getvalue()
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
        raise HTTPException(status_code=422, detail="Invalid image") from exc


@router.put("/{collection}/{record_id}/images")
async def save_images(
    collection: str,
    record_id: int,
    manifest: str = Form(...),
    files: list[UploadFile] | None = File(None),
) -> list[dict]:
    try:
        entries = json.loads(manifest)
        if not isinstance(entries, list):
            raise ValueError()
        ids = []
        new_indices = []
        for entry in entries:
            if not isinstance(entry, dict) or not isinstance(entry.get("caption"), str):
                raise ValueError()
            if type(entry.get("id")) is int and "new_index" not in entry:
                ids.append(entry["id"])
            elif type(entry.get("new_index")) is int and "id" not in entry:
                new_indices.append(entry["new_index"])
            else:
                raise ValueError()
        if len(ids) != len(set(ids)) or sorted(new_indices) != list(range(len(files or []))):
            raise ValueError()
    except (ValueError, KeyError, TypeError) as exc:
        raise HTTPException(status_code=422, detail="Invalid image order") from exc

    prepared = [await _prepare(upload) for upload in files or []]
    created = []
    removed = []
    try:
        with closing(connect_database()) as connection, connection:
            _record(connection, collection, record_id)
            existing = {row["id"]: row for row in connection.execute(
                "SELECT id, file_path, sort_order FROM place_images WHERE place_id = ?", (record_id,)
            ).fetchall()}
            if any(image_id not in existing for image_id in ids):
                raise HTTPException(status_code=422, detail="Image does not belong to this record")
            for image_id, row in existing.items():
                if image_id not in ids:
                    removed.append(row["file_path"])
                    connection.execute("DELETE FROM place_images WHERE id = ?", (image_id,))
            temporary_order = max((row["sort_order"] for row in existing.values()), default=-1) + 1
            for offset, image_id in enumerate(ids):
                connection.execute(
                    "UPDATE place_images SET sort_order = ? WHERE id = ?",
                    (temporary_order + offset, image_id),
                )
            if prepared:
                upload_dir().mkdir(parents=True, exist_ok=True)
            for order, entry in enumerate(entries):
                if "id" in entry:
                    connection.execute(
                        "UPDATE place_images SET caption = ?, sort_order = ? WHERE id = ?",
                        (entry["caption"].strip(), order, entry["id"]),
                    )
                else:
                    extension, data = prepared[entry["new_index"]]
                    filename = f"{uuid4().hex}{extension}"
                    path = upload_dir() / filename
                    created.append(path)
                    path.write_bytes(data)
                    connection.execute(
                        "INSERT INTO place_images (place_id, file_path, caption, sort_order) VALUES (?, ?, ?, ?)",
                        (record_id, filename, entry["caption"].strip(), order),
                    )
            result = _list_images(connection, record_id)
    except Exception:
        for path in created:
            path.unlink(missing_ok=True)
        raise
    for filename in removed:
        (upload_dir() / filename).unlink(missing_ok=True)
    return result


def remove_record_files(filenames: list[str]) -> None:
    for filename in filenames:
        (upload_dir() / filename).unlink(missing_ok=True)
