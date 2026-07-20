#!/bin/bash
# Run on VPS after /tmp/ecoleadbot_deploy.tar.gz uploaded
set -e

ARCH=/tmp/ecoleadbot_deploy.tar.gz
DIR=/opt/ecoleadbot

if [ ! -f "$ARCH" ]; then
  echo "ERROR: $ARCH not found"
  exit 1
fi

mkdir -p "$DIR"
cd "$DIR"
tar -xzf "$ARCH"
rm -f "$ARCH"
sed -i 's/\r$//' deploy/*.sh 2>/dev/null || true
chmod +x deploy/vps_install.sh deploy/vps_update.sh deploy/vps_bootstrap.sh 2>/dev/null || true

if [ ! -f .env ]; then
  echo "ERROR: .env missing in $DIR"
  exit 1
fi

bash deploy/vps_bootstrap.sh
