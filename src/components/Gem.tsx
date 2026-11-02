/** A faceted crystal in blues and violets, drawn in SVG, for the violet page banners. */
export default function Gem({ className }: { className?: string }) {
  const P = { L: "20,110", A: "95,30", T: "230,26", B: "365,30", R: "440,110", M1: "150,110", M2: "310,110", D: "230,300" };
  const f = (pts: string[], fill: string) => <polygon points={pts.join(" ")} fill={fill} stroke="rgba(255,255,255,0.55)" strokeWidth="1.2" strokeLinejoin="round" />;
  return (
    <svg viewBox="0 0 460 230" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="g1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#4f7bff" /><stop offset="1" stopColor="#3b2bd6" /></linearGradient>
        <linearGradient id="g2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#5b8cff" /><stop offset=".5" stopColor="#38bdf8" stopOpacity=".7" /><stop offset="1" stopColor="#6d4cf0" /></linearGradient>
        <linearGradient id="g3" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#c4a5ff" /><stop offset="1" stopColor="#7c3aed" /></linearGradient>
        <linearGradient id="g4" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#a78bfa" /><stop offset="1" stopColor="#c026d3" /></linearGradient>
        <linearGradient id="g5" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#d946ef" /><stop offset="1" stopColor="#f0abfc" /></linearGradient>
        <linearGradient id="g6" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#3b2bd6" /><stop offset="1" stopColor="#1e1b8f" /></linearGradient>
        <linearGradient id="g7" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#6d4cf0" /><stop offset="1" stopColor="#8b5cf6" /></linearGradient>
        <linearGradient id="g8" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#a855f7" /><stop offset="1" stopColor="#f5d0fe" /></linearGradient>
        <filter id="glow"><feGaussianBlur stdDeviation="14" /></filter>
      </defs>
      <ellipse cx="230" cy="120" rx="200" ry="70" fill="#a855f7" opacity=".35" filter="url(#glow)" />
      {f([P.L, P.A, P.M1], "url(#g1)")}
      {f([P.A, P.T, P.M1], "url(#g2)")}
      {f([P.T, P.M2, P.M1], "url(#g3)")}
      {f([P.T, P.B, P.M2], "url(#g4)")}
      {f([P.B, P.R, P.M2], "url(#g5)")}
      {f([P.L, P.M1, P.D], "url(#g6)")}
      {f([P.M1, P.M2, P.D], "url(#g7)")}
      {f([P.M2, P.R, P.D], "url(#g8)")}
      <polyline points={`${P.L} ${P.R}`} stroke="rgba(255,255,255,0.8)" strokeWidth="1.5" />
    </svg>
  );
}
