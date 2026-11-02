#!/bin/sh
export DENO_NO_PACKAGE_JSON=1
export QUARTO_RUN_NO_NETWORK=true
exec "${QUARTO:-quarto}" run "$(dirname "$0")/early-filter.ts" "$@"
