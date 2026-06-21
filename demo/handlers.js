import {
  loadStore,
  saveStore,
  resetStore,
  getFingerprintId,
  ensureFingerprint,
  getPublicConfig,
  isGraceEnabled,
  getGraceSeconds
} from './store.js'
import { getNowPlayingTrack } from './progress.js'
import { DEMO_TRACKS, trackById, parseSpotifyUrl } from './fixtures.js'
import { DEMO_ADMIN_PASSWORD, sanitizeConfigForDemo, isSensitiveConfigKeyForWrite } from './sanitize.js'

function nowSec() {
  return Math.floor(Date.now() / 1000)
}

function ok(data, status = 200) {
  return { data, status }
}

function err(message, status = 400, extra = {}) {
  return { data: { error: message, ...extra }, status }
}

function normalizePath(url) {
  let path = (url || '').replace(/^https?:\/\/[^/]+/, '')
  const q = path.indexOf('?')
  path = q >= 0 ? path.slice(0, q) : path
  if (!path.startsWith('/')) path = `/${path}`
  return path
}

function parseRequestBody(data) {
  if (data == null || data === '') return {}
  if (typeof data === 'string') {
    try {
      return JSON.parse(data)
    } catch {
      return {}
    }
  }
  if (typeof data === 'object') {
    if (typeof data.toJSON === 'function') return data.toJSON()
    return data
  }
  return {}
}

function getCooldownRemaining(fingerprint, state) {
  if (state.config.fingerprinting_enabled !== 'true') return 0
  const now = nowSec()
  if (fingerprint.cooldown_expires && fingerprint.cooldown_expires > now) {
    return fingerprint.cooldown_expires - now
  }
  return 0
}

function countRecentSuccesses(fingerprintId, state) {
  const duration = parseInt(state.config.cooldown_duration || '300', 10)
  const windowStart = nowSec() - duration
  return state.queueAttempts.filter(
    a => a.fingerprint_id === fingerprintId && a.status === 'success' && a.timestamp > windowStart
  ).length
}

function applyCooldown(fingerprintId, state) {
  const songsBefore = parseInt(state.config.songs_before_cooldown || '1', 10)
  const duration = parseInt(state.config.cooldown_duration || '300', 10)
  const fp = state.fingerprints[fingerprintId]
  if (!fp || state.config.fingerprinting_enabled !== 'true') return

  if (countRecentSuccesses(fingerprintId, state) >= songsBefore) {
    fp.cooldown_expires = nowSec() + duration
  }
}

function confirmPending(state, pendingId) {
  const pending = state.pendingQueues[pendingId]
  if (!pending) return err('Pending queue not found.', 404)
  if (pending.status === 'confirmed') {
    return ok({
      success: true,
      pending: false,
      message: `Queued: ${pending.track_name} - ${pending.artist_name}`,
      track: pending.track
    })
  }
  if (pending.status === 'cancelled') return err('This queue request was cancelled.', 410)
  if (pending.status !== 'pending') return err('This queue request is no longer pending.', 409)

  const now = nowSec()
  if (now < pending.execute_at) {
    return err('Grace period has not finished yet.', 425, { execute_at: pending.execute_at })
  }

  const track = pending.track
  state.queue.push({ ...track, votable: true })
  if (!state.guestQueuedTrackIds.includes(track.id)) {
    state.guestQueuedTrackIds.push(track.id)
  }

  state.queueAttempts.push({
    id: state.nextAttemptId++,
    fingerprint_id: pending.fingerprint_id,
    track_id: track.id,
    track_name: track.name,
    artist_name: track.artists,
    status: 'success',
    timestamp: now
  })

  const fp = state.fingerprints[pending.fingerprint_id]
  if (fp) fp.last_queue_attempt = now
  applyCooldown(pending.fingerprint_id, state)
  pending.status = 'confirmed'
  saveStore()

  return ok({
    success: true,
    pending: false,
    message: `Queued: ${track.name} - ${track.artists}`,
    track
  })
}

function processExpiredPending(state) {
  const now = nowSec()
  Object.keys(state.pendingQueues).forEach(id => {
    const p = state.pendingQueues[id]
    if (p.status === 'pending' && p.execute_at <= now) {
      confirmPending(state, id)
    }
  })
}

