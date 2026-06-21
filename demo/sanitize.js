/** Fixed admin password for the static demo (not a production secret). */
export const DEMO_ADMIN_PASSWORD = 'demo'

const SENSITIVE_CONFIG_KEYS = new Set([
  'admin_password',
  'admin_password_hash',
  'admin_totp_secret',
  'spotify_client_secret',
  'spotify_refresh_token',
  'spotify_access_token',
  'spotify_user_id',
  'github_client_secret',
  'google_client_secret',
  'session_secret',
  'SPOTIFY_CLIENT_SECRET',
  'SPOTIFY_REFRESH_TOKEN',
  'SPOTIFY_CLIENT_ID',
  'GITHUB_CLIENT_SECRET',
  'GITHUB_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_CLIENT_ID'
])

const ALLOWED_PASSWORD_KEYS = new Set(['admin_password_configured'])

function isSensitiveConfigKey(key) {
  if (ALLOWED_PASSWORD_KEYS.has(key)) return false
  if (SENSITIVE_CONFIG_KEYS.has(key)) return true
  const lower = key.toLowerCase()
  return (
    lower.includes('password') ||
    lower.includes('secret') ||
    lower.includes('token') ||
    lower.includes('api_key') ||
    lower.endsWith('_key')
  )
}

export function sanitizeConfigForDemo(config) {
  const out = {}
  for (const [key, value] of Object.entries(config || {})) {
    if (isSensitiveConfigKey(key)) continue
    out[key] = value
  }
  out.admin_password_configured = true
  return out
}

export function isSensitiveConfigKeyForWrite(key) {
  return isSensitiveConfigKey(key)
}
