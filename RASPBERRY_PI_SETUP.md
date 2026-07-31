# Raspberry Pi Event Setup

Running the whole thing from a Pi at the venue: the Pi hosts the app, drives the
beamer over HDMI, and reaches the internet through a phone hotspot. Guests and
helpers connect over the internet through a Cloudflare tunnel.

```
phone hotspot ──► Pi ── HDMI ──► beamer (/karaoke in kiosk mode)
                   │  app + SQLite + cached lyrics, all local
                   └─ cloudflared ──► guests (queue)  +  helpers (approve)

phone ──Bluetooth──► speaker      (Spotify plays here; the app controls it
                                   through Spotify Connect, no local audio)
```

The Pi never plays audio. Your phone is the Spotify device, so nothing like
raspotify is needed.

---

## 1. Base system

Raspberry Pi OS (64-bit), Pi 4 or 5. A Pi Zero will not drive Chromium at 1080p.

```bash
sudo apt update && sudo apt full-upgrade -y
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs git chromium-browser unclutter
node --version    # expect v20.x
```

## 2. Install the app

```bash
git clone https://github.com/AutMai/SpotiQueue
cd SpotiQueue
npm run install:all
npm run build
```

`npm install` must run **on the Pi** — `better-sqlite3` is a native module and
compiles for ARM here. Never copy `node_modules` from another machine.

## 3. Configure

```bash
cp env.example .env
nano .env
```

```env
SPOTIFY_CLIENT_ID=...
SPOTIFY_CLIENT_SECRET=...
SPOTIFY_REFRESH_TOKEN=...      # copy from your PC's .env, saves re-authorising
SPOTIFY_USER_ID=...

NODE_ENV=production
PORT=3000                      # guest UI + public API
ADMIN_PORT=3001                # admin UI + admin API

# Set these once the tunnel hostnames are known (step 6)
CLIENT_URL=https://queue.example.com
ADMIN_CLIENT_URL=https://admin.example.com

SESSION_SECRET=<long random string>
DB_PATH=/home/pi/SpotiQueue/data/queue.db
```

Generate a secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

**Copy your database too.** It holds the pre-cached lyrics for your setlist:

```bash
scp data/queue.db pi@raspberrypi.local:/home/pi/SpotiQueue/data/queue.db
```

## 4. Run as a service

`systemd`, not `nodemon` — a watch-restarter races itself on port binds and can
silently serve stale code.

```bash
sudo nano /etc/systemd/system/spotiqueue.service
```

```ini
[Unit]
Description=SpotiQueue
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/SpotiQueue
ExecStart=/usr/bin/node server/index.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now spotiqueue
systemctl status spotiqueue
journalctl -u spotiqueue -f      # live logs
```

## 5. Beamer in kiosk mode

```bash
mkdir -p ~/.config/autostart && nano ~/.config/autostart/karaoke.desktop
```

```ini
[Desktop Entry]
Type=Application
Name=Karaoke
Exec=chromium-browser --kiosk --noerrdialogs --disable-infobars --incognito --check-for-update-interval=31536000 http://localhost:3000/karaoke
X-GNOME-Autostart-enabled=true
```

Stop the screen blanking mid-song:

```bash
sudo nano /etc/xdg/lxsession/LXDE-pi/autostart
# add:
@xset s off
@xset -dpms
@xset s noblank
@unclutter -idle 0
```

The screen loads from `localhost`, so the beamer keeps working even if the
hotspot drops — lyrics are already cached in SQLite on the Pi.

## 6. Exposing guest and admin

Both UIs need to be reachable, on separate ports. One tunnel plus a tiny
reverse proxy is simpler than running two tunnels.

```bash
sudo apt install -y caddy
sudo nano /etc/caddy/Caddyfile
```

```
:8080 {
    handle /admin* {
        reverse_proxy localhost:3001
    }
    handle {
        reverse_proxy localhost:3000
    }
}
```

```bash
sudo systemctl restart caddy
```

Then install `cloudflared` and point one tunnel at `localhost:8080`. A **named**
tunnel (needs a domain on Cloudflare, ~10 EUR/yr) gives stable hostnames — worth
it, because a quick tunnel hands out a new random URL on every restart and that
invalidates every printed QR code.

Set `CLIENT_URL` and `ADMIN_CLIENT_URL` in `.env` to the final URLs, restart the
service, then update the **Redirect URI** in the Spotify dashboard to match.

## 7. Before exposing the admin panel

The admin panel is the only password-protected surface, and helpers approving
songs means it faces the internet. Do all four:

- [ ] **Change the password.** The default is `admin`. Configuration → Security.
- [ ] **Set `SESSION_SECRET`** to something long and random.
- [ ] **Enable TOTP.** Set `ADMIN_TOTP_SECRET` (base32) in `.env`; the login form
      then asks for a 6-digit code. Strongly recommended for an exposed panel.
- [ ] **Confirm HTTPS.** Session cookies are `Secure` in production, so the panel
      only works over HTTPS. The tunnel provides it.

Sign-in attempts are rate limited to 20 per 10 minutes per IP. Restarting the
service clears the counters if a helper locks themselves out.

Anyone with the admin URL and password can approve songs, ban tracks, skip
playback and rotate rooms. Share it only with the people who should have that.

## 8. Dry run before the event

Do this at home, on the hotspot, exactly as it will run:

1. `systemctl status spotiqueue` — active, and survives `sudo reboot`
2. Beamer shows `/karaoke` automatically after boot
3. Phone plays Spotify to the Bluetooth speaker; the Pi's screen follows it
4. **Calibrate** Configuration → Display Mode → Lyric Sync Offset. Bluetooth adds
   100-300ms, so start near `-500` rather than the `-220` default
5. Scan the QR **on mobile data, not WiFi** — that is the path guests will use
6. Have a friend sign in to the admin URL and approve a song
7. Press Skip and confirm the track changes
8. Pre-cache the setlist: Configuration → Lyrics → Pre-cache from a playlist

## Troubleshooting

**Screen says "Reconnecting"** — the hotspot dropped. The beamer recovers on its
own; queueing needs the connection back.

**"Spotify is rate-limiting this app"** — the player endpoints are throttled per
Spotify *account*, and new client credentials do not reset it. It clears with
time. Keep spare `/display` and `/karaoke` tabs closed.

**Lyrics drift** — adjust the sync offset; it applies within ~10 seconds without
a reload.

**Guests see "This room has closed"** — expected after creating a new room. They
rescan the current QR.

**Port already in use after a restart** — `sudo systemctl restart spotiqueue`.
Check `journalctl -u spotiqueue -n 50` for the real error.
