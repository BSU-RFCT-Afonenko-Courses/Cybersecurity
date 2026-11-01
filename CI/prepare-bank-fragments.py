#!/usr/bin/env python3
"""Механический отбор Div из банка. Политику видимости применяет Course Core."""
import argparse
import copy
import json
from pathlib import Path
import subprocess
import yaml

ROOT = Path(__file__).resolve().parents[1]

def nodes(value):
    if isinstance(value,dict):
        yield value
        for child in value.values(): yield from nodes(child)
    elif isinstance(value,list):
        for child in value: yield from nodes(child)

def select_blocks(ast, ids):
    indexed = {}
    for node in nodes(ast['blocks']):
        if node.get('t') != 'Div': continue
        identifier = node['c'][0][0]
        if not identifier: continue
        if identifier in indexed: raise ValueError(f'Повторный ID: {identifier}')
        indexed[identifier] = node
    selected = []
    for identifier in ids:
        if not identifier.startswith('exr-') or identifier not in indexed: raise ValueError(f'Нет условия: {identifier}')
        statement = indexed[identifier]
        selected.append(copy.deepcopy(statement))
        solution_id = 'sol-' + identifier[4:]
        # Вложенный разбор уже входит в выбранное условие.
        nested = any(n.get('t') == 'Div' and n['c'][0][0] == solution_id for n in nodes(statement))
        if solution_id in indexed and not nested: selected.append(copy.deepcopy(indexed[solution_id]))
    return selected

def prepare(source, identifiers, output):
    source = source.resolve()
    if not source.is_relative_to(ROOT/'task/bank'): raise ValueError('Канонический источник должен находиться в task/bank')
    data = subprocess.run(['quarto','pandoc',str(source),'--from','markdown','--to','json'],check=True,capture_output=True,text=True)
    ast = json.loads(data.stdout)
    metadata = yaml.safe_load((source.parent/'_metadata.yml').read_text()) or {}
    # Переносятся только семантические defaults; метаданные страницы не копируются.
    defaults = {key[17:]:str(value) for key,value in metadata.items() if key.startswith('default-exercise-')}
    for key,value in ast['meta'].items():
        if key.startswith('default-exercise-'):
            # Скалярная строка Pandoc MetaInlines; сложные значения намеренно отклоняются.
            if value['t'] != 'MetaInlines': raise ValueError(f'Ожидался скаляр {key}')
            defaults[key[17:]] = ''.join(n.get('c',' ') for n in value['c'])
    output = output.resolve()
    output.mkdir(parents=True,exist_ok=True)
    for identifier in identifiers:
        blocks = select_blocks(ast,[identifier])
        statement = blocks[0]
        attributes = dict(statement['c'][0][2])
        statement['c'][0][2] = list((defaults | attributes).items())
        document = {'pandoc-api-version':ast['pandoc-api-version'],'meta':{},'blocks':blocks}
        markdown = subprocess.run(['quarto','pandoc','--from','json','--to','markdown','--wrap=none'],input=json.dumps(document),capture_output=True,text=True,check=True).stdout
        target = output/f'{identifier}.qmd'
        target.write_text('<!-- Создано CI/prepare-bank-fragments.py из '+str(source.relative_to(ROOT))+'; не редактировать. -->\n\n'+markdown)
        print(target.relative_to(ROOT))

if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source',type=Path,required=True)
    parser.add_argument('--id',action='append',required=True)
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args()
    prepare(args.source,args.id,args.output)
