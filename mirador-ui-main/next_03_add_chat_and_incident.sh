#!/usr/bin/env bash
set -euo pipefail

echo ">> Ensuring deps"
pnpm i uuid @types/uuid -D >/dev/null 2>&1 || true

echo ">> Adding API client helper (mira chat stream + rca investigate)"
mkdir -p src/lib
cat > src/lib/api.ts <<'EOF'
export type TimeRange = { from: string; to: string };

export type ChatRequest = {
  question: string;
  context?: Record<string, unknown>;
  session_id?: string;
  attachments?: { type: "metric" | "log" | "trace"; ref: string }[];
  preferences?: { temperature?: number; max_tokens?: number };
};
export type ChatChunk = { type: "token" | "meta" | "done" | "error"; data: string };

export function miraChatStream(req: ChatRequest, onChunk: (c: ChatChunk)=>void) {
  const ctrl = new AbortController();
  const url = "/api/v1/mira/chat?stream=1";
  fetch(url, {
    method: "POST",
    body: JSON.stringify(req),
    headers: { "Content-Type": "application/json" },
    signal: ctrl.signal,
  }).then(async (res) => {
    const reader = res.body?.getReader();
    const dec = new TextDecoder();
    let buf = "";
    while (reader) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      // parse very simply event-stream frames
      const frames = buf.split("\n\n");
      // keep the last partial buffer (if any)
      buf = frames.pop() || "";
      for (const f of frames) {
        const t = (f.match(/event:\s*(\w+)/)?.[1] ?? "token") as ChatChunk["type"];
        const d = f.match(/data:\s*([\s\S]*)$/m)?.[1] ?? "";
        onChunk({ type: t, data: d });
      }
    }
  }).catch((e) => onChunk({ type: "error", data: String(e) }));
  return () => ctrl.abort();
}

export type RcTimelinePoint = { t: string; value: number; role: "impact"|"cause" };
export type RcResponse = {
  timeline: RcTimelinePoint[];
  root_cause?: { signal: string; confidence: number };
  explanation: string;
  meta: { model: string; generated_at: string };
};

export async function rcaInvestigate(body: { window: TimeRange; include?: string[] }): Promise<RcResponse> {
  const res = await fetch("/api/v1/rca/investigate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`RCA ${res.status}`);
  return res.json();
}
EOF

echo ">> Extending mock API with /api/v1/rca/investigate"
if [ -f mock/server.js ]; then
  if ! grep -q "/api/v1/rca/investigate" mock/server.js; then
    cat >> mock/server.js <<'EOF'

// RCA investigate mock
app.post('/api/v1/rca/investigate', (req, res) => {
  const now = Date.now();
  const mk = (i, role) => ({
    t: new Date(now - (60 - i) * 60_000).toISOString(),
    value: role === 'impact' ? 100 + Math.sin(i/6)*10 + (i>40?15:0) : 50 + Math.cos(i/5)*8 + (i>38?12:0),
    role
  });
  const timeline = Array.from({length:60}, (_,i)=>[mk(i,'impact'), mk(i,'cause')]).flat();
  res.json({
    timeline,
    root_cause: { signal: "db.pool.exhaustion", confidence: 0.78 },
    explanation: "Conversion dipped after 08:56. Earliest degrading signal: DB pool exhaustion → Payment API errors.",
    meta: { model: "local-llm@q4", generated_at: new Date().toISOString() }
  });
});
EOF
    echo ">> mock/server.js patched."
  else
    echo ">> mock/server.js already has /api/v1/rca/investigate"
  fi
else
  echo "!! mock/server.js not found. Run next_02_add_mock_api.sh first."
  exit 1
fi

echo ">> Adding a tiny dual-series SVG timeline component (no D3)"
mkdir -p src/components/SimpleTimeline
cat > src/components/SimpleTimeline/index.tsx <<'EOF'
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
EOF

echo ">> Adding Chat page"
mkdir -p src/pages/Chat
cat > src/pages/Chat/index.tsx <<'EOF'
import { useEffect, useRef, useState } from "react";
import { miraChatStream } from "../../lib/api";

export default function Chat() {
  const [q, setQ] = useState("Why is conversion down in the last hour?");
  const [ans, setAns] = useState("");
  const [meta, setMeta] = useState<string>("");
  const cancelRef = useRef<null | (()=>void)>(null);

  function ask() {
    setAns(""); setMeta("");
    cancelRef.current?.();
    cancelRef.current = miraChatStream({ question: q, context: { env: "prod" } }, (chunk) => {
      if (chunk.type === "token") setAns((p)=>p + chunk.data);
      if (chunk.type === "meta") setMeta(chunk.data);
      if (chunk.type === "error") setAns((p)=>p + "\n[error] " + chunk.data);
    });
  }
  useEffect(()=>()=>cancelRef.current?.(),[]);

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-semibold">Ask MIRA</h1>
      <div className="flex gap-2">
        <input value={q} onChange={e=>setQ(e.target.value)} className="flex-1 px-3 py-2 rounded-xl bg-surface-100" />
        <button onClick={ask} className="px-4 py-2 rounded-xl bg-impact-primary text-white">Ask</button>
      </div>
      <pre className="whitespace-pre-wrap rounded-2xl p-4 bg-surface-100 min-h-[160px]">{ans || "…"}</pre>
      {meta && <pre className="text-xs opacity-70">{meta}</pre>}
    </div>
  );
}
EOF

