#!/usr/bin/env bash
set -euo pipefail
dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)
exec "${QUARTO:-quarto}" run "$dir/late-filter.ts" "$@"
