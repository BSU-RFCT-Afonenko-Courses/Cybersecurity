#!/usr/bin/env python3
"""Подготовка SVG из авторских DOT; Graphviz не нужен браузеру."""
from pathlib import Path
import subprocess
import re
ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / 'shared/visualizations'
# Три шкалы вычисляются из одного предметного набора, не из повторной таблицы.
copy_dot = subprocess.run(['node', str(ROOT/'CI/visualizations/copy-scales.mjs')], check=True, capture_output=True, text=True).stdout
(BASE/'data-integrity/graphs/copy-scales.dot').write_text(copy_dot)
for source in sorted(BASE.rglob('graphs/*.dot')):
    destination = source.parent.parent / 'static' / (source.stem + '.svg')
    destination.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(['dot', '-Tsvg', str(source), '-o', str(destination)], check=True)
    if source.name == 'model.dot':
        overview = source.read_text()
        if source.parent.parent.name == 'mac':
            overview = '\n'.join(line for line in overview.splitlines() if not re.search(r'id="(?:read|write)-', line))
        subprocess.run(['dot', '-Tsvg', '-o', str(destination.with_name('overview.svg'))], input=overview, text=True, check=True)
