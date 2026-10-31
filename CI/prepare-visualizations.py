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
    for directory in ['common','access-control']:
        if (destination/directory).exists(): shutil.rmtree(destination/directory)
        shutil.copytree(ROOT/'shared/visualizations'/directory,destination/directory)
    shutil.copyfile(ROOT/'shared/visualizations/_mac-example.qmd',destination/'mac-example.qmd')
    adapter=destination/'common/runtime.js'
    adapter.write_text(adapter.read_text().replace('../../../extensions/course-visualizations/_extensions/','../../../_extensions/'))
    print(destination.relative_to(ROOT))
