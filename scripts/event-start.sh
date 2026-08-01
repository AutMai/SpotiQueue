#!/usr/bin/env bash
#
# Everything the Pi needs to be event-ready, in one go:
#   wait for the tunnel  ->  point the QR at it  ->  open the beamer screen
#
# Designed to run from the desktop's autostart, so powering the Pi on is enough.
# Safe to run by hand at any time.
set -uo pipefail

cd "$(dirname "$0")/.." || exit 1

TUNNEL_UNIT="${TUNNEL_UNIT:-cloudflared-quick}"
WAIT_SECONDS="${WAIT_SECONDS:-120}"
PAGE="${1:-karaoke}"

find_tunnel_url() {
  # journalctl first (the unit logs there by default); fall back to a log file
  # if the unit was configured to write one.
  journalctl -u "$TUNNEL_UNIT" --since "-30min" -o cat 2>/dev/null \
    | grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' | tail -1
  if [ -f /var/log/cloudflared-quick.log ]; then
    grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' /var/log/cloudflared-quick.log 2>/dev/null | tail -1
  fi
}

echo "Waiting up to ${WAIT_SECONDS}s for the tunnel to come up..."
URL=""
DEADLINE=$((SECONDS + WAIT_SECONDS))
while [ "$SECONDS" -lt "$DEADLINE" ]; do
  URL="$(find_tunnel_url | tail -1)"
  [ -n "$URL" ] && break
  sleep 3
done

if [ -z "$URL" ]; then
  echo "No tunnel URL found." >&2
  echo "  Check: systemctl status ${TUNNEL_UNIT}" >&2
  echo "  If journalctl needs privileges, add yourself to the adm group." >&2
  echo "Opening the screen anyway - it runs from localhost, so the beamer still works." >&2
else
  echo "Tunnel is up: ${URL}"
  if node scripts/apply-tunnel-url.js "$URL"; then
    :
  else
    echo "Could not write the Queue URL; set it by hand in Configuration -> URLs." >&2
  fi
fi

exec ./scripts/karaoke-screen.sh "$PAGE"
