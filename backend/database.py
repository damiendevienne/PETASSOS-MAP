"""SQLite connections and small, versioned schema migrations."""

import os
import sqlite3
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATABASE_NAME = "app.db"

# Original categories are kept here for the first schema migration.
LEGACY_CATEGORIES = (
    ("Restaurant", "restaurant", "#C90046"),
    ("Hotel", "lodging", "#FFB800"),
    ("Sightseeing", "attraction", "#0AA8AD"),
    ("Hiking", "mountain", "#39A90D"),
    ("Beach", "beach", "#0D84CF"),
    ("Café", "cafe", "#EB6500"),
    ("Shopping", "shop", "#8B2BB0"),
    ("Museum", "museum", "#81583F"),
)

CURRENT_CATEGORIES = (
    ("Outdoor activities", "mountain", "#39A90D"),
    ("Sea activities", "beach", "#0D84CF"),
    ("Gastronomy", "restaurant", "#C90046"),
    ("Winery", "alcohol-shop", "#8B2BB0"),
)


def database_path() -> Path:
    """Resolve DATA_DIR consistently, regardless of the working directory."""
    data_dir = Path(os.environ.get("DATA_DIR", "data"))
    if not data_dir.is_absolute():
        data_dir = PROJECT_ROOT / data_dir
    return data_dir / DATABASE_NAME


def connect_database(path: Path | None = None) -> sqlite3.Connection:
    """Open a connection with referential integrity enabled."""
    db_path = Path(path) if path is not None else database_path()
    db_path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(db_path)
    try:
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA journal_mode = WAL")
        return connection
    except Exception:
        connection.close()
        raise


def _migration_1(connection: sqlite3.Connection) -> None:
    """Create the initial Petassos data model and its default categories."""
    statements = (
        """
        CREATE TABLE categories (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK (length(trim(name)) > 0),
            icon TEXT NOT NULL CHECK (length(trim(icon)) > 0),
            color TEXT NOT NULL CHECK (
                color GLOB '#[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]'
            )
        )
        """,
        """
        CREATE TABLE places (
            id INTEGER PRIMARY KEY,
            kind TEXT NOT NULL CHECK (kind IN ('PLACE', 'NOTE')),
            category_id INTEGER REFERENCES categories(id) ON DELETE RESTRICT,
            name TEXT NOT NULL CHECK (length(trim(name)) > 0),
            description TEXT,
            author TEXT,
            latitude REAL NOT NULL CHECK (latitude BETWEEN -90 AND 90),
            longitude REAL NOT NULL CHECK (longitude BETWEEN -180 AND 180),
            published INTEGER NOT NULL DEFAULT 0 CHECK (published IN (0, 1)),
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
            updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
            CHECK (
                (kind = 'PLACE' AND category_id IS NOT NULL)
                OR (kind = 'NOTE' AND category_id IS NULL AND published = 0)
            )
        )
        """,
        "CREATE INDEX places_kind_category_idx ON places(kind, category_id)",
        """
        CREATE TABLE place_images (
            id INTEGER PRIMARY KEY,
            place_id INTEGER NOT NULL REFERENCES places(id) ON DELETE CASCADE,
            file_path TEXT NOT NULL CHECK (length(trim(file_path)) > 0),
            caption TEXT,
            sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
            UNIQUE (place_id, sort_order)
        )
        """,
        """
        CREATE TABLE zones (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL CHECK (length(trim(name)) > 0),
            min_lat REAL NOT NULL,
            max_lat REAL NOT NULL,
            min_lon REAL NOT NULL,
            max_lon REAL NOT NULL,
            CHECK (-90 <= min_lat AND min_lat < max_lat AND max_lat <= 90),
            CHECK (-180 <= min_lon AND min_lon < max_lon AND max_lon <= 180)
        )
        """,
        """
        CREATE TABLE share_links (
            id INTEGER PRIMARY KEY,
            internal_name TEXT NOT NULL CHECK (length(trim(internal_name)) > 0),
            public_title TEXT NOT NULL CHECK (length(trim(public_title)) > 0),
            token TEXT NOT NULL UNIQUE CHECK (length(trim(token)) > 0),
            expires_at TEXT NOT NULL,
            archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        )
        """,
        """
        CREATE TABLE share_link_zones (
            share_link_id INTEGER NOT NULL REFERENCES share_links(id) ON DELETE CASCADE,
            zone_id INTEGER NOT NULL REFERENCES zones(id) ON DELETE RESTRICT,
            PRIMARY KEY (share_link_id, zone_id)
        )
        """,
        "CREATE INDEX share_link_zones_zone_idx ON share_link_zones(zone_id)",
        """
        CREATE TABLE share_link_categories (
            share_link_id INTEGER NOT NULL REFERENCES share_links(id) ON DELETE CASCADE,
            category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
            PRIMARY KEY (share_link_id, category_id)
        )
        """,
        "CREATE INDEX share_link_categories_category_idx ON share_link_categories(category_id)",
    )
    for statement in statements:
        connection.execute(statement)
    connection.executemany(
        "INSERT INTO categories (name, icon, color) VALUES (?, ?, ?)",
        LEGACY_CATEGORIES,
    )