function buildQueueResponse(state) {
  processExpiredPending(state)
  const playing = state.currentlyPlaying
    ? { ...state.currentlyPlaying, votable: state.guestQueuedTrackIds.includes(state.currentlyPlaying.id) }
    : null

  let queue = state.queue.map(t => ({
    ...t,
    votable: state.guestQueuedTrackIds.includes(t.id)
  }))

  if (state.config.voting_auto_promote === 'true') {
    queue = [...queue].sort((a, b) => {
      if (!a.votable && !b.votable) return 0
      if (!a.votable) return 1
      if (!b.votable) return -1
      return (state.votes[b.id] ?? 0) - (state.votes[a.id] ?? 0)
    })
  }

  return { queue, currently_playing: playing }
}

function validateQueueAllowed(state, fingerprintId) {
  if (state.config.queueing_enabled === 'false') {
    return err('Queueing is currently disabled.', 503)
  }
  const fp = state.fingerprints[fingerprintId]
  if (!fp) return err('Could not fingerprint your device.', 400)
  if (fp.status === 'blocked') return err('This device is blocked from queueing songs.', 403)

  const remaining = getCooldownRemaining(fp, state)
  if (remaining > 0) {
    return err('Please wait before queueing another song!', 429, { cooldown_remaining: remaining })
  }

  const songsBefore = parseInt(state.config.songs_before_cooldown || '1', 10)
  if (countRecentSuccesses(fingerprintId, state) >= songsBefore) {
    fp.cooldown_expires = nowSec() + parseInt(state.config.cooldown_duration || '300', 10)
    saveStore()
    return err(`You've reached the limit of ${songsBefore} song${songsBefore > 1 ? 's' : ''} before cooldown. Please wait!`, 429, {
      cooldown_remaining: parseInt(state.config.cooldown_duration || '300', 10)
    })
  }

  const existingPending = Object.values(state.pendingQueues).find(
    p => p.fingerprint_id === fingerprintId && p.status === 'pending'
  )
  if (existingPending) {
    return err('You already have a song waiting to be queued. Cancel it or wait for it to finish.', 409)
  }

  return null
}

function resolveTrack(trackId, trackUrl) {
  let id = trackId
  if (!id && trackUrl) id = parseSpotifyUrl(trackUrl)
  if (!id) return { error: err('Track ID or URL required') }

  let track = trackById(id)
  if (!track && trackUrl) {
    track = {
      id,
      name: `Track ${id.slice(0, 8)}`,
      artists: 'Unknown Artist',
      album: 'Demo',
      album_art: DEMO_TRACKS[0].album_art,
      duration_ms: 180000,
      explicit: false,
      uri: `spotify:track:${id}`
    }
  }
  if (!track) return { error: err('Track not found in demo catalog. Try searching instead.') }

  return { track, id }
}

