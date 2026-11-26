#!/usr/bin/env bash
# Copy the origin's configuration to the VPS's own R2 bucket and verify it landed.
# Runs from cron on the VPS; the steps and the restore drill are in
# docs/agents/vps-deploy.md. The archive is the only thing on this box that is
# not in git or in a public image.
set -euo pipefail

cd "$(dirname "$0")"

# Credentials live in a root-only file next to the deployment, never in cron.
# shellcheck disable=SC1091
set -a
. ./backup.env
set +a

for key in R2_ENDPOINT R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_BACKUP_BUCKET; do
  if [ -z "${!key:-}" ]; then
    echo "backup.env has no $key" >&2
    exit 1
  fi
done

# The AWS CLI reads these names; R2 wants `auto` for a region.
export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
export AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
export AWS_DEFAULT_REGION=auto

umask 077
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
archive="$(mktemp --suffix=.tar.gz)"
trap 'rm -f "$archive"' EXIT

# A missing file is an error, not a smaller backup.
tar --create --gzip --file "$archive" compose.yaml Caddyfile deploy.sh .env

key="vps/vps-config-$stamp.tar.gz"
aws s3 cp "$archive" "s3://$R2_BACKUP_BUCKET/$key" \
  --endpoint-url "$R2_ENDPOINT" --only-show-errors

# Fail rather than report a backup that was never stored.
aws s3 ls "s3://$R2_BACKUP_BUCKET/$key" --endpoint-url "$R2_ENDPOINT" > /dev/null
echo "stored $key"
