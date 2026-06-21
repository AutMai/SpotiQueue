export const DEMO_TRACKS = [
  {
    id: '4uLU6hMCjMI75M1A2tKUQC',
    name: 'Never Gonna Give You Up',
    artists: 'Rick Astley',
    album: 'Whenever You Need Somebody',
    album_art: 'https://i.scdn.co/image/ab67616d0000b273b46f74097655d798e5e43278',
    duration_ms: 213573,
    explicit: false,
    uri: 'spotify:track:4uLU6hMCjMI75M1A2tKUQC'
  },
  {
    id: '0VjIjX4e5lbYhySCHMfNKY',
    name: 'Blinding Lights',
    artists: 'The Weeknd',
    album: 'After Hours',
    album_art: 'https://i.scdn.co/image/ab67616d0000b2738863bc11d2aa12b54f5aeb36',
    duration_ms: 200040,
    explicit: false,
    uri: 'spotify:track:0VjIjX4e5lbYhySCHMfNKY'
  },
  {
    id: '3n3Ppam7vgaVa1iaRUc9Lp',
    name: 'Mr. Brightside',
    artists: 'The Killers',
    album: 'Hot Fuss',
    album_art: 'https://i.scdn.co/image/ab67616d0000b273c8a11e48c91a982d086afc69',
    duration_ms: 222973,
    explicit: false,
    uri: 'spotify:track:3n3Ppam7vgaVa1iaRUc9Lp'
  },
  {
    id: '6habFhsOpGDe0R3ro77Gxf',
    name: 'Don\'t Stop Me Now',
    artists: 'Queen',
    album: 'Jazz',
    album_art: 'https://i.scdn.co/image/ab67616d0000b273ce4f1737ba7b64661eb37d0e',
    duration_ms: 209229,
    explicit: false,
    uri: 'spotify:track:6habFhsOpGDe0R3ro77Gxf'
  },
  {
    id: '7qiZfU4dY1lWllzX7mPBI3',
    name: 'Shape of You',
    artists: 'Ed Sheeran',
    album: '÷ (Deluxe)',
    album_art: 'https://i.scdn.co/image/ab67616d0000b273ba5db46f4b838ef602f2a602',
    duration_ms: 233712,
    explicit: false,
    uri: 'spotify:track:7qiZfU4dY1lWllzX7mPBI3'
  },
  {
    id: '60nZcImufyMA1MKQY3jlCi',
    name: 'Uptown Funk',
    artists: 'Mark Ronson, Bruno Mars',
    album: 'Uptown Special',
    album_art: 'https://i.scdn.co/image/ab67616d0000b2737b4d5e0ea5b5b5b5b5b5b5b5',
    duration_ms: 270626,
    explicit: false,
    uri: 'spotify:track:60nZcImufyMA1MKQY3jlCi'
  },
  {
    id: '1Je1IMUlBXcz1QKf9wrWay',
    name: 'Sweet Caroline',
    artists: 'Neil Diamond',
    album: 'Sweet Caroline',
    album_art: 'https://i.scdn.co/image/ab67616d0000b2735a009121ca4d73312467aeda',
    duration_ms: 201373,
    explicit: false,
    uri: 'spotify:track:1Je1IMUlBXcz1QKf9wrWay'
  },
  {
    id: '2takcwOaAZWiXQijPHIx7B',
    name: 'September',
    artists: 'Earth, Wind & Fire',
    album: 'The Best of Earth, Wind & Fire Vol. 1',
    album_art: 'https://i.scdn.co/image/ab67616d0000b2735743f721f9b0b7b5b5b5b5b5',
    duration_ms: 215093,
    explicit: false,
    uri: 'spotify:track:2takcwOaAZWiXQijPHIx7B'
  },
  {
    id: '32OlwWuMpZ6b0aNtt3YHRf',
    name: 'Dancing Queen',
    artists: 'ABBA',
    album: 'Arrival',
    album_art: 'https://i.scdn.co/image/ab67616d0000b2733067959042c8f432d05b6b0a',
    duration_ms: 230400,
    explicit: false,
    uri: 'spotify:track:32OlwWuMpZ6b0aNtt3YHRf'
  },
  {
    id: '1rfofaqEpjlip2kH5Qj8Gr',
    name: 'I Gotta Feeling',
    artists: 'Black Eyed Peas',
    album: 'The E.N.D.',
    album_art: 'https://i.scdn.co/image/ab67616d0000b273b5b5b5b5b5b5b5b5b5b5b5b',
    duration_ms: 289133,
    explicit: false,
    uri: 'spotify:track:1rfofaqEpjlip2kH5Qj8Gr'
  }
]

export const DEMO_LYRICS = {
  lines: [
    { startTimeMs: 0, words: 'Demo mode: lyrics are simulated' },
    { startTimeMs: 5000, words: 'Queue songs and vote on tracks' },
    { startTimeMs: 12000, words: 'Try the display mode on desktop' },
    { startTimeMs: 20000, words: 'All data stays in your browser' }
  ]
}

export function createDefaultConfig(baseUrl = '/') {
  return {
    cooldown_duration: '300',
    songs_before_cooldown: '1',
    fingerprinting_enabled: 'true',
    url_input_enabled: 'true',
    search_ui_enabled: 'true',
    queueing_enabled: 'true',
    admin_panel_url: `${baseUrl}admin/`,
    rate_limit_redirect_to_admin: 'false',
    rate_limit_custom_message_enabled: 'false',
    rate_limit_custom_message: '',
    require_username: 'false',
    voting_enabled: 'true',
    voting_auto_promote: 'true',
    voting_downvote_enabled: 'true',
    require_github_auth: 'false',
    require_google_auth: 'false',
    prequeue_enabled: 'false',
    aura_enabled: 'true',
    queue_url: baseUrl.replace(/\/$/, '') || '',
    queue_grace_period_enabled: 'true',
    queue_grace_period_seconds: '5',
    ban_explicit: 'false',
    max_song_duration: '0',
    admin_password_configured: true
  }
}

export function createInitialState(baseUrl = '/') {
  const now = Math.floor(Date.now() / 1000)
  const playing = { ...DEMO_TRACKS[1], progress_ms: 45000 }
  return {
    config: createDefaultConfig(baseUrl),
    fingerprints: {},
    currentFingerprintId: null,
    queue: DEMO_TRACKS.slice(2, 5).map(t => ({ ...t, votable: t.id === DEMO_TRACKS[2].id })),
    currentlyPlaying: playing,
    playingStartedAt: Date.now() - playing.progress_ms,
    guestQueuedTrackIds: [DEMO_TRACKS[2].id],
    votes: { [DEMO_TRACKS[2].id]: 2 },
    voteRecords: [],
    prequeue: [],
    pendingQueues: {},
    bannedTracks: [],
    queueAttempts: [],
    adminAuthenticated: false,
    spotifyConnected: true,
    nextAttemptId: 1
  }
}

export function trackById(id) {
  return DEMO_TRACKS.find(t => t.id === id) || null
}

export function parseSpotifyUrl(url) {
  if (!url) return null
  const trimmed = url.trim()
  const uriMatch = trimmed.match(/spotify:track:([a-zA-Z0-9]+)/)
  if (uriMatch) return uriMatch[1]
  const webMatch = trimmed.match(/open\.spotify\.com\/track\/([a-zA-Z0-9]+)/)
  if (webMatch) return webMatch[1]
  return null
}
