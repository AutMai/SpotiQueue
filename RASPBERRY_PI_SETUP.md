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

### Prerequisite: the Pi must boot to a desktop

Without a graphical session there is nothing for Chromium to appear on, and any
autostart entry silently does nothing.

```bash
systemctl get-default        # want: graphical.target
```

If it says `multi-user.target`:

```bash
sudo raspi-config
#   System Options -> Boot / Auto Login -> Desktop Autologin
sudo reboot
```

### Launching it

Use the bundled script rather than an autostart entry. Running it by hand fits
the event better anyway: on a quick tunnel you set the Queue URL first, then
bring up the screen.

```bash
chmod +x scripts/karaoke-screen.sh      # first time only

./scripts/karaoke-screen.sh             # karaoke screen
./scripts/karaoke-screen.sh display     # the ambient /display view
./scripts/karaoke-screen.sh stop        # close it
```

It works over SSH — it attaches to the Pi's own session and keeps running after
you disconnect, so you can start the beamer from your laptop.

The script handles the things that differ between Pi OS releases: Bookworm ships
`chromium` while older releases ship `chromium-browser`, and Bookworm defaults to
Wayland where the old `DISPLAY=:0` assumption no longer holds. It also replaces
any kiosk already running, so re-running is always safe.

### Optional: start it automatically

Only worth it if you leave the Queue URL fixed. Which file to use depends on the
desktop, which is why the manual script is the more reliable default:

- **Bookworm (wayfire)** — add to `~/.config/wayfire.ini`:
  ```ini
  [autostart]
  karaoke = /home/pi/SpotiQueue/scripts/karaoke-screen.sh
  ```
- **Bookworm (labwc)** — add the same line to `~/.config/labwc/autostart`
- **Bullseye and older (LXDE/X11)** — `~/.config/autostart/karaoke.desktop`:
  ```ini
  [Desktop Entry]
  Type=Application
  Name=Karaoke
  Exec=/home/pi/SpotiQueue/scripts/karaoke-screen.sh
  ```

Check which you are on with `echo $XDG_SESSION_TYPE` (`wayland` or `x11`).

### Keep the screen awake

On X11 the script already disables blanking. Under Wayland, use the desktop's
own setting: **Preferences → Screen Blanking → off**, or install `wlr-randr` and
disable it there. A beamer going black three minutes into a song is the most
annoying failure on the night, so confirm it before the event.

The page loads from `localhost`, so the beamer keeps working even if the hotspot
drops — lyrics are already cached in SQLite on the Pi.

## 6. Exposing guest and admin through one tunnel

Guest UI is on :3000 and admin on :3001. Put a small reverse proxy in front so a
single tunnel serves both — simpler than juggling two tunnel URLs.

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
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8080/    # expect 200
```

Because everything now arrives on one hostname, guest and admin requests are
**same-origin** — CORS never fires, so `CLIENT_URL` and `ADMIN_CLIENT_URL` do not
need to match the tunnel and can stay as they are.

### Install cloudflared

Raspberry Pi OS 64-bit:

```bash
curl -L -o cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64.deb
sudo dpkg -i cloudflared.deb
cloudflared --version
```

On 32-bit Pi OS use `cloudflared-linux-arm.deb` instead. Check with
`uname -m` — `aarch64` means 64-bit, `armv7l` means 32-bit.

### Try it once by hand

```bash
cloudflared tunnel --url http://localhost:8080
```

It prints a URL like `https://tasty-purple-fox-1234.trycloudflare.com`. No
Cloudflare account and no domain required. Open it on your phone over **mobile
data** to confirm the guest page loads, then `Ctrl+C`.

### Run it on boot

```bash
sudo nano /etc/systemd/system/cloudflared-quick.service
```

```ini
[Unit]
Description=Cloudflare quick tunnel
After=network-online.target caddy.service
Wants=network-online.target

[Service]
Type=simple
ExecStart=/usr/bin/cloudflared tunnel --no-autoupdate --url http://localhost:8080
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now cloudflared-quick
```

### Read the current URL

The URL changes on every restart, so fetch it rather than remembering it:

```bash
sudo journalctl -u cloudflared-quick | grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' | tail -1
```

Worth saving as a shortcut:

```bash
echo "alias tunnelurl=\"sudo journalctl -u cloudflared-quick | grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' | tail -1\"" >> ~/.bashrc
source ~/.bashrc
tunnelurl
```

### Make it plug and play

You do not have to copy the URL by hand. One script waits for the tunnel, writes
the address into the config, and opens the beamer screen:

```bash
./scripts/event-start.sh
```

