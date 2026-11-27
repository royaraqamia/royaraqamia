#!/usr/bin/env bash
# Request rate and latency for a window, out of Caddy's own access log.
#
#   metrics.sh [window]     `docker logs --since` syntax, 1h by default
#
# Runs as root through ci.sh's `metrics` verb, because reading container logs
# needs the docker socket. Caddy is the only place that sees every request: the
# app container sees what reached it, and Cloudflare's edge sees what did not.
#
# The output is one `key=value` per line so a workflow can drop it into a run
# summary without parsing prose.
set -euo pipefail

WINDOW=${1:-1h}
CONTAINER=${CONTAINER:-royaraqamia-caddy}

case "$WINDOW" in
  *h) SECONDS_TOTAL=$(( ${WINDOW%h} * 3600 )) ;;
  *m) SECONDS_TOTAL=$(( ${WINDOW%m} * 60 )) ;;
  *s) SECONDS_TOTAL=$(( ${WINDOW%s} )) ;;
  *d) SECONDS_TOTAL=$(( ${WINDOW%d} * 86400 )) ;;
  *)
    echo "window must look like 30m, 1h or 2d" >&2
    exit 64
    ;;
esac

tmp=$(mktemp)
trap 'rm -f "$tmp" "$tmp.rows"' EXIT

if ! docker logs --since "$WINDOW" "$CONTAINER" >"$tmp" 2>&1; then
  echo "cannot read ${CONTAINER} logs; is Caddy's access log enabled? (deploy/vps/Caddyfile)" >&2
  exit 1
fi

# One line per handled request: duration in seconds, and the status code.
awk '
  match($0, /"duration":[0-9.eE+-]+/) {
    duration = substr($0, RSTART + 11, RLENGTH - 11)
    status = ""
    if (match($0, /"status":[0-9]+/)) status = substr($0, RSTART + 9, RLENGTH - 9)
    print duration, status
  }
' "$tmp" >"$tmp.rows"

requests=$(wc -l <"$tmp.rows" | tr -d ' ')
if [ "$requests" -eq 0 ]; then
  printf 'window=%s\nseconds=%s\nrequests=0\n' "$WINDOW" "$SECONDS_TOTAL"
  echo "no access-log lines in the window: enable \`log\` in the Caddyfile and reload Caddy" >&2
  exit 0
fi

errors=$(awk '$2 + 0 >= 500' "$tmp.rows" | wc -l | tr -d ' ')

read -r p50 p95 < <(
  awk '{ print $1 }' "$tmp.rows" | sort -n |
    awk '{ a[NR] = $1 }
         END {
           i50 = int((NR * 50 + 99) / 100); if (i50 < 1) i50 = 1; if (i50 > NR) i50 = NR
           i95 = int((NR * 95 + 99) / 100); if (i95 < 1) i95 = 1; if (i95 > NR) i95 = NR
           printf "%.1f %.1f\n", a[i50] * 1000, a[i95] * 1000
         }'
)

rps=$(awk -v requests="$requests" -v seconds="$SECONDS_TOTAL" 'BEGIN { printf "%.2f", requests / seconds }')

printf 'window=%s\nseconds=%s\nrequests=%s\nrps=%s\np50_ms=%s\np95_ms=%s\nerrors_5xx=%s\n' \
  "$WINDOW" "$SECONDS_TOTAL" "$requests" "$rps" "$p50" "$p95" "$errors"
