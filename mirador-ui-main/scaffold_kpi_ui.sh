#!/usr/bin/env bash
set -euo pipefail

# Script is running from within the mirador-ui project directory
echo ">> Setting up mirador-ui project in current directory"

# --- 1) deps ---
echo ">> Installing deps"
pnpm i axios zod valtio use-debounce uuid
pnpm i -D tailwindcss postcss autoprefixer typescript @types/node @types/react @types/react-dom

# --- 2) tailwind setup ---
echo ">> Setting up Tailwind config"

# tailwind config (overwrite with tokens)
cat > tailwind.config.js <<'EOF'
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html","./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        impact: { primary: "#1b7fff" },
        cause: { primary: "#ff6b2c" },
        anomaly: "#ff3b3b",
        surface: { 100: "#0b0f14", 200: "#11161d" }
      }
    }
  },
  plugins: []
}
EOF

# index.css directives
mkdir -p src
cat > src/index.css <<'EOF'
@tailwind base;
@tailwind components;
@tailwind utilities;

:root { color-scheme: dark; }
body { @apply bg-surface-200 text-white; }
a { @apply text-impact-primary; }
EOF

# --- 3) types & schema ---
mkdir -p src/lib
cat > src/lib/kpi-types.ts <<'EOF'
export type KpiKind = "business" | "tech";

export type KpiQuery =
  | {
      type: "metric";
      ref: string;
      aggregator?: "avg" | "sum" | "p95" | "p99";
      range: { from: string; to: string };
    }
  | {
      type: "formula";
      expr: string; // e.g., "orders / sessions * 100"
      inputs: Record<string, KpiQuery>;
    };

export type KpiThreshold = {
  when: ">" | ">=" | "<" | "<=" | "between" | "outside";
  value: number | [number, number];
  status: "ok" | "warn" | "crit";
};

export type KpiDef = {
  id: string;
  kind: KpiKind;
  name: string;
  unit?: string;
  format?: "number" | "pct" | "currency" | "duration";
  query: KpiQuery;
  thresholds?: KpiThreshold[];
  tags?: string[];
  sparkline?: { windowMins: number };
  ownerUserId?: string;
  visibility?: "private" | "team" | "org";
  layout?: { w: number; h: number; x?: number; y?: number };
};
EOF

cat > src/lib/kpi-schema.ts <<'EOF'
import { z } from "zod";

const zRange = z.object({ from: z.string(), to: z.string() });

const zMetric = z.object({
  type: z.literal("metric"),
  ref: z.string().min(1),
  aggregator: z.enum(["avg", "sum", "p95", "p99"]).optional(),
  range: zRange,
});

const zFormula: z.ZodType<any> = z.lazy(() =>
  z.object({
    type: z.literal("formula"),
    expr: z.string().regex(/^[0-9a-zA-Z_\s\.\+\-\*\/\(\)]+$/),
    inputs: z.record(z.union([zMetric, zFormula])),
  })
);

const zThreshold = z.object({
  when: z.enum([">", ">=", "<", "<=", "between", "outside"]),
  value: z.union([z.number(), z.tuple([z.number(), z.number()])]),
  status: z.enum(["ok", "warn", "crit"]),
});

export const zKpiDef = z.object({
  id: z.string().min(1),
  kind: z.enum(["business", "tech"]),
  name: z.string().min(1),
  unit: z.string().optional(),
  format: z.enum(["number", "pct", "currency", "duration"]).optional(),
  query: z.union([zMetric, zFormula]),
  thresholds: z.array(zThreshold).optional(),
  tags: z.array(z.string()).optional(),
  sparkline: z.object({ windowMins: z.number().int().positive() }).optional(),
  ownerUserId: z.string().optional(),
  visibility: z.enum(["private", "team", "org"]).optional(),
  layout: z
    .object({
      w: z.number().int().positive(),
      h: z.number().int().positive(),
      x: z.number().int().optional(),
      y: z.number().int().optional(),
    })
    .optional(),
});

export type ZKpiDef = z.infer<typeof zKpiDef>;
EOF

cat > src/lib/kpi-threshold.ts <<'EOF'
import type { KpiDef } from "./kpi-types";

