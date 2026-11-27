#!/usr/bin/env bash
# The only command `Publish origin image`'s key may run, and the verbs it accepts.
#
#   ssh -p 2222 deploy@<box>              -> deploy   (no command: the old default)
#   ssh -p 2222 deploy@<box> metrics 1h   -> metrics
#
# The key's authorized_keys entry forces this file through sudo, so the verb is
# whatever the client asked for, parsed here and matched exactly. Nothing is
# passed to a shell, the window must be a duration (`30m`, `1h`, `2d`), and
# anything else exits 64 without running either script.
set -euo pipefail

read -r verb window extra <<<"${SSH_ORIGINAL_COMMAND:-deploy}"

if [ -n "${extra:-}" ]; then
  echo "ci.sh: too many arguments; expected 'deploy' or 'metrics [window]'" >&2
  exit 64
fi

case "$verb" in
  deploy)
    if [ -n "${window:-}" ]; then
      echo "ci.sh: deploy takes no argument" >&2
      exit 64
    fi
    exec /usr/bin/bash /opt/royaraqamia/deploy.sh
    ;;
  metrics)
    if ! [[ "${window:-1h}" =~ ^[0-9]+[smhd]$ ]]; then
      echo "ci.sh: window must look like 30m, 1h or 2d" >&2
      exit 64
    fi
    exec /usr/bin/bash /opt/royaraqamia/metrics.sh "${window:-1h}"
    ;;
  *)
    echo "ci.sh: unknown verb '${verb}'; expected 'deploy' or 'metrics [window]'" >&2
    exit 64
    ;;
esac
