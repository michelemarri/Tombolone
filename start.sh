#!/usr/bin/env bash
# Avvia un server HTTP locale per il Tombolone e apre il browser.
set -euo pipefail
cd "$(dirname "$0")"

PORT="${PORT:-8080}"
URL="http://localhost:${PORT}/index.html"

if ! command -v python3 >/dev/null 2>&1; then
  echo "Manca python3. Installalo oppure apri index.html direttamente nel browser." >&2
  exit 1
fi

echo "Avvio Tombolone su ${URL}"
python3 -m http.server "$PORT" >/dev/null 2>&1 &
SERVER_PID=$!

# Aspetta che il server risponda (max ~2s); se il processo è morto subito
# (es. porta occupata) abortisce con messaggio chiaro invece di silenziosamente.
for _ in $(seq 1 20); do
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "Errore: porta ${PORT} occupata o python3 ha fallito. Cambia porta con PORT=8765 ./start.sh" >&2
    exit 1
  fi
  if curl -fs "http://localhost:${PORT}/" >/dev/null 2>&1; then break; fi
  sleep 0.1
done

if command -v open >/dev/null 2>&1; then
  open "$URL"
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$URL"
else
  echo "Apri manualmente nel browser: $URL"
fi

echo "Pronto. Ctrl+C per fermare."
trap "kill $SERVER_PID 2>/dev/null || true" EXIT
wait $SERVER_PID
