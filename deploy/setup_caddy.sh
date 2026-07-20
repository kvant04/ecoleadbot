#!/bin/bash
# Add elb.ecolusspb.ru to Caddy and restart.
set -e

CADDY="/opt/n8n/Caddyfile"

if [ ! -f "$CADDY" ]; then
  echo "ERROR: Caddyfile not found at $CADDY"
  exit 1
fi

echo "Using $CADDY"

if grep -q 'elb.ecolusspb.ru' "$CADDY"; then
  echo "elb.ecolusspb.ru already in Caddyfile"
else
  cat >> "$CADDY" <<'EOF'

elb.ecolusspb.ru {
    reverse_proxy ecoleadbot:8000
}
EOF
  echo "Added elb.ecolusspb.ru block"
fi

# Ensure ecoleadbot is reachable from Caddy (same Docker network as n8n stack)
if docker ps --format '{{.Names}}' | grep -qx ecoleadbot; then
  if docker network inspect n8n_default >/dev/null 2>&1; then
    docker network connect n8n_default ecoleadbot 2>/dev/null || true
  fi
fi

echo "--- Caddyfile tail ---"
tail -n 8 "$CADDY"

docker restart n8n-caddy-1
echo "Waiting for Caddy..."
sleep 5

echo "--- local health ---"
curl -s http://127.0.0.1:8000/api/health || true
echo ""

echo "--- https elb health ---"
curl -sk https://elb.ecolusspb.ru/api/health || echo "(HTTPS not ready yet)"
