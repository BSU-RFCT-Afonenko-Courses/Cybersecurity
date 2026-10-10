#!/usr/bin/env bash
set -euo pipefail
repo=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)
cd "$repo"
for scope in . theory task seminars; do
  (cd "$scope"; quarto add Afonenko-Course-Tools/quarto-course@v5.0.1 --no-prompt)
  (cd "$scope"; quarto add Afonenko-Course-Tools/quarto-reference-catalog@v3.0.0 --no-prompt)
done
quarto add Afonenko-Course-Tools/quarto-project-publish@v5.0.0 --no-prompt
(cd task; quarto add Afonenko-Course-Tools/quarto-project-download@v3.0.0 --no-prompt)
