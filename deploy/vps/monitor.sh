#!/usr/bin/env bash
# The box's own health line, and the only thing that evicts its image cache.
#
#   /opt/royaraqamia/monitor.sh    root, hourly from cron
#   /opt/royaraqamia/monitor.env   600 root: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
#
# Silence means healthy, except one line a day at HEARTBEAT_HOUR: a cron that
# died is otherwise as quiet as a box that is fine. A problem that persists is
# re-sent every REPEAT_HOURS rather than on every run, so the first message is
# not the only one and an hourly check is not an hourly alarm.
#
# Disk is evicted by a gauge, never by an image's age: a build date says nothing
# about whether the box still needs the image. Over DISK_SOFT_PCT the dangling
# layers go, over DISK_HARD_PCT every unused image goes. Either way the eviction
# is bounded and the run reports what is left. The rollback is a GHCR tag, so an
# evicted image costs a re-pull, never the rollback itself.
#
# Thresholds come from monitor.env or the environment:
#   DISK_SOFT_PCT=70 DISK_HARD_PCT=85 MEM_SOFT_PCT=85 RESTART_MAX=3
#   HEARTBEAT_HOUR=9 REPEAT_HOURS=6
set -uo pipefail

cd "$(dirname "$0")" || exit 1
if [ -f ./monitor.env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./monitor.env
  set +a
fi

DISK_SOFT_PCT=${DISK_SOFT_PCT:-70}
DISK_HARD_PCT=${DISK_HARD_PCT:-85}
MEM_SOFT_PCT=${MEM_SOFT_PCT:-85}
RESTART_MAX=${RESTART_MAX:-3}
HEARTBEAT_HOUR=${HEARTBEAT_HOUR:-9}
REPEAT_HOURS=${REPEAT_HOURS:-6}
APP=royaraqamia
CADDY=royaraqamia-caddy
STATE=${STATE:-/var/tmp/royaraqamia-monitor.state}

problems=()
notes=()

send() {
  local text="$1"
  if [ -z "${TELEGRAM_BOT_TOKEN:-}" ] || [ -z "${TELEGRAM_CHAT_ID:-}" ]; then
    logger -t royaraqamia-monitor "no monitor.env; would send: $text"
    return 0
  fi
  curl -fsS --max-time 10 -o /dev/null \
    "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    --data-urlencode "chat_id=${TELEGRAM_CHAT_ID}" \
    --data-urlencode "text=${text}" \
    -d disable_web_page_preview=true 2>/dev/null ||
    logger -t royaraqamia-monitor 'telegram send failed'
}

disk_pct() {
  local pct
  pct=$(df --output=pcent / 2>/dev/null | tail -1 | tr -dc '0-9')
  printf '%s' "${pct:-0}"
}

# Prints nothing when the kernel does not report usable numbers, so a missing
# /proc/meminfo is a missing check rather than a permanent 100% alert.
mem_pct() {
  awk '/^MemTotal:/{total=$2} /^MemAvailable:/{free=$2}
       END{if (total > 0) printf "%d", (total - free) * 100 / total}' /proc/meminfo 2>/dev/null
}

# Gauge-driven eviction, then measure again so the alert describes what is left.
evict_if_needed() {
  local pct freed
  pct=$(disk_pct)
  if [ "$pct" -lt "$DISK_SOFT_PCT" ]; then
    return 0
  fi
  freed=$(docker image prune -f 2>/dev/null | tail -1)
  notes+=("disk ${pct}% - pruned dangling images (${freed:-nothing})")
  pct=$(disk_pct)
  if [ "$pct" -ge "$DISK_HARD_PCT" ]; then
    freed=$(docker image prune -af 2>/dev/null | tail -1)
    notes+=("disk ${pct}% - pruned every unused image (${freed:-nothing})")
  fi
}

evict_if_needed

disk=$(disk_pct)
mem=$(mem_pct)

if [ "$disk" -ge "$DISK_SOFT_PCT" ]; then
  problems+=("disk ${disk}% of 30 GB used")
fi
if [ -n "$mem" ] && [ "$mem" -ge "$MEM_SOFT_PCT" ]; then
  problems+=("memory ${mem}% used")
fi

for container in "$APP" "$CADDY"; do
  running=$(docker inspect -f '{{.State.Running}}' "$container" 2>/dev/null || echo missing)
  if [ "$running" != 'true' ]; then
    problems+=("container ${container} is not running (${running})")
    continue
  fi
  restarts=$(docker inspect -f '{{.RestartCount}}' "$container" 2>/dev/null || echo 0)
  started=$(docker inspect -f '{{.State.StartedAt}}' "$container" 2>/dev/null || true)
  started_epoch=$(date -d "${started:-now}" +%s 2>/dev/null || date +%s)
  up=$(( $(date +%s) - started_epoch ))
  # A restart count is for the container's whole life; only a recent one is news.
  if [ "${restarts:-0}" -gt "$RESTART_MAX" ] && [ "$up" -lt 3600 ]; then
    problems+=("container ${container} restarted ${restarts} times, up ${up}s")
  fi
done

health=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{end}}' "$APP" 2>/dev/null || true)
if [ -n "$health" ] && [ "$health" != 'healthy' ]; then
  problems+=("app health is ${health}")
fi

now=$(date +%s)
since=$(date -u '+%Y-%m-%d %H:%M UTC' 2>/dev/null || date '+%Y-%m-%d %H:%M UTC')

if [ ${#problems[@]} -gt 0 ]; then
  body=$(printf '%s\n' "${problems[@]}" | sed 's/^/- /')
  hash=$(printf '%s' "$body" | sha256sum | cut -c1-16)
  last_hash=$(grep -o 'hash=[^ ]*' "$STATE" 2>/dev/null | cut -d= -f2 || true)
  last_sent=$(grep -o 'sent=[0-9]*' "$STATE" 2>/dev/null | cut -d= -f2 || echo 0)
  if [ "$hash" != "${last_hash:-}" ] || [ $((now - ${last_sent:-0})) -ge $((REPEAT_HOURS * 3600)) ]; then
    send "$(hostname) ${since}"$'\n'"${body}"
    printf 'hash=%s sent=%s\n' "$hash" "$now" >"$STATE" 2>/dev/null || true
  fi
  exit 0
fi

# Healthy: forget the reminder so the next problem speaks at once.
printf 'hash=none sent=0\n' >"$STATE" 2>/dev/null || true

if [ "$(date +%H)" = "$(printf '%02d' "$HEARTBEAT_HOUR")" ]; then
  extra=''
  if [ ${#notes[@]} -gt 0 ]; then
    extra=$'\n'"$(printf '%s\n' "${notes[@]}" | sed 's/^/- /')"
  fi
  send "$(hostname) ${since} ok - disk ${disk}%, memory ${mem:-?}%${extra}"
fi
exit 0
