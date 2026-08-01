<img width="1920" height="960" alt="Main" src="https://github.com/user-attachments/assets/0baf3ff7-c8c8-4bc6-bd3e-55139b7ecb24" />

# A Spotify Queue App

A self-hosted web application that lets guests queue Spotify tracks to your Spotify account during events, with anti-spam controls, live "Now Playing" display, and a comprehensive admin interface.

## Notice:
This version of the software is now unsupported and will be receiving few, if any, updates.
To create a free account on the new, remade version, visit https://spotiqueue.com

## Demo:
A page demonstrating the UI can be found here:   
https://stroepwafel.github.io/SpotiQueue/

## Disclaimer~
Artificial Intelligence (AI) assisted in commenting and cleaning the code and in the creation of all documentation. While I am against AIs replacing humans I think that this is a valid use of AI as a tool
## Features

- **Public Guest Interface**: Clean, mobile-friendly UI for queueing songs (Vite + Tailwind, dark mode)
- **Rotating Rooms**: Guests join through a room code in the QR link. One click regenerates the room, killing the old link instantly
- **Synced Lyrics Check**: Flags (or blocks) tracks that have no synced lyrics, so nothing reaches the beamer with an empty screen
- **Spotify Search**: Search and queue tracks directly
- **URL Input**: Paste Spotify track URLs
- **Live Now Playing**: Auto-updating display with progress bar, play/pause badge, synced lyrics
- **Display Mode** (`/display`): Full-screen party view with now playing, synced lyrics, up-next queue, voting, QR code to queue
- **Karaoke Mode** (`/karaoke`): Lyrics-first big screen — large scaling type for singing along, with now playing, queue and QR demoted to a side rail
- **Song Voting**: Optional up/down voting on queued tracks (admin-configurable)
- **Prequeue**: Optional approval flow before adding tracks to Spotify (admin-configurable)
- **Guest Auth**: Optional GitHub OAuth and/or Google OAuth for queue and voting
- **Anti-Spam Protection**: Device fingerprinting and rate limiting
- **Banned Tracks**: Block specific songs or artists
- **Explicit Content Filtering**: Option to ban explicit songs
- **Admin Panel**: Full control over devices, configuration, banned tracks, prequeue, and Spotify connection
- **Auto-Connect**: Automatic Spotify token refresh - no restart needed
- **Data Management**: Reset all data with one click
- **Process Management**: PM2 or systemd service support

## Architecture

- **Public Web App**: Port 3000 (Guest UI, Vite dev server in development)
- **Admin Panel**: Port 3002 in dev, 3001 in production (Protected admin interface)
- **Backend API**: Express.js server with SQLite (better-sqlite3), public API on port 5000 in dev, 3000 in production
- **Frontend**: React with Vite + Tailwind for both public and admin interfaces

## Prerequisites

- Node.js 18+ (for local development and production)
- Spotify Developer Account
- Spotify Premium account (required for queue functionality)
- (Optional) GitHub OAuth App and/or Google OAuth credentials for guest authentication

## Spotify Setup

### 1. Create a Spotify App

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Click "Create an app"
3. Fill in app details:
   - App name: "Spotify Queue App" (or your choice)
   - App description: "Event queue management"
   - Redirect URI: `http://127.0.0.1:5000/api/auth/callback` (for development)
     - Spotify no longer allows "localhost" - you must use `127.0.0.1`
     - The port (5000) matches the backend API port in development mode
     - For production, use: `http://your-server-ip:3000/api/auth/callback` or `https://yourdomain.com/api/auth/callback` if using reverse proxy
4. Save your Client ID and Client Secret

### 2. Connect Spotify Account

The app needs a refresh token to access your Spotify account. You have two options:

#### Option A: Auto-Connect

1. Add your `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` to `.env`
2. Start the app: `npm run dev`
3. Open the admin panel: http://localhost:3002 (development) or http://localhost:3001 (production)
4. Go to the "Spotify" tab (first tab in the admin panel)
5. Click "Connect Spotify Account" button
6. Authorize the app on Spotify
7. The refresh token and user ID will be automatically saved to `.env`
8. No restart needed - the connection is active immediately

Make sure to add `http://127.0.0.1:5000/api/auth/callback` as a redirect URI in your Spotify app settings for development, or your production URL for production.

#### Option B: Manual Setup (Alternative)

If you prefer to set it up manually, here are the options:

##### Using Spotify OAuth Playground

