#!/usr/bin/env bash
set -euo pipefail
repo=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)
cd "$repo"
for scope in . theory task seminars; do
  (cd "$scope"; quarto add Afonenko-Course-Tools/quarto-course@v8.2.8 --no-prompt)
  (cd "$scope"; quarto add Afonenko-Course-Tools/quarto-reference-catalog@v3.1.1 --no-prompt)
done
quarto add Afonenko-Course-Tools/quarto-project-publish@v5.1.4 --no-prompt
(cd task; quarto add Afonenko-Course-Tools/quarto-project-download@v3.2.2 --no-prompt)
