#!/bin/sh
# Pulls the Rive advanced web runtime (not committed, ~2 MB) and copies
# reviewable .riv files into riv/.
#
# Approved production scenes come from the app bundle (assets/rive/).
# In-house scenes stay unbundled under rive-src/ until Nick approves their
# QA clips — generate those binaries from source, never from assets/rive/.
set -e; cd "$(dirname "$0")"
V=2.42.1; curl -sL "https://registry.npmjs.org/@rive-app/webgl2-advanced/-/webgl2-advanced-$V.tgz" | tar xz
cp package/webgl2_advanced.mjs .; cp package/rive.wasm webgl2_advanced.wasm; rm -rf package
mkdir -p riv
# Bundled, owner-approved production scenes. today-clouds.riv is not among them.
if ! ls ../../assets/rive/*.riv >/dev/null 2>&1; then
  echo "setup.sh: no bundled .riv files in assets/rive/" >&2
  exit 1
fi
cp ../../assets/rive/*.riv riv/

# Unbundled in-house candidates: compile when the Rive CLI is available, else
# copy any already-built binary from the scene's build/ directory.
export PATH="$HOME/.rive/bin:$PATH"
install_unbundled() {
  src=$1
  name=$2
  lib=$3
  built=$src/build/$name.riv
  if command -v rive >/dev/null 2>&1 && [ -f "$src/gen.py" ]; then
    (cd "$src" && PYTHONPATH=$lib python3 gen.py >/dev/null && rive . --once >/dev/null)
  fi
  if [ -f "$built" ]; then
    cp "$built" "riv/$name.riv"
  elif [ "$name" = "today-clouds" ]; then
    echo "setup.sh: today-clouds.riv is unbundled. Generate it from rive-src/today-clouds/ (see README) and re-run setup, or copy build/today-clouds.riv into riv/." >&2
  fi
}
install_unbundled ../today-clouds today-clouds ../lib
for d in ../scenes/*/; do
  n=$(basename "$d")
  install_unbundled "$d" "today-$n" ../../lib
done

echo "run: python3 server.py   then open http://localhost:8799/film.html"
