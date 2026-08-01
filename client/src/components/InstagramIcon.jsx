/**
 * Instagram glyph in the brand gradient.
 *
 * lucide's Instagram icon is a single-colour stroke, so the mark is drawn here
 * instead and painted with a radial gradient anchored at the bottom-left -
 * yellow through orange and pink into purple, the way the real logo runs.
 *
 * The gradient id is namespaced because an id collision with anything else on
 * the page would silently repaint this in the wrong colours.
 */
export function InstagramIcon({ className = '' }) {
  const gradientId = 'spotiqueue-instagram-gradient'

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <radialGradient id={gradientId} cx="30%" cy="107%" r="150%">
          <stop offset="0%" stopColor="#FDF497" />
          <stop offset="8%" stopColor="#FDD53F" />
          <stop offset="30%" stopColor="#FD8D32" />
          <stop offset="50%" stopColor="#F74E52" />
          <stop offset="70%" stopColor="#D62E85" />
          <stop offset="100%" stopColor="#8134AF" />
        </radialGradient>
      </defs>

      {/* Rounded square body */}
      <rect
        x="2.25"
        y="2.25"
        width="19.5"
        height="19.5"
        rx="5.75"
        stroke={`url(#${gradientId})`}
        strokeWidth="2.1"
      />
      {/* Lens */}
      <circle cx="12" cy="12" r="4.6" stroke={`url(#${gradientId})`} strokeWidth="2.1" />
      {/* Flash */}
      <circle cx="17.6" cy="6.4" r="1.35" fill={`url(#${gradientId})`} />
    </svg>
  )
}

export default InstagramIcon
