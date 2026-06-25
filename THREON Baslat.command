#!/bin/zsh
cd "$(dirname "$0")"

PORT="${PORT:-4174}"
URL="http://localhost:${PORT}/"

echo "THREON yerel sunucu baslatiliyor..."
echo "Adres: ${URL}"
echo ""

if command -v lsof >/dev/null 2>&1 && lsof -nP -iTCP:${PORT} -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Sunucu zaten calisiyor. Tarayici aciliyor..."
  open "${URL}"
  echo ""
  echo "Bu pencereyi kapatabilirsin."
  exit 0
fi

PORT="${PORT}" npm start &
SERVER_PID=$!

for i in {1..40}; do
  if command -v curl >/dev/null 2>&1 && curl -fsS "${URL}" >/dev/null 2>&1; then
    break
  fi
  sleep 0.25
done

open "${URL}"

echo ""
echo "THREON acildi."
echo "Bu pencere acik kaldigi surece site calisir."
echo "Kapatmak icin bu pencerede Ctrl + C kullan."
wait "${SERVER_PID}"
