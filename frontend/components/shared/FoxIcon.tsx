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
      viewBox="192 24 296 296"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
      role="img"
      aria-label="Fennec fox"
    >
      {/* Outline layer (silhouette only) */}
      <g fill="#2B1B12" stroke="#2B1B12" strokeWidth="5" strokeLinejoin="round">
        <path d="M248 186 L242 166 L248 164 L243 148 L249 146 L246 128 L251 126 Q248 96 254 46 Q261 30 273 40 Q304 88 324 150 Z"/>
        <path d="M432 186 L438 166 L432 164 L437 148 L431 146 L434 128 L429 126 Q432 96 426 46 Q419 30 407 40 Q376 88 356 150 Z"/>
        <path d="M340 143 Q424 144 437 190 L447 198 L440 204 L451 212 L442 218 L453 228 L443 234 L452 246 L440 250 L446 262 L432 262 L436 272 L420 270 L398 278 Q372 296 340 312 Q308 296 282 278 L260 270 L244 272 L248 262 L234 262 L240 250 L228 246 L237 234 L227 228 L238 218 L229 212 L240 204 L233 198 L243 190 Q256 144 340 143 Z"/>
        <path d="M322 147 L328 136 L333 143 L340 130 L347 143 L352 136 L358 147 Z"/>
      </g>
      {/* Ears */}
      <path d="M248 186 L242 166 L248 164 L243 148 L249 146 L246 128 L251 126 Q248 96 254 46 Q261 30 273 40 Q304 88 324 150 Z" fill="#E8691F"/>
      <path d="M432 186 L438 166 L432 164 L437 148 L431 146 L434 128 L429 126 Q432 96 426 46 Q419 30 407 40 Q376 88 356 150 Z" fill="#E8691F"/>
      <path d="M265 166 Q262 108 266 70 Q271 60 278 68 Q296 104 308 150 Z" fill="#A8643A" stroke="#2B1B12" strokeWidth="2.5" strokeLinejoin="round"/>
      <path d="M415 166 Q418 108 414 70 Q409 60 402 68 Q384 104 372 150 Z" fill="#A8643A" stroke="#2B1B12" strokeWidth="2.5" strokeLinejoin="round"/>
      {/* Head */}
      <path d="M340 143 Q424 144 437 190 L447 198 L440 204 L451 212 L442 218 L453 228 L443 234 L452 246 L440 250 L446 262 L432 262 L436 272 L420 270 L398 278 Q372 296 340 312 Q308 296 282 278 L260 270 L244 272 L248 262 L234 262 L240 250 L228 246 L237 234 L227 228 L238 218 L229 212 L240 204 L233 198 L243 190 Q256 144 340 143 Z" fill="#F07A2A"/>
      {/* Ear fluff */}
      <path d="M265 160 L268 138 L275 154 L281 128 L286 150 L292 126 L297 147 L303 132 L309 145 L296 148 L284 151 L274 155 Z" fill="#FFF3E0"/>
      <path d="M415 160 L412 138 L405 154 L399 128 L394 150 L388 126 L383 147 L377 132 L371 145 L384 148 L396 151 L406 155 Z" fill="#FFF3E0"/>
      {/* Forehead tuft */}
      <path d="M322 147 L328 136 L333 143 L340 130 L347 143 L352 136 L358 147 Z" fill="#F07A2A"/>
      {/* Muzzle / cheeks */}
      <path d="M246 214 Q282 246 322 222 Q340 214 358 222 Q398 246 434 214 Q430 256 394 280 Q368 298 356 304 L350 301 L346 308 L340 302 L334 308 L330 301 L324 304 Q312 298 286 280 Q250 256 246 214 Z" fill="#FFF3E0"/>
      {/* Eyes */}
      <ellipse cx="306" cy="192" rx="21" ry="26" fill="#FFFFFF" stroke="#2B1B12" strokeWidth="2.5"/>
      <ellipse cx="374" cy="192" rx="21" ry="26" fill="#FFFFFF" stroke="#2B1B12" strokeWidth="2.5"/>
      <circle cx="308" cy="198" r="14" fill="#2B1B12"/>
      <circle cx="372" cy="198" r="14" fill="#2B1B12"/>
      <circle cx="309" cy="195" r="6" fill="#FFFFFF"/>
      <circle cx="371" cy="195" r="6" fill="#FFFFFF"/>
      {/* Blush */}
      <ellipse cx="276" cy="242" rx="11" ry="6" fill="#F4A08F" opacity="0.7"/>
      <ellipse cx="404" cy="242" rx="11" ry="6" fill="#F4A08F" opacity="0.7"/>
      {/* Nose and mouth */}
      <path d="M327 256 Q340 250 353 256 Q349 269 340 271 Q331 269 327 256 Z" fill="#2B1B12"/>
      <path d="M340 271 Q340 282 329 284" fill="none" stroke="#2B1B12" strokeWidth="2.5" strokeLinecap="round"/>
      <path d="M340 271 Q340 282 351 284" fill="none" stroke="#2B1B12" strokeWidth="2.5" strokeLinecap="round"/>
      {/* Glasses (browline) */}
      <g fill="none" stroke="#2B1B12" strokeLinecap="round" strokeLinejoin="round">
        <rect x="275" y="167" width="61" height="54" rx="8" fill="#FFFFFF" fillOpacity="0.12" strokeWidth="2.5"/>
        <rect x="344" y="167" width="61" height="54" rx="8" fill="#FFFFFF" fillOpacity="0.12" strokeWidth="2.5"/>
        <path d="M273 172 Q274 165 283 165 L330 165 Q338 165 338 172" strokeWidth="9"/>
        <path d="M342 172 Q342 165 350 165 L397 165 Q406 165 407 172" strokeWidth="9"/>
        <path d="M338 170 Q340 166 342 170" strokeWidth="5"/>
        <path d="M274 172 L244 176" strokeWidth="4.5"/>
        <path d="M406 172 L436 176" strokeWidth="4.5"/>
      </g>
      <path d="M284 188 L296 176" fill="none" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" opacity="0.8"/>
      <path d="M353 188 L365 176" fill="none" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" opacity="0.8"/>
    </svg>
  )
}
