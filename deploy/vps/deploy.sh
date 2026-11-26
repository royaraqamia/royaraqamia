#!/usr/bin/env bash
# Pull the published image and bring the origin up on this VPS.
# Run from /opt/royaraqamia with: bash deploy.sh
set -euo pipefail

cd "$(dirname "$0")"

docker compose pull app
docker compose up -d --remove-orphans

for attempt in $(seq 1 30); do
  if docker compose exec -T app node -e \
    "fetch('http://127.0.0.1:3000/manifest.json').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"; then
    echo "origin healthy"
    exit 0
  fi
  sleep 5
done

echo "origin did not become healthy within 150s" >&2
exit 1
