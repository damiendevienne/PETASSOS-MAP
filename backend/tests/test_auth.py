"""Exercise the real Admin HTTP routes and cookie lifecycle."""

import os
import tempfile
import unittest
from unittest.mock import patch

from argon2 import PasswordHasher
from argon2.low_level import Type
from fastapi.testclient import TestClient

from auth import COOKIE_NAME
from database import connect_database
from main import app


class AdminAuthTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.password_hash = PasswordHasher(type=Type.ID).hash("a long test password")

    def setUp(self):
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary_directory.cleanup)
        environment = patch.dict(
            os.environ,
            {
                "DATA_DIR": self.temporary_directory.name,
                "ADMIN_USERNAME": "admin",
                "ADMIN_PASSWORD_HASH": self.password_hash,
                "SESSION_SECRET": "a-test-secret-that-is-at-least-32-characters-long",
                "SESSION_COOKIE_SECURE": "false",
            },
        )
        environment.start()
        self.addCleanup(environment.stop)

    def test_login_and_logout_invalidate_the_same_cookie(self):
        with TestClient(app) as client:
            self.assertEqual(client.get("/api/admin/session").status_code, 401)
            self.assertEqual(
                client.post(
                    "/api/admin/login",
                    json={"username": "admin", "password": "wrong password"},
                ).status_code,
                401,
            )

            response = client.post(
                "/api/admin/login",
                json={"username": "admin", "password": "a long test password"},
            )
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()["username"], "admin")
            self.assertIn("httponly", response.headers["set-cookie"].lower())
            self.assertIn("samesite=lax", response.headers["set-cookie"].lower())
            cookie = client.cookies.get(COOKIE_NAME)
            self.assertIsNotNone(cookie)
            self.assertEqual(client.get("/api/admin/session").status_code, 200)
            self.assertEqual(
                client.get(
                    "/api/admin/session",
                    headers={"Cookie": f"{COOKIE_NAME}={cookie}tampered"},
                ).status_code,
                401,
            )

            self.assertEqual(client.post("/api/admin/logout").status_code, 204)
            self.assertEqual(
                client.get(
                    "/api/admin/session",
                    headers={"Cookie": f"{COOKIE_NAME}={cookie}"},
                ).status_code,
                401,
            )

    def test_admin_can_create_and_load_places(self):
        with TestClient(app) as client:
            self.assertEqual(client.get("/api/admin/places").status_code, 401)
            client.post(
                "/api/admin/login",
                json={"username": "admin", "password": "a long test password"},
            )
            categories = client.get("/api/admin/categories").json()
            category_id = categories[0]["id"]
            self.assertEqual(len(categories), 14)
            self.assertEqual(categories[0]["parent_name"], "What to do")
            place = {
                "name": "  Knossos  ",
                "category_id": category_id,
                "latitude": 35.298,
                "longitude": 25.163,
                "link_url": "https://example.com/place",
                "published": False,
            }
            self.assertEqual(
                client.post("/api/admin/places", json={**place, "category_id": 999}).status_code,
                422,
            )
            self.assertEqual(
                client.post("/api/admin/places", json={**place, "category_id": categories[0]["parent_id"]}).status_code,
                422,
            )
            response = client.post("/api/admin/places", json=place)
            self.assertEqual(response.status_code, 201)
            self.assertEqual(response.json()["name"], "Knossos")
            self.assertEqual(response.json()["link_url"], "https://example.com/place")
            self.assertEqual(client.get("/api/admin/places").json()[0]["id"], response.json()["id"])

    def test_admin_can_import_places_from_csv(self):
        with TestClient(app) as client:
            client.post(
                "/api/admin/login",
                json={"username": "admin", "password": "a long test password"},
            )
            csv_content = (
                "name,description,practical_info,category,subcategory,author,link_url,latitude,longitude,published\n"
                "Santorini wine tour,Visit three wineries,3 hours,What to do,Wineries,,https://example.com/wine,36.38,25.43,true\n"
            )
            response = client.post(
                "/api/admin/places/import",
                files={"file": ("places.csv", csv_content.encode("utf-8"), "text/csv")},
            )
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()["created_count"], 1)
            self.assertEqual(response.json()["error_count"], 0)
            place = client.get("/api/admin/places").json()[0]
            self.assertEqual(place["name"], "Santorini wine tour")
            self.assertEqual(place["practical_info"], "3 hours")

    def test_admin_can_create_private_notes(self):
        with TestClient(app) as client:
            self.assertEqual(client.get("/api/admin/notes").status_code, 401)
            client.post(
                "/api/admin/login",
                json={"username": "admin", "password": "a long test password"},
            )
            note = {"name": "Remember this", "latitude": 35.3, "longitude": 25.2,
                    "link_url": "https://example.com/note"}
            self.assertEqual(
                client.post("/api/admin/notes", json={**note, "published": True}).status_code,
                422,
            )
            response = client.post("/api/admin/notes", json=note)
            self.assertEqual(response.status_code, 201)
            self.assertEqual(response.json()["kind"], "NOTE")
            self.assertEqual(response.json()["link_url"], "https://example.com/note")
            self.assertIsNone(response.json()["category_id"])
            self.assertEqual(client.get("/api/admin/notes").json()[0]["id"], response.json()["id"])
            self.assertEqual(client.get("/api/admin/places").json(), [])

    def test_admin_can_edit_and_delete_places_and_notes(self):
        with TestClient(app) as client:
            client.post(
                "/api/admin/login",
                json={"username": "admin", "password": "a long test password"},
            )
            category_id = client.get("/api/admin/categories").json()[0]["id"]
            place = client.post("/api/admin/places", json={
                "name": "Old name", "category_id": category_id,
                "latitude": 35.3, "longitude": 25.2,
            }).json()
            note = client.post("/api/admin/notes", json={
                "name": "Old note", "latitude": 35.3, "longitude": 25.2,
            }).json()

            response = client.put(f"/api/admin/places/{place['id']}", json={
                "name": "New name", "category_id": category_id,
                "latitude": 35.4, "longitude": 25.3, "published": True,
            })
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()["name"], "New name")
            self.assertEqual(response.json()["latitude"], 35.4)
            self.assertEqual(response.json()["published"], 1)
            self.assertEqual(client.delete(f"/api/admin/notes/{place['id']}").status_code, 404)
            self.assertEqual(client.put(f"/api/admin/notes/{note['id']}", json={
                "name": "Invalid note", "latitude": 35.3,
                "longitude": 25.2, "published": True,
            }).status_code, 422)
            self.assertEqual(client.delete(f"/api/admin/places/{place['id']}").status_code, 409)
            self.assertEqual(client.patch(f"/api/admin/places/{place['id']}/archive", json={"archived": True}).status_code, 204)
            self.assertEqual(client.patch(f"/api/admin/notes/{note['id']}/archive", json={"archived": True}).status_code, 204)
            self.assertEqual(client.delete(f"/api/admin/places/{place['id']}").status_code, 204)
            self.assertEqual(client.delete(f"/api/admin/notes/{note['id']}").status_code, 204)
            self.assertEqual(client.get("/api/admin/places").json(), [])
            self.assertEqual(client.get("/api/admin/notes").json(), [])

    def test_locked_zone_boundaries_require_superadmin(self):
        with TestClient(app) as superadmin, TestClient(app) as admin:
            superadmin.post("/api/admin/login", json={
                "username": "admin", "password": "a long test password",
            })
            with connect_database() as connection:
                connection.execute(
                    "INSERT INTO admin_accounts (username, password_hash) VALUES (?, ?)",
                    ("editor", PasswordHasher(type=Type.ID).hash("editor password")),
                )
            admin.post("/api/admin/login", json={
                "username": "editor", "password": "editor password",
            })
            zone_data = {
                "name": "Protected area", "min_lat": 35.0, "max_lat": 35.5,
                "min_lon": 25.0, "max_lon": 25.5,
            }
            self.assertEqual(admin.post("/api/admin/zones", json={**zone_data, "locked": True}).status_code, 403)
            zone = admin.post("/api/admin/zones", json=zone_data).json()
            url = f"/api/admin/zones/{zone['id']}"
            self.assertEqual(superadmin.put(url, json={**zone_data, "locked": True}).json()["locked"], 1)
            updated = admin.put(url, json={
                **zone_data, "about_title": "Welcome", "about_text": "This area is protected.",
            })
            self.assertEqual(updated.status_code, 200)
            self.assertEqual(updated.json()["locked"], 1)
            self.assertEqual(admin.put(url, json={**zone_data, "min_lat": 34.9}).status_code, 403)
            self.assertEqual(admin.put(url, json={**zone_data, "locked": False}).status_code, 403)
            self.assertEqual(superadmin.put(url, json={**zone_data, "min_lat": 34.9, "locked": True}).status_code, 200)
            self.assertEqual(admin.get("/api/admin/zones").json()[0]["min_lat"], 34.9)

    def test_admin_archive_and_superadmin_permanent_delete(self):
        with TestClient(app) as superadmin, TestClient(app) as admin:
            superadmin.post("/api/admin/login", json={
                "username": "admin", "password": "a long test password",
            })
            with connect_database() as connection:
                connection.execute(
                    "INSERT INTO admin_accounts (username, password_hash) VALUES (?, ?)",
                    ("editor", PasswordHasher(type=Type.ID).hash("editor password")),
                )
            login = admin.post("/api/admin/login", json={
                "username": "editor", "password": "editor password",
            })
            self.assertEqual(login.json()["role"], "admin")
            self.assertEqual(superadmin.get("/api/admin/session").json()["role"], "superadmin")
            category_id = admin.get("/api/admin/categories").json()[0]["id"]
            place = admin.post("/api/admin/places", json={
                "name": "Beach", "category_id": category_id,
                "latitude": 35.3, "longitude": 25.2, "published": True,
                "link_url": "https://example.com/beach",
            }).json()
            note = admin.post("/api/admin/notes", json={
                "name": "Private note", "latitude": 35.3, "longitude": 25.2,
            }).json()
            zone_input = {
                "name": "Test zone", "min_lat": 35.0, "max_lat": 35.5,
                "min_lon": 25.0, "max_lon": 25.5,
            }
            self.assertEqual(admin.post("/api/admin/zones", json={**zone_input, "about_title": "Welcome"}).status_code, 422)
            self.assertEqual(admin.post("/api/admin/zones", json={**zone_input, "about_text": "Hello"}).status_code, 422)
            zone = admin.post("/api/admin/zones", json={
                **zone_input, "about_title": "Welcome", "about_text": "Our favourite places.",
            }).json()
            second_zone = admin.post("/api/admin/zones", json={
                "name": "Second zone", "min_lat": 34.0, "max_lat": 34.5,
                "min_lon": 24.0, "max_lon": 24.5,
                "about_title": "Another area", "about_text": "More to discover.",
            }).json()
            shared = admin.post("/api/admin/shared-maps", json={
                "internal_name": "Test", "public_title": "Test",
                "zone_ids": [zone["id"], second_zone["id"]], "category_ids": [category_id],
                "expires_at": "2035-01-01T00:00:00Z",
            }).json()
            public_url = f"/api/shared/{shared['token']}"
            self.assertEqual(len(admin.get(public_url).json()["places"]), 1)
            self.assertEqual(admin.get(public_url).json()["places"][0]["link_url"], "https://example.com/beach")
            self.assertEqual(
                {item["about_title"]: item["about_text"] for item in admin.get(public_url).json()["zones"]},
                {"Welcome": "Our favourite places.", "Another area": "More to discover."},
            )
            self.assertEqual(admin.patch(
                f"/api/admin/zones/{zone['id']}/archive", json={"archived": True}
            ).status_code, 409)
            other_zone = admin.post("/api/admin/zones", json={
                "name": "Unused zone", "min_lat": 34.0, "max_lat": 34.5,
                "min_lon": 24.0, "max_lon": 24.5,
            }).json()
            zone_url = f"/api/admin/zones/{other_zone['id']}"
            self.assertEqual(admin.patch(f"{zone_url}/archive", json={"archived": True}).status_code, 204)
            self.assertEqual(len(admin.get("/api/admin/zones?archived=true").json()), 1)
            self.assertEqual(admin.delete(zone_url).status_code, 403)
            self.assertEqual(admin.patch(f"{zone_url}/archive", json={"archived": False}).status_code, 204)
            self.assertEqual(admin.patch(f"{zone_url}/archive", json={"archived": True}).status_code, 204)
            self.assertEqual(superadmin.delete(zone_url).status_code, 204)

            for collection, item in (("places", place), ("notes", note)):
                url = f"/api/admin/{collection}/{item['id']}"
                self.assertEqual(admin.delete(url).status_code, 403)
                self.assertEqual(admin.patch(f"{url}/archive", json={"archived": True}).status_code, 204)
                self.assertEqual(admin.get(f"/api/admin/{collection}").json(), [])
                self.assertEqual(len(admin.get(f"/api/admin/{collection}?archived=true").json()), 1)
                self.assertEqual(admin.delete(url).status_code, 403)
            self.assertEqual(admin.get(public_url).json()["places"], [])
            self.assertEqual(admin.patch(
                f"/api/admin/notes/{note['id']}/archive", json={"archived": False}
            ).status_code, 204)
            self.assertEqual(len(admin.get("/api/admin/notes").json()), 1)
            self.assertEqual(admin.patch(
                f"/api/admin/places/{place['id']}/archive", json={"archived": False}
            ).status_code, 204)
            self.assertEqual(len(admin.get("/api/admin/places").json()), 1)
            self.assertEqual(admin.patch(
                f"/api/admin/places/{place['id']}/archive", json={"archived": True}
            ).status_code, 204)
            self.assertEqual(admin.patch(
                f"/api/admin/notes/{note['id']}/archive", json={"archived": True}
            ).status_code, 204)
            self.assertEqual(superadmin.delete(f"/api/admin/places/{place['id']}").status_code, 204)
            self.assertEqual(superadmin.delete(f"/api/admin/notes/{note['id']}").status_code, 204)


if __name__ == "__main__":
    unittest.main()
