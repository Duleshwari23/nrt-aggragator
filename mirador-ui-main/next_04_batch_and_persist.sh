#!/usr/bin/env bash
set -euo pipefail

echo ">> Step D: Batch KPI values + Persist KPI defs to backend (mock)"

# 1) Extend mock server with /api/v1/metrics/batch and /api/v1/kpi/defs CRUD
if [ ! -f mock/server.js ]; then
  echo "!! mock/server.js not found. Run next_02_add_mock_api.sh first." >&2
  exit 1
fi

if ! grep -q "__KPI_DEFS_DB__" mock/server.js; then
cat >> mock/server.js <<'EOF'

// ----- In-memory KPI defs DB (mock) -----
const __KPI_DEFS_DB__ = new Map();
// Seed a couple of org-level KPIs for demo
__KPI_DEFS_DB__.set("kpi-seed-conv", {
  id: "kpi-seed-conv",
  kind: "business",
  name: "Conversion",
  unit: "%",
  format: "pct",
  query: {
    type: "formula",
    expr: "orders / sessions * 100",
    inputs: {
      orders: { type: "metric", ref: "orders.count", aggregator: "sum", range: { from: "-60m", to: "now" } },
      sessions:{ type: "metric", ref: "sessions.count", aggregator: "sum", range: { from: "-60m", to: "now" } }
    }
  },
  thresholds: [{ when: "<", value: 2.0, status: "warn" }],
  tags: ["funnel"], visibility: "org"
});

// ----- Batch metrics endpoint -----
app.post('/api/v1/metrics/batch', (req, res) => {
  const { items = [] } = req.body || {};
  // items: [{ id, query: KpiQuery }]
  function spark(base) {
    const out = [];
    const now = Date.now();
    for (let i=30;i>0;i--) out.push([now - i*60000, base + Math.sin(i/3)*5]);
    return out;
  }
  function metricVal(q) {
    const base = (q.aggregator || "").startsWith("p") ? 700 : 100;
    const isConv = String(q.ref||"").toLowerCase().includes("conversion");
    return isConv ? 2.1 : base + Math.random()*50;
  }
  function solve(q) {
    if (q.type === "metric") {
      const v = metricVal(q);
      return { value: v, spark: spark(v) };
    }
    // formula
    const inputs = {};
    for (const k of Object.keys(q.inputs||{})) inputs[k] = solve(q.inputs[k]).value;
    const safe = q.expr.replace(/[A-Za-z_][A-Za-z0-9_]*/g, (m) => String(inputs[m] ?? 0));
    const value = Function(`"use strict"; return (${safe});`)();
    return { value };
  }
  const out = items.map((it) => {
    try {
      const { value, spark } = solve(it.query);
      return { id: it.id, value, spark };
    } catch (e) {
      return { id: it.id, error: String(e) };
    }
  });
  res.json({ results: out });
});

// ----- KPI defs CRUD (very lightweight mock) -----
app.get('/api/v1/kpi/defs', (req, res) => {
  const defs = Array.from(__KPI_DEFS_DB__.values());
  res.json({ defs });
});
app.post('/api/v1/kpi/defs', (req, res) => {
  const def = req.body || {};
  if (!def.id) return res.status(400).json({ error: "id required" });
  __KPI_DEFS_DB__.set(def.id, def);
  res.json(def);
});
app.put('/api/v1/kpi/defs/:id', (req, res) => {
  const id = req.params.id;
  const def = req.body || {};
  if (!__KPI_DEFS_DB__.has(id)) return res.status(404).json({ error: "not found" });
  __KPI_DEFS_DB__.set(id, def);
  res.json(def);
});
app.delete('/api/v1/kpi/defs/:id', (req, res) => {
  const id = req.params.id;
  __KPI_DEFS_DB__.delete(id);
  res.json({ ok: true });
});
EOF
  echo ">> mock/server.js patched with batch + KPI defs CRUD."
else
  echo ">> mock/server.js already has KPI defs DB marker; skipping patch."
fi

# 2) Add client helpers: batch resolve + server persistence
mkdir -p src/lib

cat > src/lib/kpi-remote.ts <<'EOF'
import type { KpiDef } from "./kpi-types";

// Persisted KPI defs (remote)
export async function fetchKpiDefsRemote(): Promise<KpiDef[]> {
  const res = await fetch("/api/v1/kpi/defs");
  if (!res.ok) throw new Error(`defs ${res.status}`);
  const data = await res.json();
  return data.defs || [];
}

export async function upsertKpiDefRemote(def: KpiDef): Promise<void> {
  const method = "POST";
  const res = await fetch("/api/v1/kpi/defs", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(def),
  });
  if (!res.ok) throw new Error(`upsert ${res.status}`);
}

