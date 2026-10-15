"""Exercise the real Admin HTTP routes and cookie lifecycle."""

import os
import tempfile
import unittest
from unittest.mock import patch

from argon2 import PasswordHasher
from argon2.low_level import Type
from fastapi.testclient import TestClient

from auth import COOKIE_NAME
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
            category_id = client.get("/api/admin/categories").json()[0]["id"]
            place = {
                "name": "  Knossos  ",
                "category_id": category_id,
                "latitude": 35.298,
                "longitude": 25.163,
                "published": False,
            }
            self.assertEqual(
                client.post("/api/admin/places", json={**place, "category_id": 999}).status_code,
                422,
            )
            response = client.post("/api/admin/places", json=place)
            self.assertEqual(response.status_code, 201)
            self.assertEqual(response.json()["name"], "Knossos")
            self.assertEqual(client.get("/api/admin/places").json()[0]["id"], response.json()["id"])

    def test_admin_can_create_private_notes(self):
        with TestClient(app) as client:
            self.assertEqual(client.get("/api/admin/notes").status_code, 401)
            client.post(
                "/api/admin/login",
                json={"username": "admin", "password": "a long test password"},
            )
            note = {"name": "Remember this", "latitude": 35.3, "longitude": 25.2}
            self.assertEqual(
                client.post("/api/admin/notes", json={**note, "published": True}).status_code,
                422,
            )
            response = client.post("/api/admin/notes", json=note)
            self.assertEqual(response.status_code, 201)
            self.assertEqual(response.json()["kind"], "NOTE")
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
            self.assertEqual(client.delete(f"/api/admin/places/{place['id']}").status_code, 204)
            self.assertEqual(client.delete(f"/api/admin/notes/{note['id']}").status_code, 204)
            self.assertEqual(client.get("/api/admin/places").json(), [])
            self.assertEqual(client.get("/api/admin/notes").json(), [])


if __name__ == "__main__":
    unittest.main()
