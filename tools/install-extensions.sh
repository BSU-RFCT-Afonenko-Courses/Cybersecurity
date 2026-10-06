#!/usr/bin/env bash
# Install tagged extension bundles through Quarto; run from any directory.
# Course v2.1.1 is prepared locally; its remote tag must be published first.
set -euo pipefail
repo=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)
quarto=${QUARTO:-quarto}
cd "$repo"

# Course installs Core, Presentation and Navigation together.
# Authored YAML selects the filters and plugins that are used.
for scope in . theory tasks lectures practice handbook; do
  (cd "$scope"; "$quarto" add Afonenko-Course-Tools/quarto-course@v2.1.1 --no-prompt)
done
for scope in . theory tasks lectures practice handbook; do
  (cd "$scope"; "$quarto" add Afonenko-Course-Tools/quarto-reference-catalog@v2.1.0 --no-prompt)
done
"$quarto" add Afonenko-Course-Tools/quarto-project-publish@v3.0.1 --no-prompt
(cd tasks; "$quarto" add Afonenko-Course-Tools/quarto-project-download@v1.0.1 --no-prompt)