echo ">> Adding Incident page"
mkdir -p src/pages/Incident
cat > src/pages/Incident/index.tsx <<'EOF'
import { useEffect, useState } from "react";
import SimpleTimeline from "../../components/SimpleTimeline";
import { rcaInvestigate, type RcResponse } from "../../lib/api";

export default function Incident() {
  const [rca, setRca] = useState<RcResponse | null>(null);
  const [err, setErr] = useState<string>("");

  useEffect(() => {
    const now = new Date();
    const from = new Date(now.getTime() - 60*60*1000);
    rcaInvestigate({ window: { from: from.toISOString(), to: now.toISOString() }, include: ["timeline","root_cause","explanation"] })
      .then(setRca)
      .catch(e=>setErr(String(e)));
  }, []);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Incident</h1>
      </div>
      {err && <div className="text-red-400 text-sm">{err}</div>}
      {rca ? (
        <>
          <div className="rounded-2xl p-4 bg-surface-100">
            <SimpleTimeline data={rca.timeline} />
          </div>
          <div className="rounded-2xl p-4 bg-surface-100 space-y-2">
            <div className="text-sm leading-relaxed">{rca.explanation}</div>
            {rca.root_cause && (
              <div className="text-xs opacity-70">
                Root cause: <b>{rca.root_cause.signal}</b> · Confidence: {(rca.root_cause.confidence*100).toFixed(0)}% · Model: {rca.meta.model}
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="opacity-70">Loading…</div>
      )}
    </div>
  );
}
EOF

echo ">> Updating App.tsx to add routes for Chat and Incident"
cat > src/App.tsx <<'EOF'
import { useEffect, useMemo, useState } from "react";
import Home from "./pages/Home";
import KpiBuilder from "./pages/KpiBuilder";
import Chat from "./pages/Chat";
import Incident from "./pages/Incident";

function useHashRoute() {
  const [hash, setHash] = useState<string>(() => location.hash || "#/");
  useEffect(() => {
    const fn = () => setHash(location.hash || "#/");
    window.addEventListener("hashchange", fn);
    return () => window.removeEventListener("hashchange", fn);
  }, []);
  return hash.replace(/^#/, "") || "/";
}

export default function App() {
  const route = useHashRoute();
  const page = useMemo(() => {
    if (route.startsWith("/kpi-builder")) return <KpiBuilder />;
    if (route.startsWith("/chat")) return <Chat />;
    if (route.startsWith("/incident")) return <Incident />;
    return <Home />;
  }, [route]);

  return (
    <div className="max-w-6xl mx-auto">
      <header className="px-6 py-4 flex items-center justify-between">
        <a href="#/" className="font-semibold">MiradorStack UI</a>
        <nav className="flex gap-4 text-sm">
          <a href="#/">Home</a>
          <a href="#/kpi-builder">KPI Builder</a>
          <a href="#/chat">Chat</a>
          <a href="#/incident">Incident</a>
        </nav>
      </header>
      {page}
    </div>
  );
}
EOF

echo
echo ">> Step C complete."
echo "Start everything with:"
echo "  pnpm dev:all"
echo "Open:"
echo "  - http://localhost:5173/#/chat      (MIRA SSE demo)"
echo "  - http://localhost:5173/#/incident  (RCA timeline demo)"