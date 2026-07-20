#!/bin/bash
# EcoLeadBot update on VPS
set -e

cd "$(dirname "$0")/.."

echo "=== EcoLeadBot update ==="

if [ ! -f .env ]; then
  echo "ERROR: .env not found"
  exit 1
fi

docker compose down --remove-orphans 2>/dev/null || true
docker rm -f ecoleadbot 2>/dev/null || true

docker compose build
docker compose up -d --force-recreate

# Caddy (n8n stack) проксирует elb.ecolusspb.ru -> ecoleadbot:8000 в сети n8n_default
if docker network inspect n8n_default >/dev/null 2>&1; then
  if ! docker inspect ecoleadbot --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}' | grep -q 'n8n_default'; then
    docker network connect n8n_default ecoleadbot 2>/dev/null || true
  fi
fi

echo "Waiting for health..."
for i in $(seq 1 30); do
  if curl -sf http://127.0.0.1:8000/api/health >/dev/null; then
    echo "OK: $(curl -s http://127.0.0.1:8000/api/health)"
    docker compose ps
    exit 0
  fi
  sleep 2
done

echo "Health check failed. Logs:"
docker compose logs --tail=80
exit 1