def _migration_2(connection: sqlite3.Connection) -> None:
    """Keep revocable Admin sessions without storing cookie tokens in clear text."""
    connection.execute(
        """
        CREATE TABLE admin_sessions (
            token_hash TEXT PRIMARY KEY,
            created_at INTEGER NOT NULL,
            expires_at INTEGER NOT NULL CHECK (expires_at > created_at)
        )
        """
    )
    connection.execute(
        "CREATE INDEX admin_sessions_expiry_idx ON admin_sessions(expires_at)"
    )


def _migration_3(connection: sqlite3.Connection) -> None:
    """Use four categories and distribute existing places among them."""
    for category_id, (name, icon, color) in enumerate(CURRENT_CATEGORIES, start=1):
        connection.execute(
            "UPDATE categories SET name = ?, icon = ?, color = ? WHERE id = ?",
            (name, icon, color, category_id),
        )
    connection.execute(
        "UPDATE places SET category_id = 1 + ((id - 1) % 4) WHERE kind = 'PLACE'"
    )
    connection.execute(
        "INSERT OR IGNORE INTO share_link_categories (share_link_id, category_id) "
        "SELECT share_link_id, 1 + ((category_id - 1) % 4) "
        "FROM share_link_categories WHERE category_id > 4"
    )
    connection.execute("DELETE FROM share_link_categories WHERE category_id > 4")
    connection.execute("DELETE FROM categories WHERE id > 4")


MIGRATIONS = (_migration_1, _migration_2, _migration_3)


def initialize_database(path: Path | None = None) -> Path:
    """Apply pending migrations once, in a transaction, then close the database."""
    db_path = Path(path) if path is not None else database_path()
    connection = connect_database(db_path)
    try:
        connection.execute("BEGIN IMMEDIATE")
        connection.execute(
            "CREATE TABLE IF NOT EXISTS schema_version ("
            "id INTEGER PRIMARY KEY CHECK (id = 1), "
            "version INTEGER NOT NULL CHECK (version >= 0))"
        )
        connection.execute(
            "INSERT OR IGNORE INTO schema_version (id, version) VALUES (1, 0)"
        )
        version = connection.execute(
            "SELECT version FROM schema_version WHERE id = 1"
        ).fetchone()["version"]
        if version > len(MIGRATIONS):
            raise RuntimeError(f"Database schema version {version} is newer than this application")
        for next_version, migrate in enumerate(MIGRATIONS, start=1):
            if next_version > version:
                migrate(connection)
                connection.execute(
                    "UPDATE schema_version SET version = ? WHERE id = 1",
                    (next_version,),
                )
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()
    return db_path
