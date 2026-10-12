interface FoxIconProps {
  size?: number
  className?: string
  style?: React.CSSProperties
}

export function FoxIcon({ size = 40, className, style }: FoxIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
    >
      {/* Left ear outer */}
      <polygon points="18,52 32,8 50,44" fill="#F97316" />
      {/* Left ear dark tip */}
      <polygon points="22,46 32,14 42,42" fill="#1C1917" />
      {/* Left ear inner */}
      <polygon points="27,44 32,22 38,41" fill="#FB923C" />

      {/* Right ear outer */}
      <polygon points="82,52 68,8 50,44" fill="#F97316" />
      {/* Right ear dark tip */}
      <polygon points="78,46 68,14 58,42" fill="#1C1917" />
      {/* Right ear inner */}
      <polygon points="73,44 68,22 62,41" fill="#FB923C" />

      {/* Head */}
      <ellipse cx="50" cy="62" rx="36" ry="33" fill="#F97316" />

      {/* Muzzle */}
      <ellipse cx="50" cy="74" rx="21" ry="17" fill="#FEF3C7" />

      {/* Left eye white */}
      <ellipse cx="37" cy="56" rx="7" ry="7.5" fill="white" />
      {/* Right eye white */}
      <ellipse cx="63" cy="56" rx="7" ry="7.5" fill="white" />

      {/* Left eye pupil */}
      <ellipse cx="38" cy="57" rx="4.5" ry="5" fill="#1C1917" />
      {/* Right eye pupil */}
      <ellipse cx="64" cy="57" rx="4.5" ry="5" fill="#1C1917" />

      {/* Eye shine left */}
      <circle cx="40" cy="55" r="1.5" fill="white" />
      {/* Eye shine right */}
      <circle cx="66" cy="55" r="1.5" fill="white" />

      {/* Nose */}
      <ellipse cx="50" cy="69" rx="4" ry="3" fill="#1C1917" />

      {/* Mouth */}
      <path d="M 44 73 Q 50 78 56 73" stroke="#9CA3AF" strokeWidth="1.5" fill="none" strokeLinecap="round" />

      {/* Cheek blush left */}
      <ellipse cx="32" cy="67" rx="6" ry="4" fill="#FCA5A5" opacity="0.4" />
      {/* Cheek blush right */}
      <ellipse cx="68" cy="67" rx="6" ry="4" fill="#FCA5A5" opacity="0.4" />
    </svg>
  )
}
