const express = require('express');
const rateLimit = require('express-rate-limit');
const { getDb } = require('../db');
const { getConfig } = require('../utils/config');
const { requireAdminSession } = require('../middleware/adminSession');
const { isTotpEnabled, verifyTotp } = require('../utils/adminLogin');
const { verifyAdminPassword, upgradePasswordToHashIfNeeded } = require('../utils/adminPassword');
const { getCooldownFingerprintIds } = require('../utils/cooldown');
const { getActiveRoom, ensureActiveRoom, createRoom, buildRoomUrl, getBaseQueueUrl, roomsEnabled } = require('../utils/rooms');
const { skipToNext } = require('../utils/spotify');
const { invalidateQueueCache } = require('./queue');

const router = express.Router();
const db = getDb();

/**
 * Brute-force guard on the only password-protected surface in the app.
 *
 * Matters most when the admin panel is reachable from the internet so helpers
 * can approve songs - without this, the password is guessable at full speed.
 * Successful logins are not counted, so a legitimate helper who signs in
 * repeatedly is never locked out.
 */
// Tuned for a live event: generous enough that a helper mistyping in the dark is
// not locked out, tight enough that guessing at machine speed is hopeless.
// Restarting the service clears it, since the counters are in memory.
const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 20,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many sign-in attempts. Wait a few minutes and try again.' }
});

router.post('/login', loginLimiter, (req, res) => {
  const { password, totp } = req.body || {};
  if (!verifyAdminPassword(password)) {
    return res.status(401).json({ error: 'Invalid password' });
  }
  if (isTotpEnabled()) {
    if (!verifyTotp(totp)) {
      return res.status(401).json({ error: 'Invalid or missing TOTP code', totpRequired: true });
    }
  }
  upgradePasswordToHashIfNeeded(password);
  req.session.regenerate((regErr) => {
    if (regErr) {
      console.error('Session regenerate error:', regErr);
      return res.status(500).json({ error: 'Session failed' });
    }
    req.session.adminAuthenticated = true;
    req.session.save((saveErr) => {
      if (saveErr) {
        console.error('Session save error:', saveErr);
        return res.status(500).json({ error: 'Session failed' });
      }
      res.json({ success: true, authenticated: true });
    });
  });
});

router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Session destroy error:', err);
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.clearCookie('spotiqueue.admin.sid', { path: '/' });
    res.json({ success: true });
  });
});

router.get('/session', (req, res) => {
  res.json({
    authenticated: !!(req.session && req.session.adminAuthenticated),
    totpRequired: isTotpEnabled()
  });
});

router.use(requireAdminSession);

// Get all devices (fingerprints)
router.get('/devices', (req, res) => {
  const { status, sort = 'last_queue_attempt' } = req.query;
  const SORT_COLUMNS = new Set(['last_queue_attempt', 'first_seen', 'cooldown_expires', 'created_at', 'username', 'status']);
  const sortColumn = SORT_COLUMNS.has(sort) ? sort : 'last_queue_attempt';

  let query = 'SELECT * FROM fingerprints';
  const params = [];

  if (status) {
    query += ' WHERE status = ?';
    params.push(status);
  }

  query += ` ORDER BY ${sortColumn} DESC LIMIT 100`;

  const devices = db.prepare(query).all(...params);

  const now = Math.floor(Date.now() / 1000);

  const devicesWithStatus = devices.map(device => {
    const isCoolingDown = device.cooldown_expires && device.cooldown_expires > now;
    const cooldownRemaining = isCoolingDown ? device.cooldown_expires - now : 0;

    return {
      ...device,
      is_cooling_down: isCoolingDown,
      cooldown_remaining: cooldownRemaining,
      display_id: device.id.substring(0, 8) + '...'
    };
  });

  if (sortColumn === 'last_queue_attempt') {
    devicesWithStatus.sort((a, b) => {
      if (a.username && !b.username) return -1;
      if (!a.username && b.username) return 1;
      return (b.last_queue_attempt || 0) - (a.last_queue_attempt || 0);
    });
  }

  res.json({ devices: devicesWithStatus });
});