1. Go to [Spotify OAuth Playground](https://developer.spotify.com/documentation/web-api/tutorials/code-flow)
2. Click "Get Token"
3. Select these scopes:
   - `user-read-playback-state`
   - `user-modify-playback-state`
   - `user-read-currently-playing`
4. Authorize and copy the **Refresh Token**

#### Option B: Using a Simple Script

Create a file `get-token.js`:

```javascript
const express = require('express');
const app = express();

const CLIENT_ID = 'YOUR_CLIENT_ID';
const CLIENT_SECRET = 'YOUR_CLIENT_SECRET';
const REDIRECT_URI = 'http://localhost:8888/callback';

app.get('/login', (req, res) => {
  const scopes = 'user-read-playback-state user-modify-playback-state user-read-currently-playing';
  res.redirect(`https://accounts.spotify.com/authorize?client_id=${CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=${encodeURIComponent(scopes)}`);
});

app.get('/callback', async (req, res) => {
  const code = req.query.code;
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: REDIRECT_URI
    })
  });
  const data = await response.json();
  res.send(`<h1>Success!</h1><p>Refresh Token: <code>${data.refresh_token}</code></p>`);
});

app.listen(8888, () => console.log('Go to http://localhost:8888/login'));
```

Run it and visit `http://localhost:8888/login` to get your refresh token.

##### Get Your Spotify User ID (if not using auto-connect)

