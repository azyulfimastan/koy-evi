/** Küçük köy evi çizimi (logo ve boş kart için) */
export function HouseLogo({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <rect x="0" y="0" width="48" height="48" rx="12" fill="#3f6b2a" />
      <path d="M10 25 L24 13 L38 25" fill="none" stroke="#f3d9a6" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="14" y="24" width="20" height="13" rx="1.5" fill="#f6efe0" />
      <rect x="21.5" y="29" width="5" height="8" rx="1" fill="#a5523a" />
      <rect x="16.5" y="27" width="3.6" height="3.6" rx=".6" fill="#8fb3c9" />
      <rect x="28" y="27" width="3.6" height="3.6" rx=".6" fill="#8fb3c9" />
      <rect x="30" y="14.5" width="3" height="6" fill="#f3d9a6" />
    </svg>
  );
}

/** Giriş ekranı / boş durum için manzara */
export function Landscape() {
  return (
    <svg className="land" viewBox="0 0 800 300" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <path d="M0 210 Q120 150 260 190 T520 175 T800 185 V300 H0Z" fill="#a8c48c" />
      <path d="M0 240 Q160 200 330 230 T650 215 T800 225 V300 H0Z" fill="#8fb36d" />
      <g transform="translate(330 150)">
        <rect x="8" y="40" width="104" height="62" fill="#f2e8d6" />
        <rect x="8" y="92" width="104" height="10" fill="#a39b8e" />
        <path d="M-6 44 L60 4 L126 44 Z" fill="#a5523a" />
        <rect x="88" y="6" width="12" height="24" fill="#b8664a" />
        <rect x="50" y="64" width="20" height="38" rx="2" fill="#7a4a2a" />
        <rect x="20" y="56" width="18" height="18" rx="2" fill="#9fc0d6" stroke="#fff" strokeWidth="3" />
        <rect x="82" y="56" width="18" height="18" rx="2" fill="#9fc0d6" stroke="#fff" strokeWidth="3" />
      </g>
      <g fill="#4f7f3a">
        <ellipse cx="270" cy="215" rx="26" ry="32" />
        <rect x="267" y="230" width="6" height="22" fill="#6b4a2b" />
        <path d="M520 250 L540 180 L560 250 Z" fill="#2f6a3a" />
        <path d="M555 255 L572 196 L589 255 Z" fill="#3b7a45" />
      </g>
    </svg>
  );
}
