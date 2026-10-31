#!/usr/bin/env python3
"""Подготовка сохранённых SVG; Graphviz не нужен браузеру."""
from pathlib import Path
import subprocess
import re
ROOT = Path(__file__).resolve().parents[1]
MAC = ROOT / 'shared/visualizations/access-control/mac'
for source, target in [('model','model'),('algorithm','algorithm')]:
    subprocess.run(['dot','-Tsvg',str(MAC/'graphs'/f'{source}.dot'),'-o',str(MAC/'static'/f'{target}.svg')],check=True)

# Обзор показывает устройство уровней; направленные потоки появляются в применении.
source=(MAC/'graphs/model.dot').read_text()
overview='\n'.join(line for line in source.splitlines() if not re.search(r'id="(?:read|write)-',line))
subprocess.run(['dot','-Tsvg','-o',str(MAC/'static/overview.svg')],input=overview,text=True,check=True)
