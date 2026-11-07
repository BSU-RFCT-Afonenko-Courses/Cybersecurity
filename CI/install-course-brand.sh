#!/usr/bin/env bash
set -euo pipefail
repo=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)
brand_bundle=$(mktemp -d "${TMPDIR:-/tmp}/course-brand.XXXXXX")
trap 'rm -rf -- "$brand_bundle"' EXIT
quarto_brand_cli=${QUARTO:-quarto}

python3 - "$repo" "$brand_bundle/course-brand.zip" <<'PY'
from pathlib import Path
import sys
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(sys.argv[1])
source = root / "_extensions/course-brand"
with ZipFile(sys.argv[2], "w", compression=ZIP_DEFLATED) as package:
    for path in sorted(source.rglob("*")):
        if path.is_file():
            package.write(path, path.relative_to(root).as_posix())
PY

for scope in theory task seminars; do
  (cd "$repo/$scope"; "$quarto_brand_cli" add "$brand_bundle/course-brand.zip" --no-prompt)
done
