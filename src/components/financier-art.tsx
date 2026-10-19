/**
 * Hand-drawn SVG of a few financiers on a cooling rack. Decorative only, so
 * it is hidden from assistive tech; it also stands in for photos until the
 * site has real ones.
 */
export function FinancierArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 320 200" className={className} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="fin-top" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e9b25c" />
          <stop offset="1" stopColor="#c47a2c" />
        </linearGradient>
        <linearGradient id="fin-side" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#a65a1d" />
          <stop offset="1" stopColor="#7a3f12" />
        </linearGradient>
      </defs>
      {/* cooling rack */}
      <g stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" fill="none">
        <rect x="18" y="128" width="284" height="44" rx="6" />
        {[48, 84, 120, 156, 192, 228, 264].map((x) => (
          <line key={x} x1={x} y1="128" x2={x} y2="172" />
        ))}
      </g>
      {[
        { x: 40, y: 92, r: -6 },
        { x: 128, y: 80, r: 3 },
        { x: 214, y: 94, r: 8 },
      ].map(({ x, y, r }) => (
        <g key={x} transform={`rotate(${r} ${x + 34} ${y + 22})`}>
          {/* side wall */}
          <path d={`M${x} ${y + 18} h68 l-4 24 h-60 z`} fill="url(#fin-side)" />
          {/* domed top */}
          <path
            d={`M${x} ${y + 18} q4 -18 34 -18 q30 0 34 18 z`}
            fill="url(#fin-top)"
            stroke="#8c4b17"
            strokeOpacity="0.35"
          />
          {/* crack along the dome */}
          <path
            d={`M${x + 14} ${y + 10} q20 -6 40 0`}
            stroke="#fff3df"
            strokeOpacity="0.55"
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
          />
        </g>
      ))}
      {/* sliced almonds */}
      {[
        [92, 60, 20],
        [182, 52, -30],
        [270, 70, 40],
      ].map(([x, y, r]) => (
        <ellipse key={x} cx={x} cy={y} rx="7" ry="3.5" fill="#f3dcb2" transform={`rotate(${r} ${x} ${y})`} />
      ))}
    </svg>
  );
}
