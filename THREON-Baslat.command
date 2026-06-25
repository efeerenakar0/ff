#!/bin/zsh
cd "$(dirname "$0")"

echo "THREON yerel sunucu baslatiliyor..."
echo "Adres: http://127.0.0.1:4174/"
echo ""

EXISTING_PID=$(/usr/sbin/lsof -tiTCP:4174 -sTCP:LISTEN 2>/dev/null)
if [ -n "$EXISTING_PID" ]; then
  echo "Eski THREON sunucusu kapatiliyor..."
  kill $EXISTING_PID 2>/dev/null
  sleep 1
fi

(sleep 4 && open "http://127.0.0.1:4174/") &
PORT=4174 npm start