export async function deleteKpiDefRemote(id: string): Promise<void> {
  const res = await fetch(`/api/v1/kpi/defs/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`delete ${res.status}`);
}

// Batch KPI values
export async function batchResolveKpis(defs: KpiDef[]): Promise<Record<string, { value: number; spark?: [number,number][] }>> {
  const items = defs.map(d => ({ id: d.id, query: d.query }));
  const res = await fetch("/api/v1/metrics/batch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items }),
  });
  if (!res.ok) throw new Error(`batch ${res.status}`);
  const data = await res.json();
  const out: Record<string, { value: number; spark?: [number,number][] }> = {};
  for (const r of (data.results || [])) {
    if (r && !r.error) out[r.id] = { value: r.value, spark: r.spark };
  }
  return out;
}
EOF

# 3) Update the store to load/save via remote (fallback to localStorage)
cat > src/state/kpi-store.ts <<'EOF'
import { proxy, useSnapshot } from "valtio";
import type { KpiDef } from "../lib/kpi-types";
import { zKpiDef } from "../lib/kpi-schema";
import { fetchKpiDefsRemote, upsertKpiDefRemote, deleteKpiDefRemote } from "../lib/kpi-remote";

const LS_KEY = "mirador.kpi.defs";

function lsLoad(): KpiDef[] {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "[]"); } catch { return []; }
}
function lsSave(defs: KpiDef[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(defs));
}

export const kpiState = proxy<{ defs: KpiDef[]; loadedRemote: boolean }>({
  defs: lsLoad(),
  loadedRemote: false
});

export function useKpiDefs() {
  return useSnapshot(kpiState).defs;
}

// Load from remote once (then cache to LS so refresh keeps them)
export async function ensureKpiDefsLoaded() {
  if (kpiState.loadedRemote) return;
  try {
    const remote = await fetchKpiDefsRemote();
    if (remote?.length) {
      kpiState.defs = remote;
      lsSave(kpiState.defs);
    }
    kpiState.loadedRemote = true;
  } catch {
    // stay on local storage if remote unavailable
    kpiState.loadedRemote = true;
  }
}

export async function addOrUpdateKpi(def: KpiDef) {
  const parsed = zKpiDef.parse(def);
  // optimistic local update
  const i = kpiState.defs.findIndex((d) => d.id === parsed.id);
  if (i >= 0) kpiState.defs[i] = parsed; else kpiState.defs.push(parsed);
  lsSave(kpiState.defs);
  // remote write (best-effort)
  try { await upsertKpiDefRemote(parsed); } catch {}
}

export async function removeKpi(id: string) {
  kpiState.defs = kpiState.defs.filter((d) => d.id !== id);
  lsSave(kpiState.defs);
  try { await deleteKpiDefRemote(id); } catch {}
}
EOF

# 4) Add a batch hook + wire KpiGrid to it (KpiCard can accept preloaded value)
mkdir -p src/hooks
cat > src/hooks/useBatchKpiValues.ts <<'EOF'
import { useEffect, useState } from "react";
import type { KpiDef } from "../lib/kpi-types";
import { batchResolveKpis } from "../lib/kpi-remote";

export function useBatchKpiValues(defs: KpiDef[]) {
  const [values, setValues] = useState<Record<string, { value: number; spark?: [number,number][] }>>({});
  useEffect(() => {
    let alive = true;
    if (!defs.length) { setValues({}); return; }
    batchResolveKpis(defs).then((map) => { if (alive) setValues(map); });
    return () => { alive = false; };
  }, [JSON.stringify(defs.map(d => d.id))]); // change only when ids change
  return values;
}
EOF

# 5) Patch KpiCard to accept valueOverride (non-breaking)
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

export function KpiCard({ def, valueOverride }: { def: KpiDef; valueOverride?: number }) {
  const [value, setValue] = useState<number | null>(valueOverride ?? null);
  const [status, setStatus] = useState<"ok" | "warn" | "crit">("ok");

  useEffect(() => {
    if (typeof valueOverride === "number") {
      setValue(valueOverride);
      setStatus(statusForValue(def, valueOverride));
      return;
    }
    let alive = true;
    resolveKpi(def).then((res) => {
      if (!alive) return;
      setValue(res.value);
      setStatus(statusForValue(def, res.value));
    });
    return () => { alive = false; };
  }, [JSON.stringify(def), valueOverride]);

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

# 6) Patch KpiGrid to use batch values
cat > src/components/KpiGrid/index.tsx <<'EOF'
import type { KpiDef } from "../../lib/kpi-types";
import { KpiCard } from "../KpiCard";
import { useBatchKpiValues } from "../../hooks/useBatchKpiValues";

export function KpiGrid({ defs }: { defs: KpiDef[] }) {
  const values = useBatchKpiValues(defs);
  return (
    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
      {defs.map((d) => (
        <KpiCard key={d.id} def={d} valueOverride={values[d.id]?.value}/>
      ))}
    </div>
  );
}
EOF

# 7) Ensure App loads remote KPI defs once on boot
if [ -f src/App.tsx ]; then
  # Only patch if ensureKpiDefsLoaded not already present
  if ! grep -q "ensureKpiDefsLoaded" src/App.tsx; then
    sed -i.bak '1s|^|import { useEffect } from "react";\nimport { ensureKpiDefsLoaded } from "./state/kpi-store";\n|' src/App.tsx
    # Add useEffect after component start (naive append just before return line)
    sed -i.bak 's|export default function App() {|export default function App() {\n  useEffect(() => { ensureKpiDefsLoaded(); }, []);|' src/App.tsx
    rm -f src/App.tsx.bak
    echo ">> App.tsx patched to load remote KPI defs on boot."
  else
    echo ">> App.tsx already loads remote KPI defs; skipping."
  fi
else
  echo "!! src/App.tsx not found."
fi

echo
echo ">> Step D complete."
echo "Run the app with:  pnpm dev:all"
echo "Open Home: http://localhost:5173/#/  (now batches KPI values)"
echo "Remote KPI defs are persisted in mock server memory; your localStorage also stays as a cache."