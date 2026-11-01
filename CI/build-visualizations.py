#!/usr/bin/env python3
"""Подготовка SVG из авторских DOT; Graphviz не нужен браузеру."""
from pathlib import Path
import subprocess
ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / 'shared/visualizations'
# Три шкалы вычисляются из одного предметного набора, не из повторной таблицы.
copy_dot = subprocess.run(['node', str(ROOT/'CI/visualizations/copy-scales.mjs')], check=True, capture_output=True, text=True).stdout
(BASE/'data-integrity/graphs/copy-scales.dot').write_text(copy_dot)
for source in sorted(BASE.rglob('graphs/*.dot')):
    destination = source.parent.parent / 'static' / (source.stem + '.svg')
    destination.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(['dot', '-Tsvg', str(source), '-o', str(destination)], check=True)
