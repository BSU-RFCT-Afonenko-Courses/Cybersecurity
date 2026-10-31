"""Назначенная работа сохраняет 13 задач, публичный аудит охватывает расширенный банк."""
import importlib.util
from pathlib import Path
import unittest
ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('access_check', ROOT/'CI/check-access-control.py')
check = importlib.util.module_from_spec(spec)
spec.loader.exec_module(check)
class Inventory(unittest.TestCase):
    def test_expanded_bank_and_missing_assigned_solution(self):
        assigned = {'sol-'+qid[4:] for qid in check.assigned_ids()}
        expanded = assigned | {'sol-access-short-'+str(i) for i in range(5)}
        self.assertEqual(len(assigned), 13)
        check.validate_solution_inventory(expanded)
        with self.assertRaises(ValueError):
            check.validate_solution_inventory(expanded-{next(iter(assigned))})
if __name__ == '__main__': unittest.main()