export function statusForValue(def: KpiDef, v: number): "ok" | "warn" | "crit" {
  if (!def.thresholds?.length) return "ok";
  let s: "ok" | "warn" | "crit" = "ok";
  for (const t of def.thresholds) {
    const hit =
      (t.when === ">" && v > (t.value as number)) ||
      (t.when === ">=" && v >= (t.value as number)) ||
      (t.when === "<" && v < (t.value as number)) ||
      (t.when === "<=" && v <= (t.value as number)) ||
      (t.when === "between" &&
        v >= (t.value as [number, number])[0] &&
        v <= (t.value as [number, number])[1]) ||
      (t.when === "outside" &&
        (v < (t.value as [number, number])[0] || v > (t.value as [number, number])[1]));
    if (hit) s = t.status;
  }
  return s;
}
EOF

cat > src/lib/kpi-data.ts <<'EOF'
import type { KpiDef, KpiQuery } from "./kpi-types";

// TODO: replace with mirador-core endpoints; this is a local mock
async function fetchMetric(q: Extract<KpiQuery, { type: "metric" }>) {
  const base = q.aggregator?.startsWith("p") ? 700 : 100;
  const value = q.ref.toLowerCase().includes("conversion") ? 2.1 : base + Math.random() * 50;
  const spark = Array.from({ length: 30 }, (_, i) => {
    const t = Date.now() - (30 - i) * 60_000;
    return [t, value + Math.sin(i / 3) * 5] as [number, number];
  });
  return { value, spark };
}

function evalFormula(expr: string, inputs: Record<string, number>): number {
  const safe = expr.replace(/[A-Za-z_][A-Za-z0-9_]*/g, (m) => String(inputs[m] ?? 0));
  // eslint-disable-next-line no-new-func
  return Function(`"use strict"; return (${safe});`)();
}

export async function resolveKpi(def: KpiDef): Promise<{ value: number; spark?: [number, number][] }> {
  async function solve(q: KpiQuery): Promise<{ value: number; spark?: [number, number][] }> {
    if (q.type === "metric") return fetchMetric(q);
    const values: Record<string, number> = {};
    for (const key of Object.keys(q.inputs)) {
      values[key] = (await solve(q.inputs[key])).value;
    }
    return { value: evalFormula(q.expr, values) };
  }
  return solve(def.query);
}
EOF

# --- 4) state ---
mkdir -p src/state
cat > src/state/kpi-store.ts <<'EOF'
import { proxy, useSnapshot } from "valtio";
import { zKpiDef } from "../lib/kpi-schema";
import type { KpiDef } from "../lib/kpi-types";

const LS_KEY = "mirador.kpi.defs";

function load(): KpiDef[] {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "[]"); } catch { return []; }
}

export const kpiState = proxy<{ defs: KpiDef[] }>({ defs: load() });

export function useKpiDefs() {
  return useSnapshot(kpiState).defs;
}

export function addOrUpdateKpi(def: KpiDef) {
  const parsed = zKpiDef.parse(def);
  const i = kpiState.defs.findIndex((d) => d.id === parsed.id);
  if (i >= 0) kpiState.defs[i] = parsed; else kpiState.defs.push(parsed);
  localStorage.setItem(LS_KEY, JSON.stringify(kpiState.defs));
}

export function removeKpi(id: string) {
  kpiState.defs = kpiState.defs.filter((d) => d.id !== id);
  localStorage.setItem(LS_KEY, JSON.stringify(kpiState.defs));
}
EOF

# --- 5) components ---
mkdir -p src/components/KpiCard src/components/KpiGrid
cat > src/components/KpiCard/index.tsx <<'EOF'
import { useEffect, useState } from "react";
import type { KpiDef } from "../../lib/kpi-types";
import { resolveKpi } from "../../lib/kpi-data";
import { statusForValue } from "../../lib/kpi-threshold";

function fmt(v: number, fmt?: string, unit?: string) {
  if (fmt === "pct") return `${v.toFixed(2)}%`;
  if (fmt === "currency") return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(v);
  if (fmt === "duration") return `${Math.round(v)} ms`;
  return new Intl.NumberFormat("en-IN").format(v) + (unit ? ` ${unit}` : "");
}