// Get device details
router.get('/devices/:id', (req, res) => {
  const { id } = req.params;
  const { limit = '100' } = req.query;
  const limitNum = parseInt(limit, 10);

  const device = db.prepare('SELECT * FROM fingerprints WHERE id = ?').get(id);
  if (!device) {
    return res.status(404).json({ error: 'Device not found' });
  }

  const attempts = db.prepare(`
    SELECT * FROM queue_attempts
    WHERE fingerprint_id = ?
    ORDER BY timestamp DESC
    LIMIT ?
  `).all(id, limitNum);

  const totalAttempts = db.prepare(`
    SELECT COUNT(*) as count FROM queue_attempts WHERE fingerprint_id = ?
  `).get(id).count;

  res.json({ device, attempts, total_attempts: totalAttempts });
});

// Reset cooldown for a device
router.post('/devices/:id/reset-cooldown', (req, res) => {
  const { id } = req.params;

  const device = db.prepare('SELECT * FROM fingerprints WHERE id = ?').get(id);
  if (!device) {
    return res.status(404).json({ error: 'Device not found' });
  }

  const now = Math.floor(Date.now() / 1000);
  const cooldownDuration = parseInt(getConfig('cooldown_duration') || '300', 10);
  const cooldownWindowStart = now - cooldownDuration;
  const cooldownIds = getCooldownFingerprintIds(device);
  const placeholders = cooldownIds.map(() => '?').join(',');

  const resetCooldownAndWindowCount = db.transaction(() => {
    db.prepare(`
      UPDATE fingerprints
      SET cooldown_expires = NULL
      WHERE id IN (${placeholders})
    `).run(...cooldownIds);

    // Keep historical rows but move recent successful attempts outside cooldown window.
    db.prepare(`
      UPDATE queue_attempts
      SET timestamp = ?
      WHERE fingerprint_id IN (${placeholders})
        AND status = 'success'
        AND timestamp > ?
    `).run(cooldownWindowStart - 1, ...cooldownIds, cooldownWindowStart);
  });

  resetCooldownAndWindowCount();

  res.json({ success: true, message: 'Cooldown reset' });
});

// Block a device
router.post('/devices/:id/block', (req, res) => {
  const { id } = req.params;

  const device = db.prepare('SELECT * FROM fingerprints WHERE id = ?').get(id);
  if (!device) {
    return res.status(404).json({ error: 'Device not found' });
  }

  db.prepare('UPDATE fingerprints SET status = ? WHERE id = ?').run('blocked', id);

  res.json({ success: true, message: 'Device blocked' });
});

// Unblock a device
router.post('/devices/:id/unblock', (req, res) => {
  const { id } = req.params;

  const device = db.prepare('SELECT * FROM fingerprints WHERE id = ?').get(id);
  if (!device) {
    return res.status(404).json({ error: 'Device not found' });
  }

  db.prepare('UPDATE fingerprints SET status = ? WHERE id = ?').run('active', id);

  res.json({ success: true, message: 'Device unblocked' });
});

// Reset all cooldowns
router.post('/devices/reset-all-cooldowns', (req, res) => {
  db.prepare('UPDATE fingerprints SET cooldown_expires = NULL').run();

  res.json({ success: true, message: 'All cooldowns reset' });
});

// Get banned tracks
router.get('/banned-tracks', (req, res) => {
  const tracks = db.prepare('SELECT * FROM banned_tracks ORDER BY created_at DESC').all();
  res.json({ tracks });
});

// Add banned track
router.post('/banned-tracks', (req, res) => {
  const { track_id, artist_id, reason } = req.body;

  if (!track_id) {
    return res.status(400).json({ error: 'Track ID required' });
  }

  try {
    db.prepare(`
      INSERT INTO banned_tracks (track_id, artist_id, reason)
      VALUES (?, ?, ?)
    `).run(track_id, artist_id || null, reason || null);

    res.json({ success: true, message: 'Track banned' });
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(400).json({ error: 'Track already banned' });
    }
    throw error;
  }
});

// Remove banned track
router.delete('/banned-tracks/:trackId', (req, res) => {
  const { trackId } = req.params;

  const result = db.prepare('DELETE FROM banned_tracks WHERE track_id = ?').run(trackId);

  if (result.changes === 0) {
    return res.status(404).json({ error: 'Banned track not found' });
  }

  res.json({ success: true, message: 'Track unbanned' });
});

