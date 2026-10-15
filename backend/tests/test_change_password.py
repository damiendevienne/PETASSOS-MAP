"""Check the interactive password change without touching the real .env."""

import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from dotenv import dotenv_values

import change_password


class ChangePasswordTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.old_hash = PasswordHasher().hash("previous password")

    def setUp(self):
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary_directory.cleanup)
        self.root = Path(self.temporary_directory.name)
        self.env_path = self.root / ".env"
        self.env_path.write_text(
            f"ADMIN_USERNAME=admin\nADMIN_PASSWORD_HASH={self.old_hash}\n"
            "SESSION_SECRET=previous-secret-with-more-than-32-characters\n"
            "DATA_DIR=custom-data\n",
            encoding="utf-8",
        )

    def test_change_accepts_five_characters_and_rotates_sessions(self):
        with patch.object(change_password, "PROJECT_ROOT", self.root), patch(
            "getpass.getpass", side_effect=["previous password", "short", "short"]
        ):
            change_password.main()

        values = dotenv_values(self.env_path)
        self.assertTrue(PasswordHasher().verify(values["ADMIN_PASSWORD_HASH"], "short"))
        with self.assertRaises(VerifyMismatchError):
            PasswordHasher().verify(values["ADMIN_PASSWORD_HASH"], "previous password")
        self.assertNotEqual(
            values["SESSION_SECRET"], "previous-secret-with-more-than-32-characters"
        )
        self.assertEqual(values["DATA_DIR"], "custom-data")
        self.assertEqual(os.stat(self.env_path).st_mode & 0o777, 0o600)

    def test_four_character_password_is_rejected(self):
        original = self.env_path.read_text(encoding="utf-8")
        with patch.object(change_password, "PROJECT_ROOT", self.root), patch(
            "getpass.getpass", side_effect=["previous password", "four"]
        ):
            with self.assertRaisesRegex(SystemExit, "at least 5"):
                change_password.main()
        self.assertEqual(self.env_path.read_text(encoding="utf-8"), original)


if __name__ == "__main__":
    unittest.main()
