"""Проверки воспроизводимости локальной поправки Navigation."""
import importlib.util
from pathlib import Path
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('navigation_patch', ROOT / 'CI/apply-navigation-local-links.py')
patch = importlib.util.module_from_spec(spec)
spec.loader.exec_module(patch)
INSTALLED = (ROOT / patch.UI_PATH).read_text()
ORIGINAL = INSTALLED.replace(patch.HELPER, '', 1).replace(patch.PATCHED_LINK, patch.ORIGINAL_LINK, 1)


class NavigationPatch(unittest.TestCase):
    def test_installed_change_is_reproducible_and_idempotent(self):
        self.assertEqual(patch.patch_ui(ORIGINAL), INSTALLED)
        self.assertEqual(patch.patch_ui(INSTALLED), INSTALLED)

    def test_unknown_or_partially_changed_ui_is_rejected(self):
        for source in ('', ORIGINAL.replace(patch.ORIGINAL_LINK, 'другая реализация'),
                       INSTALLED.replace(patch.PATCHED_LINK, patch.ORIGINAL_LINK)):
            with self.subTest(source=source[:40]), self.assertRaises(ValueError):
                patch.patch_ui(source)

    def test_incompatible_copy_stops_all_changes_before_writing(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for scope in patch.SCOPES:
                path = root / scope / patch.UI_PATH
                path.parent.mkdir(parents=True)
                path.write_text(ORIGINAL)
            incompatible = root / patch.SCOPES[-1] / patch.UI_PATH
            incompatible.write_text('другая версия Navigation')
            with self.assertRaises(ValueError):
                patch.apply(root)
            for scope in patch.SCOPES[:-1]:
                self.assertEqual((root / scope / patch.UI_PATH).read_text(), ORIGINAL)

    def test_repeated_application_does_not_rewrite_any_copy(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for scope in patch.SCOPES:
                path = root / scope / patch.UI_PATH
                path.parent.mkdir(parents=True)
                path.write_text(ORIGINAL)
            patch.apply(root)
            before = {(root / scope / patch.UI_PATH): (root / scope / patch.UI_PATH).stat().st_mtime_ns
                      for scope in patch.SCOPES}
            patch.apply(root)
            self.assertEqual({path: path.stat().st_mtime_ns for path in before}, before)
            for path in before:
                self.assertEqual(path.read_text(), INSTALLED)


if __name__ == '__main__':
    unittest.main()
