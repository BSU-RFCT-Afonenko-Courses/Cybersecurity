#!/usr/bin/env python3
"""Три небольшие пробы маршрутизации; артефакты для ручного сравнения."""
from pathlib import Path
import re
import subprocess
root=Path(__file__).resolve().parents[2]
out=Path('/tmp/task4-graphviz-options');out.mkdir(exist_ok=True)
source=(root/'shared/visualizations/access-control/mac/graphs/model.dot').read_text()
auto=re.sub(r'\b([pf][123]?):(?:n|s|e|w|ne|nw|se|sw)\b',r'\1',source).replace('splines=polyline','splines=spline')
(out/'automatic.dot').write_text(auto)
(out/'ports.dot').write_text(source)
for name in ['automatic','ports']:
    subprocess.run(['dot','-Tsvg',str(out/f'{name}.dot'),'-o',str(out/f'{name}.svg')],check=True)
# Воспроизводим явно сохранённые координаты узлов и пути рёбер (pos).
layout=subprocess.run(['dot','-Tdot',str(out/'ports.dot')],capture_output=True,text=True,check=True).stdout
assert 'pos=' in layout
(out/'explicit-paths.dot').write_text(layout)
subprocess.run(['neato','-n2','-Tsvg',str(out/'explicit-paths.dot'),'-o',str(out/'explicit-paths.svg')],check=True)
for name in ['automatic','ports','explicit-paths']:
    print(name,(out/f'{name}.svg').stat().st_size)
