#!/usr/bin/env python3
"""Готовить схемы и канонические фрагменты до инвентаризации Core."""
from pathlib import Path
import importlib.util
import re
import subprocess
from bank_requests import group_requests
ROOT = Path(__file__).resolve().parents[1]
if Path.cwd().resolve() == ROOT:
    for project in ('theory', 'seminars', 'task'):
        subprocess.run(['python3', str(Path(__file__).resolve())], cwd=ROOT/project, check=True)
    raise SystemExit(0)
PROJECT = Path.cwd().name
if PROJECT == 'task':
    subprocess.run(['python3', str(ROOT/'CI/prepare-visualizations.py'), PROJECT], check=True)
    raise SystemExit(0)
if PROJECT not in ('theory', 'seminars'):
    raise SystemExit('Подготовка запускается из theory, seminars или task')
subprocess.run(['python3', str(ROOT/'CI/build-visualizations.py')], check=True)
subprocess.run(['python3', str(ROOT/'CI/prepare-visualizations.py'), PROJECT], check=True)
spec = importlib.util.spec_from_file_location('bank_fragments', ROOT/'CI/prepare-bank-fragments.py')
bank = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bank)
needed = set()
for document in (ROOT/PROJECT).glob('*.qmd'):
    needed.update(re.findall(r'include\s+_prepared/bank-fragments/(exr-[\w-]+)\.qmd', document.read_text()))
for source, identifiers in group_requests(needed, (ROOT/'task/bank').glob('*.qmd')).items():
    bank.prepare(source, identifiers, ROOT/PROJECT/'_prepared/bank-fragments', statement_only=(PROJECT == 'seminars'))
