#!/usr/bin/env bash
# Pruebas automáticas (solo desarrollo; en Plesk no se usan).
# Requisitos: PHP 8 (CLI), Node 20+ y Playwright con Chromium:
#   cd tests && npm install && npx playwright install chromium
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
OUT="$ROOT/tests/output"
SITE="$OUT/site"
APP_PORT=${APP_PORT:-8092}
MOCK_PORT=${MOCK_PORT:-8091}

rm -rf "$OUT"
mkdir -p "$SITE"
# Copia limpia del sitio: sin datos privados, sin caché y sin las pruebas.
tar -C "$ROOT" \
  --exclude=./.git --exclude=./tests --exclude=./docs \
  --exclude='./wj-content/data/keys.php' --exclude='./wj-content/data/store-*' --exclude='./wj-content/data/canary.json' \
  --exclude='./wj-admin/cache/tts/*.mp3' \
  -cf - . | tar -C "$SITE" -xf -
# Una «película» web en una carpeta junto a la presentación (como /ctIA-26/fagosEvo/).
cp -r "$ROOT/tests/fixtures/peliculaDemo" "$SITE/peliculaDemo"

cleanup() { kill "${PIDS[@]}" 2>/dev/null || true; }
PIDS=()
trap cleanup EXIT

WJ_MOCK_LOG="$OUT" php -S "127.0.0.1:$MOCK_PORT" "$ROOT/tests/mock-api/router.php" >"$OUT/mock-server.log" 2>&1 &
PIDS+=($!)
WJ_MOCK_API="http://127.0.0.1:$MOCK_PORT" php -d auto_prepend_file="$ROOT/tests/mock-api/prepend.php" \
  -S "127.0.0.1:$APP_PORT" -t "$SITE" >"$OUT/app-server.log" 2>&1 &
PIDS+=($!)
sleep 1

echo "== Sintaxis PHP"
find "$ROOT/wj-admin" -name '*.php' -print0 | xargs -0 -n1 php -l | grep -v '^No syntax errors' || true

echo "== Pruebas unitarias"
node --test "$ROOT"/tests/unit/*.test.mjs

echo "== Prueba de punta a punta (Playwright)"
BASE="http://127.0.0.1:$APP_PORT/" SITE="$SITE" OUT="$OUT" node "$ROOT/tests/e2e/run.mjs"
