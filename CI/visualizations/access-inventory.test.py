"""Проверки охватывают действующий банк и исходники скомпилированных ячеек OJS."""
import base64
import importlib.util
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('access_check', ROOT/'CI/check-access-control.py')
check = importlib.util.module_from_spec(spec)
spec.loader.exec_module(check)


class Inventory(unittest.TestCase):
    def test_current_bank_and_missing_assigned_solution(self):
        assigned = {'sol-'+qid[4:] for qid in check.assigned_ids()}
        bank = (ROOT/'task/bank/access-control.qmd').read_text()
        solutions = {block.group('identifier') for block in check.SOLUTION_BLOCKS.finditer(bank)}
        self.assertTrue(solutions - assigned)
        check.validate_solution_inventory(solutions)
        with self.assertRaises(ValueError):
            check.validate_solution_inventory(solutions - {next(iter(assigned))})

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