export function KpiCard({ def }: { def: KpiDef }) {
  const [value, setValue] = useState<number | null>(null);
  const [status, setStatus] = useState<"ok" | "warn" | "crit">("ok");

  useEffect(() => {
    let alive = true;
    resolveKpi(def).then((res) => {
      if (!alive) return;
      setValue(res.value);
      setStatus(statusForValue(def, res.value));
    });
    return () => { alive = false; };
  }, [JSON.stringify(def)]);

  const color = status === "crit" ? "text-red-500" : status === "warn" ? "text-yellow-400" : "text-green-400";

  return (
    <div className="rounded-2xl p-4 bg-surface-100 shadow space-y-2">
      <div className="text-xs uppercase opacity-70">{def.kind}</div>
      <div className="text-sm">{def.name}</div>
      <div className={`text-2xl font-semibold ${color}`}>{value === null ? "…" : fmt(value, def.format, def.unit)}</div>
      {def.tags?.length ? <div className="text-[10px] opacity-60">{def.tags.join(" · ")}</div> : null}
    </div>
  );
}
EOF

cat > src/components/KpiGrid/index.tsx <<'EOF'
import type { KpiDef } from "../../lib/kpi-types";
import { KpiCard } from "../KpiCard";

export function KpiGrid({ defs }: { defs: KpiDef[] }) {
  return (
    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
      {defs.map((d) => (<KpiCard key={d.id} def={d} />))}
    </div>
  );
}
EOF

# --- 6) pages ---
mkdir -p src/pages/Home src/pages/KpiBuilder
cat > src/pages/Home/index.tsx <<'EOF'
import { useKpiDefs } from "../../state/kpi-store";
import { KpiGrid } from "../../components/KpiGrid";

export default function Home() {
  const defs = useKpiDefs();
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Your KPIs</h1>
        <a href="#/kpi-builder" className="px-3 py-1 rounded-xl bg-surface-100">+ New KPI</a>
      </div>
      {defs.length ? <KpiGrid defs={defs} /> : <div className="opacity-70">No KPIs yet — create one.</div>}
    </div>
  );
}
EOF

cat > src/pages/KpiBuilder/index.tsx <<'EOF'
import { useState } from "react";
import { v4 as uuid } from "uuid";
import type { KpiDef } from "../../lib/kpi-types";
import { addOrUpdateKpi } from "../../state/kpi-store";

const emptyMetric = { type: "metric" as const, ref: "", aggregator: "avg" as const, range: { from: "-60m", to: "now" } };

