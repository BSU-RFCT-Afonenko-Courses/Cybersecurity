import importlib.util
import pathlib
import unittest
import sys
sys.dont_write_bytecode=True
ROOT=pathlib.Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('fragments', ROOT/'CI/prepare-bank-fragments.py')
fragments=importlib.util.module_from_spec(spec); spec.loader.exec_module(fragments)

def div(id, text='', attrs=(), children=()):
    return {'t':'Div','c':[[id,[],list(attrs)],list(children)+[{'t':'Para','c':[{'t':'Str','c':text}]}]]}

class Fragments(unittest.TestCase):
    def test_only_requested_statement_and_its_solution_without_page_metadata(self):
        ast={'meta':{'pagetitle':'НЕ_ПЕРЕНОСИТЬ'},'blocks':[div('exr-other','ДРУГАЯ_ЗАДАЧА'),div('exr-chosen','КАНОНИЧЕСКИЙ_ТЕКСТ'),div('sol-chosen','КЛЮЧ'),div('sol-other','ЧУЖОЙ_КЛЮЧ')]}
        selected=fragments.select_blocks(ast,['exr-chosen'])
        self.assertEqual(['exr-chosen','sol-chosen'],[b['c'][0][0] for b in selected])
        self.assertEqual(ast['blocks'][1:3],selected)
        self.assertNotIn('НЕ_ПЕРЕНОСИТЬ',str(selected))
    def test_nested_solution_is_not_duplicated_and_ids_are_preserved(self):
        statement=div('exr-demo','ВОПРОС',[('course-role','demonstration')],[div('sol-demo','РАЗБОР')])
        self.assertEqual([statement],fragments.select_blocks({'blocks':[statement]},['exr-demo']))
    def test_missing_duplicate_and_non_exercise_are_rejected(self):
        for ast,ids in [({'blocks':[]},['exr-absent']),({'blocks':[div('exr-a'),div('exr-a')]},['exr-a']),({'blocks':[div('sol-a')]},['sol-a'])]:
            with self.assertRaises(ValueError):fragments.select_blocks(ast,ids)

if __name__=='__main__':unittest.main()
