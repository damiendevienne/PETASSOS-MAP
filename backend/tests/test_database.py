"""Checks for migrations and the relationships that protect stored data."""

import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import database
from database import connect_database, initialize_database


class DatabaseTests(unittest.TestCase):
    def setUp(self):
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary_directory.cleanup)
        self.path = Path(self.temporary_directory.name) / "app.db"
        initialize_database(self.path)

    def test_migration_is_repeatable_without_erasing_data(self):
        with connect_database(self.path) as connection:
            self.assertEqual(
                connection.execute("SELECT version FROM schema_version").fetchone()[0], 3
            )
            self.assertEqual(
                connection.execute("SELECT COUNT(*) FROM categories").fetchone()[0], 4
            )
            connection.execute(
                "INSERT INTO places (kind, category_id, name, latitude, longitude) "
                "VALUES ('PLACE', 1, 'Test place', 35.0, 25.0)"
            )

        initialize_database(self.path)

        with connect_database(self.path) as connection:
            self.assertEqual(
                connection.execute("SELECT COUNT(*) FROM categories").fetchone()[0], 4
            )
            self.assertEqual(
                connection.execute("SELECT name FROM places").fetchone()[0], "Test place"
            )

    def test_foreign_keys_and_place_note_rules(self):
        with connect_database(self.path) as connection:
            self.assertEqual(connection.execute("PRAGMA foreign_keys").fetchone()[0], 1)

            with self.assertRaises(sqlite3.IntegrityError):
                connection.execute(
                    "INSERT INTO places (kind, category_id, name, latitude, longitude) "
                    "VALUES ('PLACE', 999, 'Invalid category', 35.0, 25.0)"
                )
            with self.assertRaises(sqlite3.IntegrityError):
                connection.execute(
                    "INSERT INTO places (kind, name, latitude, longitude, published) "
                    "VALUES ('NOTE', 'Public note', 35.0, 25.0, 1)"
                )

            connection.execute(
                "INSERT INTO places (kind, category_id, name, latitude, longitude) "
                "VALUES ('PLACE', 1, 'Valid place', 35.0, 25.0)"
            )
            with self.assertRaises(sqlite3.IntegrityError):
                connection.execute("DELETE FROM categories WHERE id = 1")

            connection.execute(
                "INSERT INTO place_images (place_id, file_path, sort_order) "
                "VALUES (1, 'example.jpg', 0)"
            )
            connection.execute("DELETE FROM places WHERE id = 1")
            self.assertEqual(
                connection.execute("SELECT COUNT(*) FROM place_images").fetchone()[0], 0
            )

    def test_v1_database_upgrades_without_erasing_data(self):
        old_path = Path(self.temporary_directory.name) / "previous-version.db"
        with patch.object(database, "MIGRATIONS", database.MIGRATIONS[:1]):
            initialize_database(old_path)
        with connect_database(old_path) as connection:
            connection.execute(
                "INSERT INTO places (kind, category_id, name, latitude, longitude) "
                "VALUES ('PLACE', 1, 'Saved place', 35.0, 25.0)"
            )

        initialize_database(old_path)
        with connect_database(old_path) as connection:
            self.assertEqual(
                connection.execute("SELECT version FROM schema_version").fetchone()[0], 3
            )
            self.assertEqual(
                connection.execute("SELECT name FROM places").fetchone()[0], "Saved place"
            )

    def test_existing_places_and_share_categories_move_to_four_categories(self):
        old_path = Path(self.temporary_directory.name) / "eight-categories.db"
        with patch.object(database, "MIGRATIONS", database.MIGRATIONS[:2]):
            initialize_database(old_path)
        with connect_database(old_path) as connection:
            connection.execute(
                "INSERT INTO places (kind, category_id, name, latitude, longitude) "
                "VALUES ('PLACE', 8, 'Saved place', 35.0, 25.0)"
            )
            connection.execute(
                "INSERT INTO places (kind, name, latitude, longitude) "
                "VALUES ('NOTE', 'Private note', 35.0, 25.0)"
            )
            connection.execute(
                "INSERT INTO share_links (internal_name, public_title, token, expires_at) "
                "VALUES ('Test', 'Test', 'test-token', '2030-01-01T00:00:00Z')"
            )
            connection.execute(
                "INSERT INTO share_link_categories (share_link_id, category_id) VALUES (1, 8)"
            )

        initialize_database(old_path)
        with connect_database(old_path) as connection:
            self.assertEqual(
                [row[0] for row in connection.execute("SELECT name FROM categories ORDER BY id")],
                ["Outdoor activities", "Sea activities", "Gastronomy", "Winery"],
            )
            self.assertEqual(
                connection.execute("SELECT category_id FROM places WHERE kind = 'PLACE'").fetchone()[0], 1
            )
            self.assertIsNone(
                connection.execute("SELECT category_id FROM places WHERE kind = 'NOTE'").fetchone()[0]
            )
            self.assertEqual(
                connection.execute("SELECT category_id FROM share_link_categories").fetchone()[0], 4
            )


if __name__ == "__main__":
    unittest.main()
