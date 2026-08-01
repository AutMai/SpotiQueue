#!/usr/bin/env bash
#
# Bring the karaoke screen up on the Pi's display, in kiosk mode.
#
#   ./scripts/karaoke-screen.sh            # karaoke screen, localhost
#   ./scripts/karaoke-screen.sh display    # the ambient /display view instead
#   ./scripts/karaoke-screen.sh stop       # close it
#
# Safe to run over SSH: it attaches to the Pi's local session and keeps running
# after you disconnect.
set -uo pipefail

PORT="${SPOTIQUEUE_PORT:-3000}"

case "${1:-karaoke}" in
  stop)
    pkill -f -- '--kiosk' >/dev/null 2>&1 && echo "Kiosk closed." || echo "Nothing was running."
    exit 0
    ;;
  display) PAGE="display" ;;
  karaoke) PAGE="karaoke" ;;
  http*)   PAGE="" ; URL="$1" ;;
  *) echo "Usage: $0 [karaoke|display|stop|<url>]" >&2; exit 1 ;;
esac
URL="${URL:-http://localhost:${PORT}/${PAGE}}"

# Bookworm ships 'chromium'; older releases ship 'chromium-browser'
BROWSER=""
for candidate in chromium chromium-browser; do
  if command -v "$candidate" >/dev/null 2>&1; then BROWSER="$candidate"; break; fi
done
if [ -z "$BROWSER" ]; then
  echo "Chromium is not installed. Run: sudo apt install -y chromium" >&2
  exit 1
fi

# Over SSH there is no session attached, so point at the one on the Pi itself.
if [ -z "${WAYLAND_DISPLAY:-}" ] && [ -z "${DISPLAY:-}" ]; then
  export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
  if   [ -S "${XDG_RUNTIME_DIR}/wayland-0" ]; then export WAYLAND_DISPLAY=wayland-0
  elif [ -S "${XDG_RUNTIME_DIR}/wayland-1" ]; then export WAYLAND_DISPLAY=wayland-1
  else export DISPLAY=:0
  fi
fi

if [ -n "${DISPLAY:-}" ] && command -v xset >/dev/null 2>&1; then
  # Stop the beamer blanking mid-song (X11 only; ignored under Wayland)
  xset s off -dpms s noblank >/dev/null 2>&1
fi

# Replace any kiosk already up, so re-running is always safe
pkill -f -- '--kiosk' >/dev/null 2>&1
sleep 1

echo "Opening ${URL}"
setsid "$BROWSER" \
  --kiosk \
  --noerrdialogs \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --disable-features=Translate \
  --check-for-update-interval=31536000 \
  --incognito \
  "$URL" >/dev/null 2>&1 < /dev/null &

sleep 2
if pgrep -f -- '--kiosk' >/dev/null 2>&1; then
  echo "Kiosk is up. Close it with: $0 stop"
else
  echo "Chromium did not stay open." >&2
  echo "Is the Pi booted to the desktop? Check with: systemctl get-default" >&2
  echo "It should be graphical.target - if not:" >&2
  echo "  sudo raspi-config  ->  System Options  ->  Boot / Auto Login  ->  Desktop Autologin" >&2
  exit 1
fi