1. Go to [Spotify Web Player](https://open.spotify.com)
2. Right-click on your profile → Copy link
3. The user ID is in the URL: `https://open.spotify.com/user/{USER_ID}`

## Installation

### Option 1: Direct Node.js Deployment (Recommended for Simplicity)

See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed instructions on deploying without Docker.

Quick start:
```bash
# Install Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Clone and setup
git clone https://github.com/StroepWafel/SpotiQueue
cd SpotifyQueueApp
npm run install:all
npm run build

# Configure .env file
cp env.example .env
nano .env

# Run with PM2 (process manager)
sudo npm install -g pm2
pm2 start server/index.js --name spotify-queue
pm2 save
pm2 startup
```

### Option 1a: Raspberry Pi at the venue

See [RASPBERRY_PI_SETUP.md](RASPBERRY_PI_SETUP.md) for running the whole event
from a Pi: hosting the app, driving the beamer in kiosk mode, reaching the
internet through a phone hotspot, and exposing both the guest and admin UIs.

### Option 1b: Cloudflare Tunnel (No Port Forwarding Required)

See [CLOUDFLARE_TUNNEL.md](CLOUDFLARE_TUNNEL.md) for instructions on exposing your app through Cloudflare Tunnel. This allows you to:
- Access your app without opening firewall ports
- Use free SSL certificates
- Work with dynamic IP addresses
- Get DDoS protection automatically

### Option 2: Local Development

1. Install dependencies:
```bash
npm run install:all
```

2. Set up environment variables:
```bash
cp env.example .env
# Edit .env and add SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET
# Then use the "Connect Spotify Account" button in the app to auto-fetch the refresh token
```

3. Start development servers:
```bash
npm run dev
```

This will start:
- Backend API on port 5000 (public API, serves client in production)
- Backend API on port 3001 (admin API, serves admin in production)
- Public client (Vite) on port 3000, proxying `/api` to port 5000
- Admin panel (Vite) on port 3002, proxying `/api` to port 3001

**Development ports**: Public UI 3000, Admin UI 3002, Public API 5000, Admin API 3001  
**Production**: Public API + static client on 3000, Admin API + static admin on 3001.

## Rooms (rotating QR codes)

Guests can only queue through the **current room**. The room code lives in the QR
link (`https://your-queue.com/?room=AB3XK9QP`), and the server hands the guest a
cookie so refreshing the page keeps working.

If a group starts abusing the queue, open **admin → QR Code → Create new room**:

- A new code and QR are generated; the old link stops working immediately
- Everyone (including the trolls) must rescan to queue again
- The **pending approval list is cleared**, so you don't have to reject a flood of
  requests one by one
- Votes and cooldowns are cleared too, so honest guests who just rescanned aren't
  stuck waiting out a timer from the old room
- Songs **already sent to Spotify keep playing** — the Spotify Web API provides no
  way to remove tracks from the playback queue

Show the QR from the **Display mode** (`/display`) screen or hand it out with the
**Download QR** / **Shareable image** buttons. The Display screen picks up a new
room on its next poll, so the projected QR updates on its own.

Exactly one room is active at a time. To turn the whole mechanism off and go back
to an open queue, uncheck **Configuration → Rooms → Require a room code**.

### Approving each guest

Scanning the QR is not always enough — at a public venue anyone walking past can
scan what is on the wall. Enable **Configuration → Rooms → Approve each guest
before they can queue** and joining becomes a two-step process:

1. The guest gives a name and sees *"Waiting to be let in"*
2. Their name appears under **Prequeue → Waiting to join**, where you approve or
   decline. Their page updates by itself within a few seconds.

Useful when you can ask out loud whether "Vicky" is actually standing there.
Turning it on makes a username mandatory and does not affect guests already
admitted, so it is safe to switch on mid-event. **Let all in** admits everyone
waiting at once when a whole group arrives together.

### Showing the QR big

**QR Code → Show the big QR** fills the karaoke screen with a full-size code so a
group can scan at once, with the link printed underneath for anyone who would
rather type it. Lyrics return the moment you switch it off.

## Synced lyrics

Tracks are checked for synced (LRC) lyrics, so a song that would leave the beamer
blank is visible before it gets queued:

- Search results show a **Synced lyrics** / **No lyrics available** badge
- The prequeue list shows a **No synced lyrics** warning so you can decline at a glance
- **Configuration → Content Filtering → Require Synced Lyrics** blocks such tracks outright
- Display mode shows which provider the lyrics came from (`Lyrics via netease`)

### Karaoke mode (`/karaoke`)

A second big screen aimed at people actually singing, rather than at ambience.
Lyrics take the full stage (roughly 4× the type size of the `/display` lyrics
pane, scaling with the viewport). Now playing, up-next and the QR code sit in a
narrow side rail.

Two deliberate choices keep it readable while singing:

- **Every line is the same size and weight.** The active line is picked out by
  colour and a small composited scale only. Enlarging the active line re-wraps
  it mid-song, which shifts every following word and wrecks the reading flow.
- **The list slides rather than jumps.** The whole column is animated so the
  active line stays centred, which is far easier to follow than lines snapping
  between positions.

If guests give a name (Configuration → User Identification → Require Username, or
GitHub/Google sign-in), the karaoke screen shows **who requested the current song**
under the cover art, and lists the requester instead of the artist in the up-next
rail — so people know when they are on.

Use `/display` for background/party ambience and `/karaoke` when someone is at the
mic. Both are linked from the guest page header and share the same sync settings.

### Skipping a song

Spotify's API cannot remove a track from the queue, so once something is playing
the only remedy is to skip it. **Admin → Prequeue** shows what is playing, who
requested it, and a **Skip** button. Requires a Premium account and an active
playback device.

### Sync calibration

Lyrics are aligned using Spotify's reported playback position, extrapolated
between polls — nothing analyses the audio. Because every venue's audio path
adds its own delay, the alignment is adjustable:

**Configuration → Display Mode → Lyric Sync Offset (ms)** (default `-220`)

- Negative shows lyrics **earlier**, positive **later**
- If lyrics run behind the music, go more negative
- **Bluetooth speakers add 100–300ms of their own latency** — try `-400` to `-600`
- Changes apply to both big screens within ~10 seconds, no reload needed

Calibrate on the day, against the actual PA.

Between polls the position is tracked on a local clock that is *corrected* toward
Spotify rather than reset by it — a real seek or track change snaps, but ordinary
drift is absorbed gradually, so the lyric line no longer twitches every 3 seconds.

The server shares one Spotify call between all screens, and age-corrects the
cached playback position before serving it. Without that correction the reported
position jitters by up to the cache lifetime, which is enough to trip the
client's resync threshold and jump the highlighted line past a lyric.

### Pre-caching before an event

**Configuration → Lyrics → Pre-cache lyrics from a playlist**

Paste a Spotify **playlist or album** link and every track is looked up ahead of
time and stored locally. Run it the day before and the night itself needs no
lyrics provider at all. Progress is shown as it runs; lookups are throttled, so
a large playlist takes a few minutes.

> Spotify blocks third-party API access to its *own* editorial and personalised
> playlists (Discover Weekly, Today's Top Hits, …). Use one of your own playlists,
> or an album link.

Lyrics are stored in the `lyrics_cache` table, so they also survive a restart —
a crash mid-event costs nothing.

### Providers

Set the order in **Configuration → Lyrics → Lyrics Providers** (default `lrclib,netease`).
The first provider that returns synced lyrics wins; set a single name to compare
quality between them.

| Provider | Notes |
|---|---|
| `lrclib` | [lrclib.net](https://lrclib.net). Open, no auth. Point at a self-hosted instance with `LRCLIB_BASE_URL` |
| `netease` | NetEase Cloud Music. Unofficial/undocumented API, good western pop coverage, weaker on some non-English catalogues |

### Reliability behaviour

- **Duration matching**: candidates must be within 5s of the Spotify track's length.
  A radio edit's timings on an album version desyncs every line, so a mismatch is
  reported as "no lyrics" rather than shown wrong.
- **Fail open**: if every provider is unreachable, tracks are allowed through and
  nothing is cached. An outage must never become a queue that rejects everything.
- **Circuit breaker**: a provider that fails 3 times in a row is skipped for 5
  minutes, so a dead provider doesn't add its timeout to every lookup.
- **Throttling**: requests are serialised ~350ms apart with a 60s backoff on HTTP 429,
  because these are free community services.
- Results **and the lyrics themselves** are cached in the database, so repeat
  requests cost nothing and a restart does not re-fetch the night's catalogue.

### Self-hosting lrclib (optional)

Removes the dependency on the public instance — worth it if the venue has poor
connectivity:

```bash
git clone https://github.com/tranxuanthang/lrclib && cd lrclib
docker build -t lrclib:latest -f Dockerfile .
# Download the SQLite dump from https://lrclib.net/db-dumps, decompress it to
# db.sqlite3, and place it in the folder you mount at /data
docker run -d --name lrclib -p 3300:3300 \
  -v /path/to/lrclib-data:/data \
  -e LRCLIB_LOG=info -e LRCLIB_MMAP_SIZE=4000000000 \
  lrclib:latest
```

Then set `LRCLIB_BASE_URL=http://localhost:3300` in `.env`. Note `LRCLIB_MMAP_SIZE`
defaults to 30GB upstream — keep it below 75% of your RAM.

## Optional: Guest Authentication (GitHub & Google OAuth)

You can require guests to sign in with GitHub or Google before queueing or voting. Configure in admin → Configuration → Guest Authentication.

**GitHub OAuth:**
1. Create an OAuth App at https://github.com/settings/developers
2. Set callback URL: `http://127.0.0.1:5000/api/github/callback` (dev) or `https://your-domain.com/api/github/callback` (prod)
3. Add to `.env`: `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`

**Google OAuth:**
1. Create OAuth 2.0 credentials at https://console.cloud.google.com/apis/credentials
2. Add authorized redirect URI: `http://127.0.0.1:5000/api/google/callback` (dev) or `https://your-domain.com/api/google/callback` (prod)
3. Add to `.env`: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`

Enable the desired provider in admin Configuration. Auth is required only if at least one provider is enabled.

## Configuration

All configuration can be managed through the admin panel:
- Development: http://localhost:3002
- Production: http://localhost:3001

The admin panel has seven tabs:

1. **Spotify**: Connect or reconnect your Spotify account (no restart needed)
1b. **QR Code**: Show the current room code and QR, download it as an image, or create a new room
2. **Prequeue**: Approve or decline track requests when prequeue is enabled, see who submitted each one, and skip the current track
3. **Devices**: View and manage device fingerprints, block/unblock devices, reset cooldowns
4. **Banned Tracks**: Manage list of banned tracks
5. **Configuration**: Adjust settings:
   - Queue Management: Enable queueing, prequeue (approval required), max pending requests per guest
   - Rooms: Require a room code (rotating QR), approve each guest before they can queue
   - Rate Limiting: Cooldown duration, songs before cooldown
   - Song Voting: Enable/disable voting on queued tracks
   - Display Mode: Album aura, lyric sync offset
   - Input Methods: Enable/disable search UI and URL input
   - Content Filtering: Ban explicit songs, require synced lyrics
   - Lyrics: Provider order (lrclib / netease), pre-cache from a playlist
   - Guest Auth: Require GitHub or Google sign-in
   - Admin Password: Change admin panel password
   - Reset All Data: Clear all devices, stats, and banned tracks (keeps configuration)
6. **Statistics**: View usage statistics and queue attempt metrics

## Usage

### For Guests

1. Open the public URL (e.g., http://localhost:3000)
2. If GitHub/Google auth is required, sign in first
3. Search for a song or paste a Spotify track URL
4. Click "Queue" to add it (or submit for approval if prequeue is enabled)
5. Wait for the cooldown period before queueing another song
6. Use **Display mode** (`/display`) for a full-screen party view with now playing, lyrics, and QR code, or **Karaoke mode** (`/karaoke`) for large sing-along lyrics

### For Admins

1. Access admin panel:
   - Development: http://localhost:3002
   - Production: http://localhost:3001
2. Enter admin password (default: `admin`)
3. **Spotify Tab**: Connect or reconnect your Spotify account
4. **Devices Tab**: 
   - View all devices and their status
   - Reset cooldowns for specific devices or all devices
   - Block/unblock devices
5. **Banned Tracks Tab**:
   - Add track IDs to ban list
   - Remove tracks from ban list
6. **Configuration Tab**:
   - Adjust cooldown duration
   - Enable/disable features (fingerprinting, search UI, URL input)
   - Enable/disable explicit song banning
   - Change admin password
   - Reset all data (clears devices, stats, and banned tracks)
7. **Statistics Tab**: View usage statistics and metrics

## Security Notes

- Change the default admin password immediately after first setup; passwords are stored as **scrypt** hashes (`admin_password_hash` in the database). Plaintext `admin_password` rows from older installs are removed automatically the first time someone signs in after upgrading.
- The admin panel uses a **session cookie** (signed with `SESSION_SECRET`) after you sign in on the login page. Use **HTTPS** in production so the cookie can be marked `Secure`
- Optional **TOTP (2FA)**: set `ADMIN_TOTP_SECRET` (base32) or store `admin_totp_secret` in config; when set, the login form asks for an authenticator code
- Device fingerprinting uses cookies - clearing cookies will reset the fingerprint
- Rate limiting prevents spam but can be bypassed by clearing cookies (acceptable for event use)

## Troubleshooting

### "No active Spotify device found"

- Make sure Spotify is open and playing on at least one device
- The device must be active (not paused for too long)

### Screens show "Nothing playing" / "Spotify is rate-limiting this app"

Spotify returns **HTTP 429 `QUOTA_EXCEEDED`** when the app exceeds its API quota.
Check it directly:

```bash
node -e "require('dotenv').config(); const a=require('axios'); const {getAccessToken}=require('./server/utils/spotify');
(async()=>{const t=await getAccessToken(); const r=await a.get('https://api.spotify.com/v1/me/player/currently-playing',{headers:{Authorization:'Bearer '+t},validateStatus:()=>true});
console.log(r.status, r.headers['retry-after'] ? 'retry after '+r.headers['retry-after']+'s' : '');})()"
```

A `Retry-After` of a few seconds is a normal burst limit and clears itself. A value
of **hours** means the app's quota is exhausted — apps in Spotify's default
**Development Mode** have a limited quota, and nothing but time restores it.

To reduce consumption:

- The server caches now-playing and shares one upstream call between every screen,
  so extra displays are free. Keep it that way — don't bypass `/api/now-playing`.
- Avoid leaving many `/display` or `/karaoke` tabs open on machines you're not using.
- **Pre-cache lyrics before the event** (Configuration → Lyrics) so the night itself
  spends its quota only on playback state.
- For heavy use, apply for **Extended Quota Mode** in the Spotify developer dashboard.

### "Failed to authenticate with Spotify"

- Check that your Client ID and Secret are correct in `.env`
- Verify your refresh token is valid (or reconnect through admin panel)
- Refresh tokens don't expire, but if you revoke access, you'll need to reconnect
- Use the admin panel's Spotify tab to reconnect - no restart needed

### Forgot admin password (server access)

- From the project directory, set a new password (writes a scrypt hash):

```bash
cd ~/SpotiQueue
node -e "require('dotenv').config(); require('./server/db').initDatabase(); require('./server/utils/adminPassword').setAdminPasswordFromPlain('YOUR_NEW_PASSWORD');"
```

### Admin panel shows authentication error

- Default password is `admin` (unless changed in Configuration)
- Ensure `SESSION_SECRET` is set in production and `ADMIN_CLIENT_URL` matches your admin URL (needed for CORS with credentials)
- If TOTP is enabled, enter the current 6-digit code from your authenticator app
- Check that you're accessing the correct port:
  - Development: http://localhost:3002
  - Production: http://localhost:3001
- Try clearing site cookies for the admin origin and sign in again

### PM2 shows `errored` or the process keeps restarting

- **`MODULE_NOT_FOUND`**: After `git pull`, run **`npm install`** in the project root on the server so dependencies (e.g. `express-session`, `better-sqlite3-session-store`) are installed. Then `pm2 restart spotify-queue`.
- Read the real error: `pm2 logs spotify-queue --lines 80` (or your process name). The log now prints which listen failed (public vs admin port).
- **Port already in use (`EADDRINUSE`)**: Something else is bound to `PORT` or `ADMIN_PORT` (often another PM2 copy, nginx, or an old node). Free the ports or change them in `.env`.
- **Native module errors (`better-sqlite3`)**: Install dependencies **on the server** (`npm install` or `npm ci`), then run `npm rebuild better-sqlite3`. Do not copy `node_modules` from Windows/macOS to Linux.
- **Missing build**: After `git pull`, run `npm run build` so `client/build` and `admin/build` exist when `NODE_ENV=production`.
- **Database path**: Ensure the user running PM2 can read/write `DB_PATH` (default `./data/queue.db`).

### Now Playing not updating

- Ensure `SPOTIFY_USER_ID` is set correctly (auto-filled when connecting)
- The user must have an active playback session
- Check browser console for errors

### "Explicit songs are not allowed"

- This means content filtering is enabled in the admin panel
- Go to Configuration → Content Filtering to disable if needed
- Explicit songs are also filtered from search results when enabled

## Production Deployment on Ubuntu Server

This guide covers deploying the Spotify Queue App directly on an Ubuntu server without Docker.

### Server Specifications

#### Minimum Requirements (Small Events - up to 50 concurrent users)

- **CPU**: 1 vCPU / 1 core
- **RAM**: 512 MB - 1 GB
- **Storage**: 5 GB (SSD recommended)
- **Network**: 10 Mbps upload
- **OS**: Ubuntu 20.04 LTS or later

#### Recommended (Medium Events - up to 200 concurrent users)

- **CPU**: 2 vCPUs / 2 cores
- **RAM**: 2 GB
- **Storage**: 10 GB SSD
- **Network**: 25 Mbps upload
- **OS**: Ubuntu 22.04 LTS or later

#### Optimal (Large Events - 200+ concurrent users)

- **CPU**: 4 vCPUs / 4 cores
- **RAM**: 4 GB
- **Storage**: 20 GB SSD
- **Network**: 50+ Mbps upload
- **OS**: Ubuntu 22.04 LTS or later

#### Resource Usage Notes

- **Memory**: The application typically uses 200-400 MB RAM at idle, up to 800 MB under load
- **CPU**: Low CPU usage (5-15% on 1 core) during normal operation, spikes during Spotify API calls
- **Storage**: SQLite database grows slowly (~1 MB per 1000 queue attempts). Application files require ~200 MB
- **Network**: Minimal bandwidth usage. Most traffic is small API requests. Spotify API calls are external and don't consume server bandwidth
- **Concurrent Users**: The app handles concurrent users well due to SQLite's read performance and Express.js's async nature

#### Cloud Provider Examples

**Budget Options:**
- DigitalOcean Droplet: $6/month (1 GB RAM, 1 vCPU)
- Vultr: $6/month (1 GB RAM, 1 vCPU)
- Linode: $5/month (1 GB RAM, 1 vCPU)

**Recommended Options:**
- DigitalOcean Droplet: $12/month (2 GB RAM, 1 vCPU)
- AWS EC2 t3.small: ~$15/month (2 GB RAM, 2 vCPUs)
- Google Cloud e2-small: ~$12/month (2 GB RAM, 2 vCPUs)

**High Performance:**
- DigitalOcean Droplet: $24/month (4 GB RAM, 2 vCPUs)
- AWS EC2 t3.medium: ~$30/month (4 GB RAM, 2 vCPUs)

### Prerequisites

- Ubuntu 20.04 or later
- Root or sudo access
- Domain name (optional, recommended for HTTPS)
- Ports 3000 and 3001 available (or configure custom ports)

### Step 1: Install Node.js and PM2

```bash
# Update package index
sudo apt update

# Install Node.js 18.x
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify installation
node --version
npm --version

# Install PM2 (process manager) - MUST use npm, not apt
sudo npm install -g pm2

# Verify PM2 installation
pm2 --version
```

### Step 2: Clone and Configure the Application

```bash
# Clone the repository
git clone https://github.com/StroepWafel/SpotiQueue
cd SpotifyQueueApp

# Copy environment file
cp env.example .env

# Edit .env file
nano .env
```

Configure your `.env` file:

```env
# Spotify Credentials
SPOTIFY_CLIENT_ID=your_client_id_here
SPOTIFY_CLIENT_SECRET=your_client_secret_here
SPOTIFY_REFRESH_TOKEN=  # Will be auto-filled after connecting
SPOTIFY_USER_ID=  # Will be auto-filled after connecting

# For production, update these URLs to your domain
CLIENT_URL=http://your-domain.com:3000
ADMIN_CLIENT_URL=http://your-domain.com:3001

# Or if using reverse proxy with HTTPS:
# CLIENT_URL=https://your-domain.com
# ADMIN_CLIENT_URL=https://your-domain.com/admin

# Database path
DB_PATH=./data/queue.db

# Admin session signing (required for production; use a long random string)
SESSION_SECRET=your_random_secret_here

# Optional: TOTP second factor (base32 secret, e.g. from an authenticator app setup)
# ADMIN_TOTP_SECRET=

# Node environment
NODE_ENV=production
PORT=3000
ADMIN_PORT=3001
```

Update your Spotify app's redirect URI in the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard):
- For direct access: `http://your-server-ip:3000/api/auth/callback`
- For reverse proxy with HTTPS: `https://your-domain.com/api/auth/callback`

### Step 3: Build and Start the Application

```bash
# Install all dependencies
npm run install:all

# Build React applications
npm run build

# Start with PM2
pm2 start server/index.js --name spotify-queue

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup
# Follow the instructions it prints

# View logs
pm2 logs spotify-queue

# Check status
pm2 status
```

### Step 4: Connect Spotify Account

1. Access the admin panel: `http://your-server-ip:3001` or `http://your-domain.com/admin`
2. Enter admin password (default: `admin`)
3. Go to the "Spotify" tab (first tab in the admin panel)
4. Click "Connect Spotify Account"
5. Authorize the app on Spotify
6. The refresh token will be automatically saved to `.env`
7. No restart needed - the connection is active immediately

### Step 5: Configure Firewall (UFW)

```bash
# Allow SSH
sudo ufw allow 22/tcp

# Allow HTTP/HTTPS (if using reverse proxy)
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Allow direct access to app ports (if not using reverse proxy)
sudo ufw allow 3000/tcp
sudo ufw allow 3001/tcp

# Enable firewall
sudo ufw enable

# Check status
sudo ufw status
```

### Step 6: Set Up Reverse Proxy with Nginx

Using a reverse proxy provides HTTPS, better security, and cleaner URLs.

#### Install Nginx

```bash
sudo apt install -y nginx
```

#### Create Nginx Configuration

```bash
sudo nano /etc/nginx/sites-available/spotify-queue
```

Add the following configuration:

```nginx
# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name your-domain.com;
    
    location / {
        return 301 https://$server_name$request_uri;
    }
}

# HTTPS Configuration
server {
    listen 443 ssl http2;
    server_name your-domain.com;

    # SSL Certificate paths (see Step 7 for Let's Encrypt)
    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;
    
    # SSL Configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Public Guest UI
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Admin Panel
    location /admin {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # API endpoints
    location /api {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable the site:

```bash
sudo ln -s /etc/nginx/sites-available/spotify-queue /etc/nginx/sites-enabled/
sudo nginx -t  # Test configuration
sudo systemctl restart nginx
```

If you're using the admin panel through the reverse proxy, update your `.env`:
```env
CLIENT_URL=https://your-domain.com
ADMIN_CLIENT_URL=https://your-domain.com/admin
```

### Step 7: Set Up SSL Certificate with Let's Encrypt

```bash
# Install Certbot
sudo apt install -y certbot python3-certbot-nginx

# Obtain certificate (replace with your domain)
sudo certbot --nginx -d your-domain.com

# Certbot will automatically configure Nginx and set up auto-renewal
```

Certificates auto-renew via cron. Verify renewal:

```bash
sudo certbot renew --dry-run
```

### Step 8: Set Up Automatic Backups

Create a backup script:

```bash
sudo nano /usr/local/bin/backup-spotify-queue.sh
```

Add:

```bash
#!/bin/bash
BACKUP_DIR="/backups/spotify-queue"
SOURCE_DIR="/home/your-username/SpotifyQueueApp/data"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR
tar -czf $BACKUP_DIR/queue-db-$DATE.tar.gz -C $SOURCE_DIR queue.db

# Keep only last 30 days of backups
find $BACKUP_DIR -name "queue-db-*.tar.gz" -mtime +30 -delete

echo "Backup completed: queue-db-$DATE.tar.gz"
```

Make it executable:

```bash
sudo chmod +x /usr/local/bin/backup-spotify-queue.sh
```

Add to crontab (daily at 2 AM):

```bash
sudo crontab -e
```

Add:

```
0 2 * * * /usr/local/bin/backup-spotify-queue.sh
```

### Step 9: Useful PM2 Commands

```bash
# View logs
pm2 logs spotify-queue

# Restart the application
pm2 restart spotify-queue

# Stop the application
pm2 stop spotify-queue

# Start the application
pm2 start spotify-queue

# View status
pm2 status

# Monitor resources
pm2 monit

# View detailed info
pm2 show spotify-queue
```

### Step 11: Security Checklist

- [ ] Changed default admin password
- [ ] Set up HTTPS with valid SSL certificate
- [ ] Configured firewall (UFW) properly
- [ ] Set up automatic backups
- [ ] Updated Spotify redirect URIs to production URLs
- [ ] PM2 configured to start on boot
- [ ] Regularly update application: `git pull && npm run build && pm2 restart spotify-queue`

### Troubleshooting Production Issues

#### Application won't start

```bash
# Check PM2 logs
pm2 logs spotify-queue

# Check if ports are in use
sudo netstat -tulpn | grep -E '3000|3001'

# Verify .env file
cat .env

# Check PM2 status
pm2 status

# Try starting manually to see errors
node server/index.js
```

#### Database permissions

```bash
# Ensure data directory is writable
sudo chown -R $USER:$USER ./data
chmod -R 755 ./data
```

#### Nginx 502 Bad Gateway

- Verify application is running: `pm2 status`
- Check Nginx can reach the app: `curl http://localhost:3000`
- Verify proxy_pass URLs in Nginx config
- Check application logs: `pm2 logs spotify-queue`

#### Spotify OAuth not working

- Verify redirect URI matches exactly in Spotify Developer Dashboard
- For development: `http://127.0.0.1:5000/api/auth/callback`
- For production: `http://your-server-ip:3000/api/auth/callback` or `https://yourdomain.com/api/auth/callback`
- Check `.env` has correct `CLIENT_URL` and `ADMIN_CLIENT_URL`
- Ensure ports are accessible (or use reverse proxy)
- Use the admin panel's Spotify tab to connect - no restart needed after connecting

### Alternative: Using IP Address Instead of Domain

If you don't have a domain name:

1. Skip Nginx reverse proxy setup
2. Access directly via IP: `http://your-server-ip:3000` (public) and `http://your-server-ip:3001` (admin)
3. Update Spotify redirect URI to: `http://your-server-ip:3000/api/auth/callback`
4. HTTPS won't be available without a domain
5. Update `.env` file:
   ```env
   CLIENT_URL=http://your-server-ip:3000
   ADMIN_CLIENT_URL=http://your-server-ip:3001
   ```

### Production Deployment Checklist

1. Node.js 18+ installed
2. PM2 installed and configured
3. Application cloned and configured
4. Dependencies installed (`npm run install:all`)
5. React apps built (`npm run build`)
6. `.env` file configured with Spotify credentials
7. Application started with PM2
8. PM2 configured to start on boot
9. Spotify account connected
10. Firewall configured
11. Reverse proxy set up (optional)
12. SSL certificate installed (if using domain)
13. Backups configured
14. Admin password changed
15. Tested all functionality

## License

MIT

## Support

For issues or questions, please open an issue on GitHub.


## Gallery

Queue Page:

<img width="773" height="714" alt="Queue Page" src="github-assets/Queue Page.png" />

Queue Page Search:

<img width="764" height="1268" alt="Queue Page Search" src="github-assets/Queue Page Search.png" />

Queue Page Queue Disabled:

<img width="773" height="714" alt="Queue Page Queue Disabled" src="github-assets/Queue Page Queue Disabled.png" />

Big Picture Mode:

<img width="1920" height="960" alt="Big Picture Mode" src="github-assets/Big Picture Mode.png" />

Admin Device View:

<img width="1097" height="399" alt="Admin Device View" src="github-assets/Admin Device View.png" />

Configuration Page:

<img width="1108" height="1278" alt="Configuration Page" src="github-assets/Configuration Page.png" />

Statistics Page:

<img width="1107" height="624" alt="Statistics Page" src="github-assets/Statistics Page.png" />
