"""SQLite connections and small, versioned schema migrations."""

import os
import sqlite3
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATABASE_NAME = "app.db"
SUPPORTED_PLACE_LANGUAGES = ("en", "fr", "de", "it")


def place_translations(connection: sqlite3.Connection, place_id: int) -> dict[str, dict[str, str]]:
    rows = connection.execute(
        "SELECT language, name, description, practical_info FROM place_translations WHERE place_id = ?",
        (place_id,),
    ).fetchall()
    return {
        row["language"]: {
            "name": row["name"] or "",
            "description": row["description"] or "",
            "practical_info": row["practical_info"] or "",
        }
        for row in rows
    }

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


def _migration_4(connection: sqlite3.Connection) -> None:
    """Give existing zones distinct names, then enforce that rule for new data."""
    used = set()
    for row in connection.execute("SELECT id, name FROM zones ORDER BY id").fetchall():
        base = row["name"].strip()
        name = base
        suffix = 2
        while name.casefold() in used:
            name = f"{base} ({suffix})"
            suffix += 1
        if name != row["name"]:
            connection.execute("UPDATE zones SET name = ? WHERE id = ?", (name, row["id"]))
        used.add(name.casefold())
    connection.execute("CREATE UNIQUE INDEX zones_name_unique_idx ON zones(lower(trim(name)))")


def _migration_5(connection: sqlite3.Connection) -> None:
    """Archive map content and distinguish editor sessions from the original account."""
    connection.execute("ALTER TABLE places ADD COLUMN archived_at TEXT")
    connection.execute("ALTER TABLE zones ADD COLUMN archived_at TEXT")
    connection.execute(
        "CREATE TABLE admin_accounts ("
        "username TEXT PRIMARY KEY COLLATE NOCASE, password_hash TEXT NOT NULL)"
    )
    connection.execute("ALTER TABLE admin_sessions ADD COLUMN username TEXT NOT NULL DEFAULT ''")
    connection.execute(
        "ALTER TABLE admin_sessions ADD COLUMN role TEXT NOT NULL DEFAULT 'superadmin' "
        "CHECK (role IN ('admin', 'superadmin'))"
    )
    connection.execute("DELETE FROM admin_sessions")


def _migration_6(connection: sqlite3.Connection) -> None:
    """Group the four existing choices without changing place or shared-link IDs."""
    connection.execute("ALTER TABLE categories ADD COLUMN parent_id INTEGER REFERENCES categories(id)")
    connection.execute("ALTER TABLE categories ADD COLUMN marker_style TEXT NOT NULL DEFAULT 'circle'")
    connection.execute("ALTER TABLE categories ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0")

    what_to_do = connection.execute(
        "INSERT INTO categories (name, icon, color, sort_order) VALUES (?, ?, ?, ?)",
        ("What to do", "mountain", "#39A90D", 1),
    ).lastrowid
    for order, category_id in enumerate(range(1, 5), start=1):
        connection.execute(
            "UPDATE categories SET parent_id = ?, color = '#39A90D', sort_order = ? WHERE id = ?",
            (what_to_do, order, category_id),
        )
    connection.execute("UPDATE categories SET name = 'Wineries' WHERE id = 4")

    top_level = (
        ("Hotels", "lodging", "#7656A6", 2, "circle"),
        ("Where to eat/drink", "restaurant", "#D46D43", 3, "circle"),
        ("What to see", "museum", "#0D84CF", 4, "circle"),
        ("Tips from the locals", "information", "#C48728", 5, "circle"),
        ("Information", "information", "#256E9D", 6, "information"),
    )
    what_to_see = None
    for name, icon, color, order, marker_style in top_level:
        category_id = connection.execute(
            "INSERT INTO categories (name, icon, color, sort_order, marker_style) VALUES (?, ?, ?, ?, ?)",
            (name, icon, color, order, marker_style),
        ).lastrowid
        if name == "What to see":
            what_to_see = category_id
    for order, (name, icon) in enumerate((
        ("Sites and museums", "museum"),
        ("Gorges", "mountain"),
        ("Beaches", "beach"),
        ("Villages", "village"),
        ("Festivals", "music"),
    ), start=1):
        connection.execute(
            "INSERT INTO categories (name, icon, color, parent_id, sort_order) VALUES (?, ?, ?, ?, ?)",
            (name, icon, "#0D84CF", what_to_see, order),
        )


def _migration_7(connection: sqlite3.Connection) -> None:
    """Split beaches into serviced and unserviced choices."""
    beach = connection.execute("SELECT id, parent_id, color FROM categories WHERE name = 'Beaches'").fetchone()
    connection.execute(
        "UPDATE categories SET name = 'Serviced beach' WHERE id = ?", (beach["id"],)
    )
    connection.execute(
        "UPDATE categories SET sort_order = sort_order + 1 "
        "WHERE parent_id = ? AND sort_order > 3", (beach["parent_id"],)
    )
    connection.execute(
        "INSERT INTO categories (name, icon, color, parent_id, sort_order) VALUES (?, ?, ?, ?, ?)",
        ("Unserviced beach", "swimming", beach["color"], beach["parent_id"], 4),
    )


def _migration_8(connection: sqlite3.Connection) -> None:
    """Allow an optional external link on places and internal notes."""
    connection.execute("ALTER TABLE places ADD COLUMN link_url TEXT")


def _migration_9(connection: sqlite3.Connection) -> None:
    """Keep optional client-facing information with each zone."""
    connection.execute("ALTER TABLE zones ADD COLUMN about_title TEXT NOT NULL DEFAULT ''")
    connection.execute("ALTER TABLE zones ADD COLUMN about_text TEXT NOT NULL DEFAULT ''")