Install it so powering the Pi on is the whole procedure:

```bash
./scripts/install-autostart.sh      # --remove to undo
sudo reboot
```

It detects which desktop the Pi uses (wayfire, labwc or LXDE) and installs the
right kind of entry, and warns if the Pi is not set to boot to a desktop.

After that, an event is: **plug in the Pi, wait about a minute, show the QR from
the beamer.**

Queue URL lives in the database and is read on every request, so writing it needs
no restart. To set it manually anyway:

```bash
node scripts/apply-tunnel-url.js https://something.trycloudflare.com
```

Or read the current address with `tunnelurl` and paste it into
**Configuration → URLs → Queue URL**.

### Spotify dashboard

Nothing to change. The redirect URI is only used when *authorising*; once a
refresh token exists the app uses `grant_type=refresh_token`, which sends no
redirect URI at all. A rotating tunnel URL is invisible to Spotify.

If you ever need to re-authorise on the Pi, pin the redirect so it never depends
on the tunnel — add to `.env` and register exactly this in the dashboard:

```env
SPOTIFY_REDIRECT_URI=http://127.0.0.1:3000/api/auth/callback
```

### Reaching the admin panel from your phone

The QR on the beamer encodes `https://<tunnel>/?room=CODE`. Scan it, then change
the path to `/admin` and you are on the admin panel — same hostname, no second
URL to remember and nothing to write down.

That convenience cuts both ways: **every guest who scans the QR can find
`/admin` just as easily.** It is protected by the password alone, so treat that
password as the only thing standing between a guest and your queue controls. See
the checklist below.

If you would rather it were not guessable, serve it from a non-obvious path in
the Caddyfile:

```
:8080 {
    handle /backstage-x7f2* {
        uri strip_prefix /backstage-x7f2
        rewrite * /admin{uri}
        reverse_proxy localhost:3001
    }
    handle {
        reverse_proxy localhost:3000
    }
}
```

That is obscurity rather than security - it stops idle poking, not an attacker -
so do it *in addition to* a strong password, never instead of one.

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

1. `sudo reboot` and touch nothing. Within a minute or so the beamer should show
   the karaoke screen with a QR already pointing at the new tunnel
2. If not, check the three services: `systemctl status spotiqueue caddy cloudflared-quick`,
   then run `./scripts/event-start.sh` by hand and read what it prints
3. Scan the QR, then edit the path to `/admin` and sign in from your phone
4. Phone plays Spotify to the Bluetooth speaker; the Pi's screen follows it
5. **Calibrate** Configuration → Display Mode → Lyric Sync Offset. Bluetooth adds
   100-300ms, so start near `-500` rather than the `-220` default
6. Scan the QR **on mobile data, not WiFi** — that is the path guests will use
7. Have a friend sign in to `<url>/admin` and approve a song
8. Press Skip and confirm the track changes
9. Pre-cache the setlist: Configuration → Lyrics → Pre-cache from a playlist

With autostart installed, a mid-event reboot recovers on its own: the tunnel
comes back with a new address, the QR is rewritten to match, and the beamer
reopens. Only guests who scanned the *old* QR need to rescan.

## Troubleshooting

**Nothing appears on the beamer** — first check the Pi is booted to a desktop:
`systemctl get-default` must say `graphical.target`. Then run
`./scripts/karaoke-screen.sh` and read what it prints. If Chromium is missing,
`sudo apt install -y chromium`.

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

**Tunnel URL stopped working** — the Pi or the tunnel restarted and the address
changed. Run `tunnelurl`, update Queue URL, reshow the QR, resend the admin link.

**Helpers cannot sign in** — after 20 wrong attempts in 10 minutes that IP is
blocked. `sudo systemctl restart spotiqueue` clears the counters.

**Guest page loads but the admin is 404** — Caddy is not routing `/admin`. Check
`sudo systemctl status caddy` and that the tunnel points at `:8080`, not `:3000`.

**Admin login flashes then returns to the login screen** — the session cookie is
not being stored. Sign-in itself succeeded; the next request just looked signed
out. Check whether a cookie is issued at all:

```bash
curl -si -X POST http://localhost:3001/api/admin/login \
  -H 'Content-Type: application/json' -d '{"password":"YOURPASS"}' | grep -i set-cookie
```

No `Set-Cookie` line means the cookie was suppressed. Make sure you are running a
build that sets `secure: 'auto'` in `server/sessionMiddleware.js` — older builds
forced `Secure` in production, which silently dropped the cookie on any plain-HTTP
address such as `http://raspberrypi.local:3001/admin`.
