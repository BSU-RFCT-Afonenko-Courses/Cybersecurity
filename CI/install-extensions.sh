#!/usr/bin/env bash
set -euo pipefail
repo=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)
cd "$repo"
python3 CI/prepare-course-visualizations.py
for scope in . theory task seminars; do
  (cd "$scope"; quarto add Afonenko-Course-Tools/quarto-course@v9.3.4 --no-prompt)
  (cd "$scope"; quarto add Afonenko-Course-Tools/quarto-reference-catalog@v3.2.0 --no-prompt)
done
quarto add Afonenko-Course-Tools/quarto-project-publish@v6.0.1 --no-prompt
(cd task; quarto add Afonenko-Course-Tools/quarto-project-download@v3.5.0 --no-prompt)
bash CI/install-course-brand.sh

for scope in theory seminars; do
  (cd "$scope"; quarto add ../extensions/course-visualizations --no-prompt)
done
