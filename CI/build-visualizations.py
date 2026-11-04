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

# Широкая статичная схема использует те же узлы, что теория и интерактивные опыты.
crypto = BASE / 'crypto/static'
source = (crypto / 'symmetric-key.svg').read_text()
wide = source.replace('class="symmetric-key"', 'class="symmetric-key is-wide is-static-wide"', 1)
wide = wide.replace('viewBox="0 0 380 254" width="380" height="254"', 'viewBox="0 0 1454 275" width="1454" height="275"', 1)
(crypto / 'symmetric-key-slide.svg').write_text(wide)