export default function KpiBuilder() {
  const [kpi, setKpi] = useState<KpiDef>({
    id: uuid(),
    kind: "business",
    name: "",
    format: "number",
    query: emptyMetric,
    thresholds: [],
    tags: [],
    visibility: "private",
  });

  function save() {
    addOrUpdateKpi(kpi);
    alert("KPI saved");
    location.hash = "#/"; // go home
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">KPI Builder</h1>
        <a href="#/" className="px-3 py-1 rounded-xl bg-surface-100">Back</a>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <label className="space-y-1">
          <div className="text-xs">Name</div>
          <input className="px-3 py-2 rounded-xl bg-surface-100 w-full"
            value={kpi.name} onChange={(e)=>setKpi({...kpi, name: e.target.value})} />
        </label>

        <label className="space-y-1">
          <div className="text-xs">Kind</div>
          <select className="px-3 py-2 rounded-xl bg-surface-100 w-full"
            value={kpi.kind} onChange={(e)=>setKpi({...kpi, kind: e.target.value as any})}>
            <option value="business">Business</option>
            <option value="tech">Tech</option>
          </select>
        </label>

        <label className="space-y-1">
          <div className="text-xs">Format</div>
          <select className="px-3 py-2 rounded-xl bg-surface-100 w-full"
            value={kpi.format} onChange={(e)=>setKpi({...kpi, format: e.target.value as any})}>
            <option value="number">Number</option>
            <option value="pct">Percent</option>
            <option value="currency">Currency</option>
            <option value="duration">Duration (ms)</option>
          </select>
        </label>

        <label className="space-y-1">
          <div className="text-xs">Unit</div>
          <input className="px-3 py-2 rounded-xl bg-surface-100 w-full"
            value={kpi.unit ?? ""} onChange={(e)=>setKpi({...kpi, unit: e.target.value || undefined})}/>
        </label>
      </div>

      <div className="rounded-2xl p-4 bg-surface-100 space-y-2">
        <div className="text-sm font-medium">Query</div>
        <div className="flex gap-3">
          <button className={`px-3 py-1 rounded-lg ${kpi.query.type==="metric"?"bg-impact-primary text-white":"bg-surface-200"}`}
            onClick={()=>setKpi({...kpi, query: emptyMetric})}>Metric</button>
          <button className={`px-3 py-1 rounded-lg ${kpi.query.type==="formula"?"bg-impact-primary text-white":"bg-surface-200"}`}
            onClick={()=>setKpi({
              ...kpi,
              query: {
                type: "formula",
                expr: "orders / sessions * 100",
                inputs: {
                  orders: { ...emptyMetric, ref: "orders.count", aggregator: "sum" },
                  sessions: { ...emptyMetric, ref: "sessions.count", aggregator: "sum" },
                },
              },
            })}>Formula</button>
        </div>

        {kpi.query.type === "metric" ? (
          <div className="grid grid-cols-3 gap-3">
            <input className="px-3 py-2 rounded-xl bg-surface-200" placeholder="metric ref (e.g., orders.count)"
              value={kpi.query.ref} onChange={e=>setKpi({...kpi, query:{...kpi.query, ref:e.target.value}})} />
            <select className="px-3 py-2 rounded-xl bg-surface-200"
              value={kpi.query.aggregator ?? "avg"} onChange={e=>setKpi({...kpi, query:{...kpi.query, aggregator:e.target.value as any}})}>
              <option>avg</option><option>sum</option><option>p95</option><option>p99</option>
            </select>
            <input className="px-3 py-2 rounded-xl bg-surface-200" placeholder="from (e.g., -60m)"
              value={kpi.query.range.from} onChange={e=>setKpi({...kpi, query:{...kpi.query, range:{...kpi.query.range, from:e.target.value}}})}/>
          </div>
        ) : (
          <div className="space-y-2">
            <input className="px-3 py-2 rounded-xl bg-surface-200 w-full"
              placeholder="expr, e.g., orders / sessions * 100"
              value={kpi.query.expr}
              onChange={e=>setKpi({ ...kpi, query: { ...kpi.query as any, expr: e.target.value }})}/>
            <div className="text-xs opacity-70">Inputs (JSON):</div>
            <textarea className="px-3 py-2 rounded-xl bg-surface-200 w-full h-32"
              value={JSON.stringify((kpi.query as any).inputs ?? {}, null, 2)}
              onChange={e=>{
                try { const inputs = JSON.parse(e.target.value); setKpi({...kpi, query:{ ...(kpi.query as any), inputs } }); } catch {}
              }}/>
          </div>
        )}
      </div>

      <div className="flex gap-3">
        <button onClick={save} className="px-4 py-2 rounded-xl bg-impact-primary text-white">Save KPI</button>
      </div>
    </div>
  );
}
EOF

# --- 7) minimal hash router in App.tsx ---
cat > src/App.tsx <<'EOF'
import { useEffect, useMemo, useState } from "react";
import Home from "./pages/Home";
import KpiBuilder from "./pages/KpiBuilder";

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
    return <Home />;
  }, [route]);

  return (
    <div className="max-w-6xl mx-auto">
      <header className="px-6 py-4 flex items-center justify-between">
        <a href="#/" className="font-semibold">MiradorStack UI</a>
        <nav className="flex gap-3 text-sm">
          <a href="#/">Home</a>
          <a href="#/kpi-builder">KPI Builder</a>
        </nav>
      </header>
      {page}
    </div>
  );
}
EOF

# --- 8) main.tsx wiring + index.html CSS ---
cat > src/main.tsx <<'EOF'
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
EOF

# small tweak to index.html title if exists
if grep -q "<title>Vite \+ React</title>" index.html 2>/dev/null; then
  sed -i 's|<title>Vite \+ React</title>|<title>MiradorStack UI</title>|' index.html
fi

echo ">> Done."
echo "Run:"
echo "  pnpm install"
echo "  pnpm dev"
echo
echo "Open http://localhost:5173 — go to "KPI Builder", create a KPI, then check Home."
