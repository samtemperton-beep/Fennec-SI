interface AvatarProps {
  username?: string
  avatarColor?: string
  avatarEmoji?: string
  avatarUrl?: string
  size?: number
  fontSize?: number
}

export function Avatar({ username, avatarColor, avatarEmoji, avatarUrl, size = 36, fontSize }: AvatarProps) {
  const bg = avatarColor || '#5b6aff'
  const initials = (username || 'U')[0].toUpperCase()
  const fSize = fontSize || Math.round(size * 0.38)

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={username || 'avatar'}
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
      />
    )
  }

  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', background: bg, flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: avatarEmoji ? Math.round(size * 0.5) : fSize,
      color: 'white', fontWeight: 700, fontFamily: 'Syne, sans-serif',
      userSelect: 'none',
    }}>
      {avatarEmoji || initials}
    </div>
  )
}
