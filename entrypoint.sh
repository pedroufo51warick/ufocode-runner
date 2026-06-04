#!/usr/bin/env bash
set -euo pipefail

: "${PORT:=8080}"
: "${UFOCODE_RUNNER_KEY:?UFOCODE_RUNNER_KEY missing}"

# Volume persistente Fly em /data — guarda overrides do user em /data/src
mkdir -p /data/src

# Overlay: copia template inicial pra /data na primeira boot
if [ ! -f /data/.initialized ]; then
  echo "[entrypoint] inicializando /data com template"
  cp -an /app/src/. /data/src/
  touch /data/.initialized
fi

# Linka /data/src sobre /app/src pra que o vite leia as edições do user
rm -rf /app/src
ln -s /data/src /app/src

# Sobe vite na porta interna 8082
cd /app
npm run dev -- --host 127.0.0.1 --port 8082 &
VITE_PID=$!

# Sobe servidor de controle na porta pública $PORT (faz proxy pro vite)
UFOCODE_RUNNER_KEY="$UFOCODE_RUNNER_KEY" \
  VITE_PORT=8082 \
  PORT="$PORT" \
  exec node /runner-server/index.js