#!/bin/bash
# EcoLeadBot install on VPS
set -e

cd /opt/ecoleadbot

echo "=== EcoLeadBot install ==="

if [ ! -f .env ]; then
  echo "ERROR: /opt/ecoleadbot/.env not found"
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "ERROR: docker compose not found"
  exit 1
fi

chmod +x deploy/vps_install.sh deploy/vps_update.sh 2>/dev/null || true
bash deploy/vps_install.sh

echo ""
echo "=== Health check ==="
sleep 3
curl -sf http://127.0.0.1:8000/api/health && echo ""
docker ps --format "table {{.Names}}\t{{.Ports}}\t{{.Status}}" | grep -E "NAMES|ecoleadbot" || docker ps
