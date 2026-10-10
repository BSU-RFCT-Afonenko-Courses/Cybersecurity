#!/usr/bin/env bash
set -euo pipefail
repo=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)
cd "$repo"
TASK_CYBER_CHECK_ROOT=${1:-$(mktemp -d)}
mkdir -p "$TASK_CYBER_CHECK_ROOT"
TASK_CYBER_CHECK_ROOT=$(realpath "$TASK_CYBER_CHECK_ROOT")
quarto run task/_extensions/Afonenko-Course-Tools/course-core/entrypoints/project-checks.ts -- \
  --book task --output "$TASK_CYBER_CHECK_ROOT/checks.json"
quarto run _extensions/Afonenko-Course-Tools/course-core/entrypoints/export.ts \
  --book task --work sec-work-data-integrity-backup --output "$TASK_CYBER_CHECK_ROOT/backup.json"
printf 'Модель и выбранный Body проверены; результаты: %s\n' "$TASK_CYBER_CHECK_ROOT"
