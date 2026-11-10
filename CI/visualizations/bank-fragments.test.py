import importlib.util
import json
import pathlib
import subprocess
import tempfile
import unittest
from unittest.mock import patch
import sys
sys.dont_write_bytecode=True
ROOT=pathlib.Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('fragments', ROOT/'CI/prepare-bank-fragments.py')
fragments=importlib.util.module_from_spec(spec); spec.loader.exec_module(fragments)

def div(id, text='', attrs=(), children=(), classes=()):
    paragraphs = [{'t':'Para','c':[{'t':'Str','c':text}]}] if text else []
    return {'t':'Div','c':[[id,list(classes),list(attrs)],list(children)+paragraphs]}

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
    def test_statement_only_omits_paired_solution_and_preserves_statement(self):
        attributes=[('course-role','demonstration'),('target','sec-work-example'),('difficulty','intermediate'),('statement-visibility','open')]
        statement=div('exr-chosen','УСЛОВИЕ',attributes,classes=['numbered'])
        ast={'blocks':[statement,div('sol-chosen','ПАРНЫЙ_РАЗБОР')]}
        original=json.dumps(ast,ensure_ascii=False)
        selected=fragments.select_blocks(ast,['exr-chosen'],statement_only=True)
        self.assertEqual(1,len(selected))
        self.assertEqual('Div',selected[0]['t'])
        self.assertEqual(['exr-chosen',['numbered']],selected[0]['c'][0][:2])
        self.assertEqual({'course-role':'discussion','target':'manual','difficulty':'intermediate','statement-visibility':'open'},dict(selected[0]['c'][0][2]))
        self.assertEqual(statement['c'][1],selected[0]['c'][1])
        self.assertEqual(original,json.dumps(ast,ensure_ascii=False))
        self.assertEqual(['exr-chosen','sol-chosen'],[block['c'][0][0] for block in fragments.select_blocks(ast,['exr-chosen'])])
    def test_statement_only_removes_nested_solutions_and_empty_wrappers(self):
        named=div('sol-nested','ИМЕНОВАННЫЙ_РАЗБОР')
        anonymous=div('','АНОНИМНЫЙ_РАЗБОР',classes=['solution'])
        wrapper=div('wrapper',children=[named,anonymous])
        quote={'t':'BlockQuote','c':[div('sol-quoted','РАЗБОР_В_ЦИТАТЕ')]}
        listing={'t':'BulletList','c':[[div('sol-listed','РАЗБОР_В_СПИСКЕ')]]}
        note=div('note','НЕОБХОДИМОЕ_УСЛОВИЕ',children=[div('','ЕЩЁ_РАЗБОР',classes=['solution'])])
        statement=div('exr-nested','ВОПРОС',children=[wrapper,quote,listing,note])
        selected=fragments.select_blocks({'blocks':[statement]},['exr-nested'],statement_only=True)
        self.assertEqual([note['c'][1][-1]],selected[0]['c'][1][0]['c'][1])
        self.assertEqual(['note'],[node['c'][0][0] for node in fragments.nodes(selected[0]['c'][1]) if node.get('t')=='Div'])
        self.assertNotIn('РАЗБОР',json.dumps(selected,ensure_ascii=False))
        self.assertEqual([statement],fragments.select_blocks({'blocks':[statement]},['exr-nested']))
    def test_prepare_roundtrip_keeps_native_exercise_and_default_solutions(self):
        fixture='''---
default-exercise-course-role: demonstration
---

::::: {#exr-roundtrip difficulty="introductory" statement-visibility="open"}
### Выбор операции {#sec-local-operation}

Исходные данные задачи.

| Процесс | Файл | Операция |
|---|---|---|
| Редактор | Отчёт | Чтение |

:::: {.wrapper}
::: {#sol-inner}
Вложенный разбор.
:::

::: {.solution}
Анонимный разбор.
:::
::::

Назовите допустимую операцию.
:::::

::: {#sol-roundtrip}
Отдельный разбор.
:::
'''
        with tempfile.TemporaryDirectory() as directory:
            root=pathlib.Path(directory)
            bank=root/'task/bank'
            bank.mkdir(parents=True)
            (bank/'_metadata.yml').write_text('default-exercise-target: manual\ndefault-exercise-course-role: independent-study\n',encoding='utf-8')
            source=bank/'example.qmd'
            source.write_text(fixture,encoding='utf-8')
            with patch.object(fragments,'ROOT',root):
                fragments.prepare(source,['exr-roundtrip'],root/'seminars/fragments',statement_only=True)
                fragments.prepare(source,['exr-roundtrip'],root/'theory/fragments')
            def read_ast(project):
                result=subprocess.run(['quarto','pandoc',str(root/project/'fragments/exr-roundtrip.qmd'),'--from','markdown','--to','json'],check=True,capture_output=True,text=True)
                return json.loads(result.stdout)
            seminar=read_ast('seminars')
            exercises=[node for node in fragments.nodes(seminar['blocks']) if node.get('t')=='Div' and node['c'][0][0].startswith('exr-')]
            self.assertEqual(1,len(exercises))
            self.assertEqual('exr-roundtrip',exercises[0]['c'][0][0])
            self.assertEqual({'target':'manual','course-role':'discussion','difficulty':'introductory','statement-visibility':'open'},dict(exercises[0]['c'][0][2]))
            self.assertNotIn('разбор',json.dumps(seminar,ensure_ascii=False))
            self.assertIn('Исходные',json.dumps(seminar,ensure_ascii=False))
            tables=[node for node in fragments.nodes(exercises[0]) if node.get('t')=='Table']
            self.assertEqual(1,len(tables))
            self.assertIsNone(tables[0]['c'][1][0])
            headers=[node for node in fragments.nodes(exercises[0]) if node.get('t')=='Header']
            self.assertEqual(1,len(headers))
            self.assertEqual([4,['sec-local-operation',[],[]]],headers[0]['c'][:2])
            self.assertIn('операции',json.dumps(headers[0],ensure_ascii=False))
            default=read_ast('theory')
            divs=[node for node in fragments.nodes(default['blocks']) if node.get('t')=='Div']
            self.assertEqual(['exr-roundtrip','','sol-inner','','sol-roundtrip'],[node['c'][0][0] for node in divs])
            self.assertEqual('demonstration',dict(divs[0]['c'][0][2])['course-role'])
            self.assertIn('solution',divs[3]['c'][0][1])
            default_headers=[node for node in fragments.nodes(default['blocks']) if node.get('t')=='Header']
            self.assertEqual([3,['sec-local-operation',[],[]]],default_headers[0]['c'][:2])
    def test_missing_duplicate_and_non_exercise_are_rejected(self):
        for ast,ids in [({'blocks':[]},['exr-absent']),({'blocks':[div('exr-a'),div('exr-a')]},['exr-a']),({'blocks':[div('sol-a')]},['sol-a'])]:
            with self.assertRaises(ValueError):fragments.select_blocks(ast,ids)

if __name__=='__main__':unittest.main()