// Get public client URL (for QR code generation)
router.get('/client-url', (req, res) => {
  const url = getConfig('queue_url') || process.env.CLIENT_URL || 'http://localhost:3000';
  res.json({ url });
});

/**
 * Skip whatever is playing.
 *
 * Spotify has no way to remove a track from the queue, so once something is on
 * the speakers this is the only remedy - which matters when a request slips
 * through moderation.
 */
router.post('/playback/next', async (req, res) => {
  try {
    const skipped = db.prepare(`
      SELECT track_id, track_name FROM queue_attempts
      WHERE status = 'success' ORDER BY timestamp DESC LIMIT 1
    `).get();

    await skipToNext();
    invalidateQueueCache();

    console.log(`Admin skipped the current track${skipped?.track_name ? `: ${skipped.track_name}` : ''}`);
    res.json({ success: true, message: 'Skipped to the next track.' });
  } catch (error) {
    res.status(502).json({ error: error.message || 'Failed to skip track' });
  }
});

function roomPayload(room, baseUrl) {
  const base = baseUrl || getBaseQueueUrl();
  return {
    rooms_enabled: roomsEnabled(),
    code: room ? room.code : null,
    created_at: room ? room.created_at : null,
    base_url: base,
    url: room ? buildRoomUrl(room.code, base) : base
  };
}

// Current room + the URL its QR code should encode
router.get('/room', (req, res) => {
  const { base_url: baseOverride } = req.query;
  const room = roomsEnabled() ? ensureActiveRoom() : getActiveRoom();
  res.json(roomPayload(room, typeof baseOverride === 'string' && baseOverride.trim() ? baseOverride.trim() : null));
});

/**
 * Rotate to a fresh room: new code, new QR, old link dead.
 *
 * Also clears the pending approval backlog, in-flight grace-period requests,
 * votes and cooldowns - see createRoom(). Songs already handed to Spotify keep
 * playing, since the Web API cannot remove them from the queue.
 */
router.post('/room/new', (req, res) => {
  try {
    const room = createRoom();
    const baseOverride = typeof req.body?.base_url === 'string' && req.body.base_url.trim()
      ? req.body.base_url.trim()
      : null;
    console.log(`New room created: ${room.code}`);
    res.json({ success: true, ...roomPayload(room, baseOverride) });
  } catch (error) {
    console.error('Create room error:', error);
    res.status(500).json({ error: error.message || 'Failed to create room' });
  }
});

// Get queue statistics
router.get('/stats', (req, res) => {
  const totalDevices = db.prepare('SELECT COUNT(*) as count FROM fingerprints').get().count;
  const activeDevices = db.prepare("SELECT COUNT(*) as count FROM fingerprints WHERE status = 'active'").get().count;
  const blockedDevices = db.prepare("SELECT COUNT(*) as count FROM fingerprints WHERE status = 'blocked'").get().count;

  const now = Math.floor(Date.now() / 1000);
  const coolingDown = db.prepare('SELECT COUNT(*) as count FROM fingerprints WHERE cooldown_expires > ?').get(now).count;

  const totalAttempts = db.prepare('SELECT COUNT(*) as count FROM queue_attempts').get().count;
  const successfulAttempts = db.prepare("SELECT COUNT(*) as count FROM queue_attempts WHERE status = 'success'").get().count;

  res.json({
    devices: {
      total: totalDevices,
      active: activeDevices,
      blocked: blockedDevices,
      cooling_down: coolingDown
    },
    queue_attempts: {
      total: totalAttempts,
      successful: successfulAttempts
    }
  });
});

// Reset all data (devices, stats, banned tracks - but NOT config)
router.post('/reset-all-data', (req, res) => {
  try {
    const resetData = db.transaction(() => {
      db.prepare('DELETE FROM queue_attempts').run();
      db.prepare('DELETE FROM fingerprints').run();
      db.prepare('DELETE FROM banned_tracks').run();
    });

    resetData();

    res.json({
      success: true,
      message: 'All data has been reset. Devices, stats, and banned tracks have been cleared.'
    });
  } catch (error) {
    console.error('Error resetting data:', error);
    res.status(500).json({ error: `Failed to reset data: ${error.message}` });
  }
});

module.exports = router;
