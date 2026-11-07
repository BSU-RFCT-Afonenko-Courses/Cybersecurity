"""Изолированные проверки извлечения решений, видимости и модулей OJS."""
import base64
import importlib.util
import json
import tempfile
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('access_check', ROOT/'CI/check-access-control.py')
check = importlib.util.module_from_spec(spec)
spec.loader.exec_module(check)


class Inventory(unittest.TestCase):
    def test_public_solutions_follow_declarations_and_defaults(self):
        source = '\n'.join([
            ':::: {#exr-visible course-role="demonstration" statement-visibility="open"}',
            'Условие', '::::',
            ':::: {#exr-discussion course-role="discussion" statement-visibility="open"}',
            'Условие', '::::',
            ':::: {#exr-restricted course-role="demonstration" statement-visibility="restricted"}',
            'Условие', '::::',
            ':::: {#exr-inherited}', 'Условие', '::::',
        ])
        defaults = {'course-role': 'demonstration', 'statement-visibility': 'open'}
        self.assertEqual(check.public_solution_ids(source, defaults),
                         {'sol-visible', 'sol-inherited'})
        self.assertEqual(check.public_solution_ids(source), {'sol-visible'})
        self.assertEqual(check.public_solution_ids(''), set())

    def test_short_solution_fingerprints_do_not_require_a_minimum_length(self):
        self.assertEqual(check.solution_fingerprints('Короткий ответ.'), {'короткий ответ'})
        self.assertEqual(check.solution_fingerprints(''), set())

    def test_existing_keys_are_audited_without_assignments_and_public_demo_is_allowed(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            bank = root / 'task/bank'
            bank.mkdir(parents=True)
            (bank / '_metadata.yml').write_text('default-exercise-statement-visibility: open\n')
            (bank / 'example.qmd').write_text('\n'.join([
                ':::: {#exr-private course-role="discussion"}', 'Условие', '::::',
                '::: {#sol-private}', 'Секретная формула.', ':::',
                ':::: {#exr-public course-role="demonstration"}', 'Условие', '::::',
                '::: {#sol-public}', 'Публичный разбор.', ':::',
            ]))
            student, full = root / 'student', root / 'full'
            for output in (student, full):
                (output / 'bank').mkdir(parents=True)
                (output / 'search.json').write_text('[]')
            public_html = '<div id="sol-public">Публичный разбор.</div>'
            (student / 'bank/example.html').write_text(public_html)
            (full / 'bank/example.html').write_text(
                public_html + '<div id="sol-private">Секретная формула.</div>')
            previous_root = check.ROOT
            try:
                check.ROOT = root
                check.check_site(student, full, targeted=True)
                for leak in ('Секретная формула.', 'sol-private'):
                    (student / 'search.json').write_text(json.dumps([leak]))
                    with self.subTest(leak=leak), self.assertRaises(ValueError):
                        check.check_site(student, full, targeted=True)
            finally:
                check.ROOT = previous_root

    def test_solution_attributes_and_fence_depth_do_not_hide_the_key(self):
        source = ':::: {#sol-example .solution}\nЗакрытый разбор.\n::::\n'
        block = check.SOLUTION_BLOCKS.search(source)
        self.assertEqual(block.group('identifier'), 'sol-example')
        self.assertEqual(block.group('body').strip(), 'Закрытый разбор.')
        self.assertEqual(check.SOLUTION_BLOCKS.sub('', source).strip(), '')

    def test_encoded_ojs_is_visible_to_the_public_solution_audit(self):
        source = 'Закрытый sol-example и текст решения'
        payload = {'contents': [{'source': source}]}
        encoded = base64.b64encode(json.dumps(payload).encode()).decode()
        html = f'<script type="ojs-module-contents">{encoded}</script>'
        self.assertEqual(check.ojs_sources(html), [source])
        self.assertEqual(check.ojs_sources('<p>Обычная страница</p>'), [])


if __name__ == '__main__':
    unittest.main()
