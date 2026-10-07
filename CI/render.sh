#!/usr/bin/env bash
set -euo pipefail
repo=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)
cd "$repo"
profile=${1:-student}
case "$profile" in
  student|full) ;;
  *) echo "Неизвестный профиль: $profile (ожидается student или full)" >&2; exit 2 ;;
esac
export XDG_CACHE_HOME="${XDG_CACHE_HOME:-$repo/.quarto/cache}"
mkdir -p "$XDG_CACHE_HOME"
mkdir -p ci-logs
log=$(mktemp "ci-logs/render-${profile}-XXXXXX.log")
export COURSE_BUILD_TRACE="$repo/ci-logs/subprojects.jsonl"
echo "Сборка профиля $profile; журнал: $log"
if quarto render . --profile "$profile" --log-level debug 2>&1 | tee "$log"; then
  echo "Профиль $profile собран"
else
  status=$?
  message="Сборка Quarto для профиля $profile завершилась с кодом $status. См. $log и ci-logs/subprojects.jsonl."
  echo "$message" >&2
  if [[ ${GITHUB_ACTIONS:-} == true ]]; then
    echo "::error title=Ошибка сборки курса::$message"
  fi
  exit "$status"
fi
