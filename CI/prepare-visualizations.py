#!/usr/bin/env python3
"""Материализовать общие QMD-включения внутри нативных проектов Core."""
from pathlib import Path
import argparse
import shutil
import re
ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('projects',nargs='+',choices=['theory','seminars','task'])
args=parser.parse_args()
for project in args.projects:
    destination=ROOT/project/'_prepared/visualizations'
    destination.mkdir(parents=True,exist_ok=True)
    source_root=ROOT/'shared/visualizations'
    if project == 'task':
        # Банк получает только используемые статические рисунки, без модулей опытов.
        requested=set()
        for document in (ROOT/project/'bank').glob('*.qmd'):
            requested.update(re.findall(r'_prepared/visualizations/([^\s)"{}]+\.svg)', document.read_text()))
        for old in destination.rglob('*'):
            if old.is_file() and old.relative_to(destination).as_posix() not in requested:
                old.unlink()
        for relative in requested:
            source=source_root/relative
            if not source.is_file() or not source.resolve().is_relative_to(source_root.resolve()):
                raise ValueError(f'Не найден общий рисунок банка: {relative}')
            target=destination/relative
            target.parent.mkdir(parents=True,exist_ok=True)
            shutil.copyfile(source,target)
        print(destination.relative_to(ROOT))
        continue
    for source in sorted(source_root.iterdir()):
        if source.is_dir():
            target=destination/source.name
            if target.exists(): shutil.rmtree(target)
            shutil.copytree(source,target)
        elif source.suffix=='.qmd' and source.name.startswith('_'):
            shutil.copyfile(source,destination/source.name[1:])
    adapter=destination/'common/runtime.js'
    installed_runtime=ROOT/project/'_extensions/course-visualizations/browser/runtime.js'
    public_runtime=destination/'common/course-runtime.js'
    shutil.copyfile(installed_runtime,public_runtime)
    if public_runtime.read_bytes()!=installed_runtime.read_bytes():
        raise ValueError('Публичная копия runtime отличается от установленного расширения')
    adapter.write_text(adapter.read_text().replace('../../../extensions/course-visualizations/_extensions/course-visualizations/browser/runtime.js','./course-runtime.js'))
    print(destination.relative_to(ROOT))
