const express = require('express');
const crypto = require('crypto');
const { getDb } = require('../db');
const { getConfig } = require('../utils/config');
const { getGuestAuthRequirements } = require('../utils/guest-auth');
const { resolveGuestRoom, setRoomCookie } = require('../middleware/room');

const router = express.Router();
const db = getDb();

// Generate or retrieve fingerprint
router.post('/generate', (req, res) => {
  const fingerprintId = req.cookies.fingerprint_id || crypto.randomBytes(16).toString('hex');
  const username = req.body.username || null;
  const requireUsername = getConfig('require_username') === 'true';

  // Joining a room is the first gate: without a valid code there is nothing to
  // sign in to. A stale cookie is deliberately left in place - it is what lets
  // us tell the guest their room was closed rather than a generic "scan to
  // join", and scanning the new QR overwrites it anyway.
  const roomResolution = resolveGuestRoom(req);
  if (!roomResolution.ok) {
    const errors = {
      no_room: 'No room is open right now. Ask the host to start one.',
      room_invalid: 'This room has been closed. Scan the new QR code to keep queueing.',
      room_required: 'Scan the QR code shown by the host to join.'
    };
    return res.status(403).json({
      error: errors[roomResolution.reason] || 'This room is not available.',
      room_error: roomResolution.reason
    });
  }
  if (roomResolution.code) {
    setRoomCookie(res, roomResolution.code);
  }

  // Check if fingerprint exists
  const existing = db.prepare('SELECT * FROM fingerprints WHERE id = ?').get(fingerprintId);
  
  if (!existing) {
    // Create new fingerprint
    const now = Math.floor(Date.now() / 1000);
    
    // If username is required but not provided, return error
    if (requireUsername && !username) {
      return res.status(400).json({ 
        error: 'Username is required',
        requires_username: true 
      });
    }
    
    db.prepare(`
      INSERT INTO fingerprints (id, first_seen, last_queue_attempt, cooldown_expires, status, username, room_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(fingerprintId, now, null, null, 'active', username, roomResolution.room?.id || null);
  } else {
    // Update username if provided and not already set
    if (username && !existing.username) {
      db.prepare('UPDATE fingerprints SET username = ? WHERE id = ?').run(username, fingerprintId);
    }

    // A returning device re-joins under whichever room admitted it this time.
    if (roomResolution.room && existing.room_id !== roomResolution.room.id) {
      db.prepare('UPDATE fingerprints SET room_id = ? WHERE id = ?').run(roomResolution.room.id, fingerprintId);
    }

    // If username is required but not set, return error
    if (requireUsername && !existing.username && !username) {
      return res.status(400).json({ 
        error: 'Username is required',
        requires_username: true 
      });
    }
  }
  
  res.cookie('fingerprint_id', fingerprintId, {
    httpOnly: true,
    maxAge: 365 * 24 * 60 * 60 * 1000, // 1 year
    sameSite: 'lax'
  });
  
  const fingerprint = db.prepare('SELECT * FROM fingerprints WHERE id = ?').get(fingerprintId);
  const authReq = getGuestAuthRequirements(fingerprint);

  res.json({
    fingerprint_id: fingerprintId,
    username: fingerprint.username,
    room_code: roomResolution.code,
    requires_username: requireUsername && !fingerprint.username,
    requires_github_auth: authReq.needsGithubAuth,
    requires_google_auth: authReq.needsGoogleAuth,
    github_oauth_configured: authReq.githubOAuthConfigured,
    google_oauth_configured: authReq.googleOAuthConfigured
  });
});

// Validate fingerprint
router.post('/validate', (req, res) => {
  const fingerprintId = req.body.fingerprint_id || req.cookies.fingerprint_id;
  const requireUsername = getConfig('require_username') === 'true';
  
  if (!fingerprintId) {
    return res.status(400).json({ error: 'No fingerprint provided' });
  }
  
  const fingerprint = db.prepare('SELECT * FROM fingerprints WHERE id = ?').get(fingerprintId);
  
  if (!fingerprint) {
    return res.status(400).json({ error: 'Invalid fingerprint' });
  }
  
  // Check if username is required but not set
  if (requireUsername && !fingerprint.username) {
    return res.status(400).json({ 
      error: 'Username is required',
      requires_username: true 
    });
  }
  
  if (fingerprint.status === 'blocked') {
    return res.status(403).json({ error: 'Device is blocked from queueing songs.' });
  }
  
  const now = Math.floor(Date.now() / 1000);
  const cooldownEnabled = getConfig('fingerprinting_enabled') === 'true';
  
  if (cooldownEnabled && fingerprint.cooldown_expires && fingerprint.cooldown_expires > now) {
    const remaining = fingerprint.cooldown_expires - now;
    return res.status(429).json({ 
      error: 'Please wait before queueing another song!',
      cooldown_remaining: remaining
    });
  }
  
  res.json({ valid: true, fingerprint });
});

module.exports = router;

