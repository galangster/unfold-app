#!/bin/sh
# Regenerates and builds every scene in rive-src/scenes, then copies the .riv files into assets/rive and the harness.
set -e; cd "$(dirname "$0")"; export PATH="$HOME/.rive/bin:$PATH"
for d in scenes/*/; do n=$(basename "$d"); (cd "$d" && PYTHONPATH=../../lib python3 gen.py >/dev/null && rive . --once 2>&1 | tail -1); done
