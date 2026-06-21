import { createInitialState } from './fixtures.js'
import { sanitizeConfigForDemo } from './sanitize.js'

const STORAGE_KEY = 'spotiqueue.demo.v1'
const FINGERPRINT_KEY = 'spotiqueue.demo.fingerprint_id'

let cache = null

function getBaseUrl() {
  if (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) {
    return import.meta.env.BASE_URL
  }
  return '/'
}

export function loadStore() {
  if (cache) return cache
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      cache = JSON.parse(raw)
      if (cache.config) {
        cache.config = sanitizeConfigForDemo(cache.config)
        saveStore()
      }
      return cache
    }
  } catch {
    // ignore corrupt storage
  }
  cache = createInitialState(getBaseUrl())
  saveStore()
  return cache
}

export function saveStore() {
  if (!cache) return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cache))
}

export function resetStore() {
  cache = createInitialState(getBaseUrl())
  saveStore()
  return cache
}

export function getFingerprintId() {
  let id = localStorage.getItem(FINGERPRINT_KEY)
  if (!id) {
    id = crypto.randomUUID().replace(/-/g, '')
    localStorage.setItem(FINGERPRINT_KEY, id)
  }
  return id
}

export function ensureFingerprint(state, fingerprintId, username = null) {
  if (!state.fingerprints[fingerprintId]) {
    const now = Math.floor(Date.now() / 1000)
    state.fingerprints[fingerprintId] = {
      id: fingerprintId,
      first_seen: now,
      last_queue_attempt: null,
      cooldown_expires: null,
      status: 'active',
      username: username || 'Demo User',
      created_at: now
    }
  } else if (username && !state.fingerprints[fingerprintId].username) {
    state.fingerprints[fingerprintId].username = username
  }
  state.currentFingerprintId = fingerprintId
  return state.fingerprints[fingerprintId]
}

export function getPublicConfig(state) {
  const c = state.config
  return {
    prequeue_enabled: c.prequeue_enabled === 'true',
    search_ui_enabled: c.search_ui_enabled !== 'false',
    url_input_enabled: c.url_input_enabled !== 'false',
    voting_enabled: c.voting_enabled === 'true',
    voting_auto_promote: c.voting_auto_promote === 'true',
    voting_downvote_enabled: c.voting_downvote_enabled !== 'false',
    aura_enabled: c.aura_enabled === 'true',
    admin_panel_url: c.admin_panel_url || '',
    rate_limit_redirect_to_admin: c.rate_limit_redirect_to_admin === 'true',
    rate_limit_custom_message_enabled: c.rate_limit_custom_message_enabled === 'true',
    rate_limit_custom_message: c.rate_limit_custom_message || '',
    queue_url: c.queue_url || '',
    queue_grace_period_enabled: c.queue_grace_period_enabled !== 'false',
    queue_grace_period_seconds: parseInt(c.queue_grace_period_seconds || '5', 10)
  }
}

export function isGraceEnabled(state) {
  if (state.config.queue_grace_period_enabled === 'false') return false
  return parseInt(state.config.queue_grace_period_seconds || '5', 10) > 0
}

export function getGraceSeconds(state) {
  return Math.max(0, parseInt(state.config.queue_grace_period_seconds || '5', 10))
}
