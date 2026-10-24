#!/usr/bin/env bash
set -euo pipefail
repo=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)
cd "$repo"
if [[ ! -f _site-student/reference-catalog.json ]]; then
  echo 'Сначала выполните bash CI/render.sh student: Body использует опубликованный QRC-каталог курса.' >&2
  exit 1
fi
node CI/access-control.test.mjs
TASK_CYBER_CHECK_ROOT=${1:-$(mktemp -d)}
mkdir -p "$TASK_CYBER_CHECK_ROOT"
TASK_CYBER_CHECK_ROOT=$(realpath "$TASK_CYBER_CHECK_ROOT")
quarto run task/_extensions/Afonenko-Course-Tools/course-core/entrypoints/project-checks.ts -- \
  --book task --output "$TASK_CYBER_CHECK_ROOT/checks.json"
quarto run _extensions/Afonenko-Course-Tools/course-core/entrypoints/export.ts \
  --book task --work sec-work-data-integrity-backup --output "$TASK_CYBER_CHECK_ROOT/backup.json"
quarto run _extensions/Afonenko-Course-Tools/course-core/entrypoints/export.ts \
  --book task --work sec-work-access-control --output "$TASK_CYBER_CHECK_ROOT/access-control.json"
python3 CI/check-access-control.py body "$TASK_CYBER_CHECK_ROOT"
printf 'Модель и выбранный Body проверены; результаты: %s\n' "$TASK_CYBER_CHECK_ROOT"
