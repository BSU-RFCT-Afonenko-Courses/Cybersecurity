"""Группировка повторно читает канонические источники и не скрывает пропавшие ID."""
from pathlib import Path
import importlib.util
import tempfile
import unittest
ROOT=Path(__file__).resolve().parents[2]
class Requests(unittest.TestCase):
 def test_group_and_recheck_changed_source(self):
  spec=importlib.util.spec_from_file_location('requests',ROOT/'CI/bank_requests.py')
  requests=importlib.util.module_from_spec(spec);spec.loader.exec_module(requests)
  with tempfile.TemporaryDirectory() as directory:
   a,b=Path(directory)/'a.qmd',Path(directory)/'b.qmd'
   a.write_text('::: {#exr-one}\nПервое\n:::\n::: {#exr-two}\nВторое\n:::')
   b.write_text('::: {#exr-three}\nТретье\n:::')
   self.assertEqual(requests.group_requests({'exr-three','exr-two','exr-one'},[a,b]),{a:['exr-one','exr-two'],b:['exr-three']})
   a.write_text('::: {#exr-one}\nПервое\n:::')
   with self.assertRaises(ValueError):requests.group_requests({'exr-two'},[a,b])
   b.write_text('::: {#exr-one}\nДубликат\n:::')
   with self.assertRaises(ValueError):requests.group_requests({'exr-one'},[a,b])
if __name__=='__main__':unittest.main()
