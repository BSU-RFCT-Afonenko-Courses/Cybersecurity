#!/usr/bin/env bash
set -euo pipefail
repo=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)
cd "$repo"
profile=${1:-student}
case "$profile" in
  student|full) ;;
  *) echo "Unknown profile: $profile (expected student or full)" >&2; exit 2 ;;
esac
export XDG_CACHE_HOME="${XDG_CACHE_HOME:-$repo/.quarto/cache}"
mkdir -p "$XDG_CACHE_HOME"
mkdir -p ci-logs
log=$(mktemp "ci-logs/render-${profile}-XXXXXX.log")
export COURSE_BUILD_TRACE="$repo/ci-logs/subprojects.jsonl"
echo "Rendering profile $profile; log: $log"
if quarto render . --profile "$profile" --log-level debug 2>&1 | tee "$log"; then
  echo "Rendered profile $profile"
else
  status=$?
  message="Quarto render failed for profile $profile (exit $status). See $log and ci-logs/subprojects.jsonl."
  echo "$message" >&2
  if [[ ${GITHUB_ACTIONS:-} == true ]]; then
    echo "::error title=Course build failed::$message"
  fi
  exit "$status"
fi
