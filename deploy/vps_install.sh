#!/bin/bash
# EcoLeadBot VPS install (Ubuntu/Debian)
set -e

echo "=== EcoLeadBot VPS install ==="

if ! command -v docker >/dev/null 2>&1; then
  echo "Installing Docker..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "ERROR: docker compose not found"
  exit 1
fi

if [ ! -f .env ]; then
  echo "ERROR: .env not found"
  exit 1
fi

docker compose build
docker compose up -d

echo ""
echo "=== Done ==="
echo "Check: curl http://127.0.0.1:8000/api/health"
