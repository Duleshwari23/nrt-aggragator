type Point = { t: string; value: number; role: "impact"|"cause" };
export default function SimpleTimeline({ data }: { data: Point[] }) {
  const W = 800, H = 220, pad = {l:40,r:16,t:16,b:24};
  const impact = data.filter(d=>d.role==="impact");
  const cause  = data.filter(d=>d.role==="cause");
  const all = data;
  const ts = all.map(d=>new Date(d.t).getTime());
  const vs = all.map(d=>d.value);
  const xmin = Math.min(...ts), xmax = Math.max(...ts);
  const ymin = Math.min(...vs), ymax = Math.max(...vs);
  const x = (t:number)=> pad.l + (t - xmin) / Math.max(1, xmax - xmin) * (W - pad.l - pad.r);
  const y = (v:number)=> pad.t + (1 - (v - ymin) / Math.max(1e-6, ymax - ymin)) * (H - pad.t - pad.b);
  const path = (arr:Point[]) =>
    arr.map((d,i)=> (i===0? "M":"L") + x(new Date(d.t).getTime()) + " " + y(d.value)).join(" ");
  const ticks = 5;
  const yticks = Array.from({length:ticks}, (_,i)=> ymin + (i/(ticks-1))*(ymax-ymin));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[240px] rounded-2xl bg-surface-100">
      {/* y grid */}
      {yticks.map((v,i)=>(
        <g key={i}>
          <line x1={pad.l} x2={W-pad.r} y1={y(v)} y2={y(v)} stroke="currentColor" opacity="0.08"/>
          <text x={pad.l-8} y={y(v)} textAnchor="end" alignmentBaseline="middle" fontSize="10" opacity="0.6">
            {v.toFixed(0)}
          </text>
        </g>
      ))}
      {/* series */}
      <path d={path(cause)} fill="none" stroke="#ff6b2c" strokeWidth="1.5" opacity="0.9"/>
      <path d={path(impact)} fill="none" stroke="#1b7fff" strokeWidth="2.2"/>
      {/* legend */}
      <g transform={`translate(${W-pad.r-140},${pad.t})`}>
        <rect width="140" height="22" fill="currentColor" opacity="0.06" rx="6"/>
        <circle cx="10" cy="11" r="3" fill="#1b7fff"/><text x="18" y="14" fontSize="11">Impact</text>
        <circle cx="76" cy="11" r="3" fill="#ff6b2c"/><text x="84" y="14" fontSize="11">Cause</text>
      </g>
    </svg>
  );
}