def _migration_10(connection: sqlite3.Connection) -> None:
    """Mark zones whose boundaries only a superadmin may change."""
    connection.execute("ALTER TABLE zones ADD COLUMN locked INTEGER NOT NULL DEFAULT 0 CHECK (locked IN (0, 1))")


def _migration_11(connection: sqlite3.Connection) -> None:
    """Give each place category and category group its own map icon."""
    icons = {
        "What to do": "star",
        "Outdoor activities": "mountain",
        "Sea activities": "swimming",
        "Gastronomy": "restaurant",
        "Wineries": "alcohol-shop",
        "Hotels": "lodging",
        "Where to eat/drink": "cafe",
        "What to see": "landmark",
        "Sites and museums": "museum",
        "Gorges": "waterfall",
        "Serviced beach": "drinking-water",
        "Unserviced beach": "beach",
        "Villages": "village",
        "Festivals": "music",
        "Tips from the locals": "heart",
        "Information": "information",
    }
    connection.executemany(
        "UPDATE categories SET icon = ? WHERE name = ?",
        ((icon, name) for name, icon in icons.items()),
    )


def _migration_12(connection: sqlite3.Connection) -> None:
    """Use familiar beach icons and an eye for the What to see group."""
    icons = {
        "Sea activities": "water",
        "Serviced beach": "beach",
        "Unserviced beach": "swimming",
        "What to see": "eye",
    }
    connection.executemany(
        "UPDATE categories SET icon = ? WHERE name = ?",
        ((icon, name) for name, icon in icons.items()),
    )


def _migration_13(connection: sqlite3.Connection) -> None:
    """Use a boat icon for sea activities."""
    connection.execute("UPDATE categories SET icon = 'racetrack-boat' WHERE name = 'Sea activities'")


def _migration_14(connection: sqlite3.Connection) -> None:
    """Use a distinct mountain-like icon for gorges."""
    connection.execute("UPDATE categories SET icon = 'volcano' WHERE name = 'Gorges'")


def _migration_15(connection: sqlite3.Connection) -> None:
    """Refresh category colors for better contrast against the basemap."""
    colors = {
        "What to do": "#C13C7A",
        "Hotels": "#6842A6",
        "Where to eat/drink": "#A83A2A",
        "What to see": "#1758A6",
        "Tips from the locals": "#765019",
        "Information": "#174B4A",
    }
    connection.executemany(
        "UPDATE categories SET color = ? WHERE name = ?",
        ((color, name) for name, color in colors.items()),
    )


def _migration_16(connection: sqlite3.Connection) -> None:
    """Give local tips a distinct red marker color."""
    connection.execute("UPDATE categories SET color = '#C62828' WHERE name = 'Tips from the locals'")


def _migration_17(connection: sqlite3.Connection) -> None:
    """Give food and drink places a deep green marker color."""
    connection.execute("UPDATE categories SET color = '#1E6B3A' WHERE name = 'Where to eat/drink'")


def _migration_18(connection: sqlite3.Connection) -> None:
    """Give hotels a warm brown marker color distinct from other categories."""
    connection.execute("UPDATE categories SET color = '#8A4F27' WHERE name = 'Hotels'")


def _migration_19(connection: sqlite3.Connection) -> None:
    """Apply the selected category marker palette."""
    colors = {
        "What to do": "#CC79A7",
        "Hotels": "#6A3D9A",
        "Where to eat/drink": "#009E73",
        "What to see": "#0072B2",
        "Tips from the locals": "#D55E00",
    }
    connection.executemany(
        "UPDATE categories SET color = ? WHERE name = ?",
        ((color, name) for name, color in colors.items()),
    )


def _migration_20(connection: sqlite3.Connection) -> None:
    """Restore the What to do and Hotels colors from the previous palette."""
    connection.execute("UPDATE categories SET color = '#C13C7A' WHERE name = 'What to do'")
    connection.execute("UPDATE categories SET color = '#8A4F27' WHERE name = 'Hotels'")


def _migration_21(connection: sqlite3.Connection) -> None:
    """Store one free-form practical-information block for each place."""
    connection.execute("ALTER TABLE places ADD COLUMN practical_info TEXT NOT NULL DEFAULT ''")


def _migration_22(connection: sqlite3.Connection) -> None:
    """Store localized place text independently from the legacy English columns."""
    connection.execute(
        """
        CREATE TABLE place_translations (
            place_id INTEGER NOT NULL REFERENCES places(id) ON DELETE CASCADE,
            language TEXT NOT NULL CHECK (language IN ('en', 'fr', 'de', 'it')),
            name TEXT NOT NULL DEFAULT '',
            description TEXT NOT NULL DEFAULT '',
            practical_info TEXT NOT NULL DEFAULT '',
            PRIMARY KEY (place_id, language)
        )
        """
    )
    connection.execute(
        """
        INSERT INTO place_translations (place_id, language, name, description, practical_info)
        SELECT id, 'en', name, COALESCE(description, ''), COALESCE(practical_info, '')
        FROM places
        WHERE kind = 'PLACE'
        """
    )


MIGRATIONS = (_migration_1, _migration_2, _migration_3, _migration_4, _migration_5, _migration_6, _migration_7, _migration_8, _migration_9, _migration_10, _migration_11, _migration_12, _migration_13, _migration_14, _migration_15, _migration_16, _migration_17, _migration_18, _migration_19, _migration_20, _migration_21, _migration_22)


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
