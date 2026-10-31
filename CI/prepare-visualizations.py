#!/usr/bin/env python3
"""Материализовать общие QMD-включения внутри нативных проектов Core."""
from pathlib import Path
import argparse
import shutil
ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('projects',nargs='+',choices=['theory','seminars'])
args=parser.parse_args()
for project in args.projects:
    destination=ROOT/project/'_prepared/visualizations'
    destination.mkdir(parents=True,exist_ok=True)
    for directory in ['common','access-control','authentication','crypto','data-integrity']:
        if (destination/directory).exists(): shutil.rmtree(destination/directory)
        shutil.copytree(ROOT/'shared/visualizations'/directory,destination/directory)
    # Только три используемые публичные схемы, без старой галереи и её runtime.
    legacy=destination/'access-control/legacy/static'
    legacy.mkdir(parents=True,exist_ok=True)
    for filename in ['software.svg','procedures.svg','moodle.svg']:
        shutil.copyfile(ROOT/'shared/access-control/static'/filename,legacy/filename)
    shutil.copyfile(ROOT/'shared/visualizations/_mac-example.qmd',destination/'mac-example.qmd')
    adapter=destination/'common/runtime.js'
    installed_runtime=ROOT/project/'_extensions/course-visualizations/browser/runtime.js'
    public_runtime=destination/'common/course-runtime.js'
    shutil.copyfile(installed_runtime,public_runtime)
    if public_runtime.read_bytes()!=installed_runtime.read_bytes():
        raise ValueError('Публичная копия runtime отличается от установленного расширения')
    adapter.write_text(adapter.read_text().replace('../../../extensions/course-visualizations/_extensions/course-visualizations/browser/runtime.js','./course-runtime.js'))
    print(destination.relative_to(ROOT))