export function handleDemoRequest(config) {
  const method = (config.method || 'get').toLowerCase()
  const path = normalizePath(config.url)
  const body = parseRequestBody(config.data)
  const params = config.params || {}
  const state = loadStore()
  processExpiredPending(state)

  // --- Guest fingerprint ---
  if (method === 'post' && path === '/api/fingerprint/generate') {
    const id = getFingerprintId()
    const fp = ensureFingerprint(state, id, body.username)
    saveStore()
    return ok({
      fingerprint_id: id,
      username: fp.username,
      requires_username: false,
      requires_github_auth: false,
      requires_google_auth: false,
      github_oauth_configured: false,
      google_oauth_configured: false
    })
  }

  // --- Public config ---
  if (method === 'get' && path === '/api/config/public') {
    return ok(getPublicConfig(state))
  }

  // --- Now playing ---
  if (method === 'get' && path === '/api/now-playing') {
    return ok({ track: getNowPlayingTrack(state) })
  }

  // --- Queue search ---
  if (method === 'post' && path === '/api/queue/search') {
    const query = (body.query || '').toLowerCase()
    if (!query.trim()) return err('Search query required')
    const tracks = DEMO_TRACKS.filter(
      t => t.name.toLowerCase().includes(query) || t.artists.toLowerCase().includes(query)
    ).slice(0, 10)
    return ok({ tracks })
  }

  // --- Queue add ---
  if (method === 'post' && path === '/api/queue/add') {
    const fingerprintId = body.fingerprint_id || getFingerprintId()
    ensureFingerprint(state, fingerprintId)
    const blocked = validateQueueAllowed(state, fingerprintId)
    if (blocked) return blocked

    const resolved = resolveTrack(body.track_id, body.track_url)
    if (resolved.error) return resolved.error
    const { track, id: trackId } = resolved

    if (state.bannedTracks.some(b => b.track_id === trackId)) {
      return err('This song is not allowed.', 403)
    }

    if (state.config.prequeue_enabled === 'true') {
      // shouldn't hit add when prequeue on, but handle anyway
    }

    if (isGraceEnabled(state)) {
      const grace = getGraceSeconds(state)
      const executeAt = nowSec() + grace
      const pendingId = crypto.randomUUID().replace(/-/g, '').slice(0, 16)
      state.pendingQueues[pendingId] = {
        id: pendingId,
        fingerprint_id: fingerprintId,
        track_id: trackId,
        track_name: track.name,
        artist_name: track.artists,
        track,
        status: 'pending',
        execute_at: executeAt,
        created_at: nowSec()
      }
      saveStore()
      return ok({
        success: true,
        pending: true,
        pending_id: pendingId,
        execute_at: executeAt,
        grace_seconds: grace,
        message: `Adding in ${grace}s. Cancel if you changed your mind`,
        track
      })
    }

    state.queue.push({ ...track, votable: true })
    if (!state.guestQueuedTrackIds.includes(trackId)) state.guestQueuedTrackIds.push(trackId)
    const now = nowSec()
    state.queueAttempts.push({
      id: state.nextAttemptId++,
      fingerprint_id: fingerprintId,
      track_id: trackId,
      track_name: track.name,
      artist_name: track.artists,
      status: 'success',
      timestamp: now
    })
    state.fingerprints[fingerprintId].last_queue_attempt = now
    applyCooldown(fingerprintId, state)
    saveStore()
    return ok({
      success: true,
      pending: false,
      message: `Queued: ${track.name} - ${track.artists}`,
      track
    })
  }

  // --- Queue cancel ---
  const cancelMatch = path.match(/^\/api\/queue\/cancel\/([^/]+)$/)
  if (method === 'post' && cancelMatch) {
    const pendingId = cancelMatch[1]
    const fingerprintId = body.fingerprint_id || getFingerprintId()
    const pending = state.pendingQueues[pendingId]
    if (!pending) return err('Pending queue not found.', 404)
    if (pending.fingerprint_id !== fingerprintId) return err('Not allowed to cancel this queue request.', 403)
    if (pending.status === 'cancelled') return ok({ success: true, message: 'Queue request cancelled.' })
    if (pending.status !== 'pending') return err('This queue request can no longer be cancelled.', 409)
    if (nowSec() >= pending.execute_at) {
      return err('Grace period has ended. The song may already be queued.', 409)
    }
    pending.status = 'cancelled'
    saveStore()
    return ok({ success: true, message: 'Queue request cancelled. Your queue slot was restored.' })
  }

  // --- Queue confirm ---
  const confirmMatch = path.match(/^\/api\/queue\/confirm\/([^/]+)$/)
  if (method === 'post' && confirmMatch) {
    const pendingId = confirmMatch[1]
    const fingerprintId = body.fingerprint_id || getFingerprintId()
    const pending = state.pendingQueues[pendingId]
    if (!pending) return err('Pending queue not found.', 404)
    if (pending.fingerprint_id !== fingerprintId) return err('Not allowed to confirm this queue request.', 403)
    return confirmPending(state, pendingId)
  }

  // --- Queue current ---
  if (method === 'get' && path === '/api/queue/current') {
    return ok(buildQueueResponse(state))
  }

  // --- Votes ---
  if (method === 'get' && path === '/api/queue/votes') {
    const fingerprintId = params.fingerprint_id || getFingerprintId()
    if (state.config.voting_enabled !== 'true') {
      return ok({ votes: {}, userVotes: {}, enabled: false, downvoteEnabled: false })
    }
    const userVotes = {}
    state.voteRecords.filter(v => v.fingerprint_id === fingerprintId).forEach(v => {
      userVotes[v.track_id] = v.direction
    })
    return ok({
      votes: { ...state.votes },
      userVotes,
      enabled: true,
      downvoteEnabled: state.config.voting_downvote_enabled !== 'false'
    })
  }

  if (method === 'post' && path === '/api/queue/vote') {
    if (state.config.voting_enabled !== 'true') return err('Voting is currently disabled.', 503)
    const { track_id, direction: dir } = body
    const fingerprintId = body.fingerprint_id || getFingerprintId()
    if (!track_id) return err('Track ID and fingerprint required')
    if (!state.guestQueuedTrackIds.includes(track_id)) {
      return err('Voting is only available for songs queued by guests.')
    }
    const direction = dir === -1 ? -1 : 1
    if (dir === -1 && state.config.voting_downvote_enabled === 'false') {
      return err('Downvotes are disabled.')
    }
    const existing = state.voteRecords.find(v => v.track_id === track_id && v.fingerprint_id === fingerprintId)
    if (existing) {
      if (existing.direction === direction) {
        state.voteRecords = state.voteRecords.filter(v => !(v.track_id === track_id && v.fingerprint_id === fingerprintId))
      } else {
        existing.direction = direction
      }
    } else {
      state.voteRecords.push({ track_id, fingerprint_id: fingerprintId, direction })
    }
    state.votes[track_id] = state.voteRecords
      .filter(v => v.track_id === track_id)
      .reduce((sum, v) => sum + v.direction, 0)
    saveStore()
    const userVote = state.voteRecords.find(v => v.track_id === track_id && v.fingerprint_id === fingerprintId)
    return ok({ userVote: userVote?.direction ?? null, votes: state.votes[track_id] ?? 0 })
  }

  // --- Prequeue ---
  if (method === 'post' && path === '/api/prequeue/submit') {
    if (state.config.prequeue_enabled !== 'true') return err('Prequeue is currently disabled.', 503)
    const fingerprintId = body.fingerprint_id || getFingerprintId()
    ensureFingerprint(state, fingerprintId)
    const resolved = resolveTrack(body.track_id, body.track_url)
    if (resolved.error) return resolved.error
    const { track, id: trackId } = resolved
    const id = crypto.randomUUID().replace(/-/g, '').slice(0, 16)
    state.prequeue.push({
      id,
      fingerprint_id: fingerprintId,
      track_id: trackId,
      track_name: track.name,
      artist_name: track.artists,
      album_art: track.album_art,
      status: 'pending',
      created_at: nowSec()
    })
    saveStore()
    return ok({ success: true, prequeue_id: id, message: 'Track submitted for approval' })
  }

  if (method === 'get' && path === '/api/prequeue/pending') {
    if (!state.adminAuthenticated) return err('Unauthorized', 401)
    const pending = state.prequeue.filter(p => p.status === 'pending')
    return ok({ pending })
  }

  const approveMatch = path.match(/^\/api\/prequeue\/approve\/([^/]+)$/)
  if (method === 'post' && approveMatch) {
    if (!state.adminAuthenticated) return err('Unauthorized', 401)
    const item = state.prequeue.find(p => p.id === approveMatch[1])
    if (!item) return err('Not found', 404)
    const track = trackById(item.track_id) || {
      id: item.track_id,
      name: item.track_name,
      artists: item.artist_name,
      album_art: item.album_art,
      duration_ms: 180000,
      uri: `spotify:track:${item.track_id}`
    }
    state.queue.push({ ...track, votable: true })
    if (!state.guestQueuedTrackIds.includes(track.id)) state.guestQueuedTrackIds.push(track.id)
    item.status = 'approved'
    saveStore()
    return ok({ success: true, message: 'Track approved and queued' })
  }

  const declineMatch = path.match(/^\/api\/prequeue\/decline\/([^/]+)$/)
  if (method === 'post' && declineMatch) {
    if (!state.adminAuthenticated) return err('Unauthorized', 401)
    const item = state.prequeue.find(p => p.id === declineMatch[1])
    if (!item) return err('Not found', 404)
    item.status = 'declined'
    saveStore()
    return ok({ success: true, message: 'Track declined' })
  }

  // --- Admin auth ---
  if (method === 'post' && path === '/api/admin/login') {
    const password = String(body.password ?? '').trim()
    if (password !== DEMO_ADMIN_PASSWORD) {
      return err('Invalid password', 401)
    }
    state.adminAuthenticated = true
    saveStore()
    return ok({ success: true, authenticated: true })
  }

  if (method === 'post' && path === '/api/admin/logout') {
    state.adminAuthenticated = false
    saveStore()
    return ok({ success: true })
  }

  if (method === 'get' && path === '/api/admin/session') {
    return ok({ authenticated: !!state.adminAuthenticated, totpRequired: false })
  }

  // --- Admin (auth required below) ---
  const adminPaths = [
    '/api/admin/devices',
    '/api/admin/stats',
    '/api/admin/banned-tracks',
    '/api/admin/client-url',
    '/api/admin/reset-all-data',
    '/api/config'
  ]
  const needsAuth = adminPaths.some(p => path === p || path.startsWith(p + '/')) ||
    path.match(/^\/api\/admin\/devices\//) ||
    (method !== 'get' && path.startsWith('/api/config')) ||
    (method === 'put' && path.startsWith('/api/config/')) ||
    path.startsWith('/api/prequeue/')

  if (needsAuth && !state.adminAuthenticated && path !== '/api/admin/session') {
    if (path.startsWith('/api/prequeue/pending') || path.match(/^\/api\/prequeue\/(approve|decline)/)) {
      return err('Unauthorized', 401)
    }
    if (path.startsWith('/api/admin/') || (path.startsWith('/api/config') && !path.includes('/public'))) {
      return err('Unauthorized', 401)
    }
  }

  if (method === 'get' && path === '/api/config') {
    return ok({ config: sanitizeConfigForDemo(state.config) })
  }

  const configKeyMatch = path.match(/^\/api\/config\/([^/]+)$/)
  if (method === 'put' && configKeyMatch) {
    const key = configKeyMatch[1]
    if (isSensitiveConfigKeyForWrite(key)) {
      if (key === 'admin_password') {
        return ok({ success: true, key, value: '[redacted]' })
      }
      return err('This setting cannot be changed in demo mode.', 400)
    }
    state.config[key] = String(body.value)
    saveStore()
    return ok({ success: true, key, value: body.value })
  }

  if (method === 'put' && path === '/api/config') {
    Object.entries(body || {}).forEach(([key, value]) => {
      if (key === 'admin_password_configured') return
      if (isSensitiveConfigKeyForWrite(key)) return
      state.config[key] = String(value)
    })
    saveStore()
    return ok({ success: true, config: sanitizeConfigForDemo(state.config) })
  }

  if (method === 'get' && path === '/api/admin/devices') {
    const now = nowSec()
    const devices = Object.values(state.fingerprints).map(device => {
      const isCoolingDown = device.cooldown_expires && device.cooldown_expires > now
      return {
        ...device,
        is_cooling_down: !!isCoolingDown,
        cooldown_remaining: isCoolingDown ? device.cooldown_expires - now : 0,
        display_id: device.id.substring(0, 8) + '...'
      }
    })
    return ok({ devices })
  }

  const deviceDetailMatch = path.match(/^\/api\/admin\/devices\/([^/]+)$/)
  if (method === 'get' && deviceDetailMatch) {
    const device = state.fingerprints[deviceDetailMatch[1]]
    if (!device) return err('Device not found', 404)
    const attempts = state.queueAttempts.filter(a => a.fingerprint_id === device.id).slice(0, 100)
    return ok({ device, attempts, total_attempts: attempts.length })
  }

  const resetCooldownMatch = path.match(/^\/api\/admin\/devices\/([^/]+)\/reset-cooldown$/)
  if (method === 'post' && resetCooldownMatch) {
    const fp = state.fingerprints[resetCooldownMatch[1]]
    if (!fp) return err('Device not found', 404)
    fp.cooldown_expires = null
    saveStore()
    return ok({ success: true, message: 'Cooldown reset' })
  }

  const blockMatch = path.match(/^\/api\/admin\/devices\/([^/]+)\/block$/)
  if (method === 'post' && blockMatch) {
    const fp = state.fingerprints[blockMatch[1]]
    if (!fp) return err('Device not found', 404)
    fp.status = 'blocked'
    saveStore()
    return ok({ success: true, message: 'Device blocked' })
  }

  const unblockMatch = path.match(/^\/api\/admin\/devices\/([^/]+)\/unblock$/)
  if (method === 'post' && unblockMatch) {
    const fp = state.fingerprints[unblockMatch[1]]
    if (!fp) return err('Device not found', 404)
    fp.status = 'active'
    saveStore()
    return ok({ success: true, message: 'Device unblocked' })
  }

  if (method === 'post' && path === '/api/admin/devices/reset-all-cooldowns') {
    Object.values(state.fingerprints).forEach(fp => { fp.cooldown_expires = null })
    saveStore()
    return ok({ success: true, message: 'All cooldowns reset' })
  }

  if (method === 'get' && path === '/api/admin/banned-tracks') {
    return ok({ tracks: state.bannedTracks })
  }

  if (method === 'post' && path === '/api/admin/banned-tracks') {
    if (!body.track_id) return err('Track ID required')
    if (state.bannedTracks.some(t => t.track_id === body.track_id)) {
      return err('Track already banned', 400)
    }
    state.bannedTracks.push({
      id: state.bannedTracks.length + 1,
      track_id: body.track_id,
      artist_id: body.artist_id || null,
      reason: body.reason || null,
      created_at: nowSec()
    })
    saveStore()
    return ok({ success: true, message: 'Track banned' })
  }

  const unbanMatch = path.match(/^\/api\/admin\/banned-tracks\/([^/]+)$/)
  if (method === 'delete' && unbanMatch) {
    const before = state.bannedTracks.length
    state.bannedTracks = state.bannedTracks.filter(t => t.track_id !== unbanMatch[1])
    if (state.bannedTracks.length === before) return err('Banned track not found', 404)
    saveStore()
    return ok({ success: true, message: 'Track unbanned' })
  }

  if (method === 'get' && path === '/api/admin/client-url') {
    const base = state.config.queue_url || (typeof window !== 'undefined' ? window.location.origin + import.meta.env.BASE_URL.replace(/\/$/, '') : '')
    return ok({ url: base || '/' })
  }

  if (method === 'get' && path === '/api/admin/stats') {
    const fps = Object.values(state.fingerprints)
    const now = nowSec()
    return ok({
      devices: {
        total: fps.length,
        active: fps.filter(f => f.status === 'active').length,
        blocked: fps.filter(f => f.status === 'blocked').length,
        cooling_down: fps.filter(f => f.cooldown_expires && f.cooldown_expires > now).length
      },
      queue_attempts: {
        total: state.queueAttempts.length,
        successful: state.queueAttempts.filter(a => a.status === 'success').length
      }
    })
  }

  if (method === 'post' && path === '/api/admin/reset-all-data') {
    const config = { ...state.config }
    resetStore()
    const fresh = loadStore()
    fresh.config = config
    saveStore()
    return ok({
      success: true,
      message: 'All data has been reset. Devices, stats, and banned tracks have been cleared.'
    })
  }

  // --- Spotify auth (demo) ---
  if (method === 'get' && path === '/api/auth/status') {
    return ok({ connected: state.spotifyConnected, user: state.spotifyConnected ? { display_name: 'Demo Spotify' } : null })
  }

  if (method === 'get' && path === '/api/auth/authorize') {
    state.spotifyConnected = true
    saveStore()
    return ok({ url: '#' })
  }

  if (method === 'post' && path === '/api/auth/disconnect') {
    state.spotifyConnected = false
    saveStore()
    return ok({ success: true })
  }

  // OAuth stubs
  if (method === 'get' && (path === '/api/github/login' || path === '/api/google/login')) {
    return err('OAuth is disabled in demo mode', 503)
  }

  return err(`Demo mock: no handler for ${method.toUpperCase()} ${path}`, 404)
}
