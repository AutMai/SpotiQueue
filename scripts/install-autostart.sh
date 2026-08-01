#!/usr/bin/env bash
#
# Make the Pi start the event on power-on.
#
# Raspberry Pi OS has used three different autostart mechanisms across recent
# releases, so detect which desktop is in use rather than guessing.
#
#   ./scripts/install-autostart.sh            # install
#   ./scripts/install-autostart.sh --remove   # undo
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="$DIR/scripts/event-start.sh"
WAYFIRE="$HOME/.config/wayfire.ini"
LABWC="$HOME/.config/labwc/autostart"
DESKTOP="$HOME/.config/autostart/spotiqueue.desktop"
MARKER="spotiqueue"

if [ "${1:-}" = "--remove" ]; then
  [ -f "$WAYFIRE" ] && sed -i "/${MARKER}/d" "$WAYFIRE" && echo "Removed from wayfire.ini"
  [ -f "$LABWC" ] && sed -i "/${MARKER}/d" "$LABWC" && echo "Removed from labwc/autostart"
  [ -f "$DESKTOP" ] && rm -f "$DESKTOP" && echo "Removed ~/.config/autostart entry"
  exit 0
fi

chmod +x "$DIR/scripts/"*.sh

echo "Session type: ${XDG_SESSION_TYPE:-unknown}"

if [ -f "$WAYFIRE" ]; then
  if grep -q "$MARKER" "$WAYFIRE"; then
    echo "Already installed in wayfire.ini"
  elif grep -q '^\[autostart\]' "$WAYFIRE"; then
    sed -i "/^\[autostart\]/a ${MARKER} = ${TARGET}" "$WAYFIRE"
    echo "Installed into wayfire.ini"
  else
    printf '\n[autostart]\n%s = %s\n' "$MARKER" "$TARGET" >> "$WAYFIRE"
    echo "Installed into wayfire.ini (new [autostart] section)"
  fi

elif [ -d "$(dirname "$LABWC")" ] || [ "${XDG_SESSION_TYPE:-}" = "wayland" ]; then
  mkdir -p "$(dirname "$LABWC")"
  if [ -f "$LABWC" ] && grep -q "$MARKER" "$LABWC"; then
    echo "Already installed in labwc/autostart"
  else
    echo "${TARGET} &   # ${MARKER}" >> "$LABWC"
    chmod +x "$LABWC"
    echo "Installed into labwc/autostart"
  fi

else
  mkdir -p "$(dirname "$DESKTOP")"
  cat > "$DESKTOP" <<EOF
[Desktop Entry]
Type=Application
Name=SpotiQueue Karaoke
Comment=${MARKER}
Exec=${TARGET}
X-GNOME-Autostart-enabled=true
EOF
  echo "Installed into ~/.config/autostart"
fi

echo
if [ "$(systemctl get-default 2>/dev/null)" != "graphical.target" ]; then
  echo "WARNING: this Pi does not boot to a desktop, so autostart cannot run." >&2
  echo "  sudo raspi-config -> System Options -> Boot / Auto Login -> Desktop Autologin" >&2
else
  echo "Ready. Reboot to test: sudo reboot"
fi
