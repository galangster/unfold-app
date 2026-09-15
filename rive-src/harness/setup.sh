#!/bin/sh
# Pulls the Rive advanced web runtime (not committed, ~2 MB) and links the app's .riv files.
set -e; cd "$(dirname "$0")"
V=2.42.1; curl -sL "https://registry.npmjs.org/@rive-app/webgl2-advanced/-/webgl2-advanced-$V.tgz" | tar xz
cp package/webgl2_advanced.mjs .; cp package/rive.wasm webgl2_advanced.wasm; rm -rf package
mkdir -p riv; cp ../../assets/rive/*.riv riv/
echo "run: python3 server.py   then open http://localhost:8799/film.html"
