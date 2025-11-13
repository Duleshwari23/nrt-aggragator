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

// Initialize with defaults if empty
if (!kpiState.defs.length) {
  seedDefaultKpis();
}

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
    } else {
      // If no remote data, seed with defaults
      seedDefaultKpis();
    }
    kpiState.loadedRemote = true;
  } catch {
    // stay on local storage if remote unavailable, seed defaults if empty
    if (!kpiState.defs.length) {
      seedDefaultKpis();
    }
    kpiState.loadedRemote = true;
  }
}

function seedDefaultKpis() {
  const defaultKpis: KpiDef[] = [
    {
      id: "kpi-default-conv",
      kind: "business",
      name: "Conversion Rate",
      unit: "%",
      format: "pct",
      query: {
        type: "formula",
        expr: "orders / sessions * 100",
        inputs: {
          orders: { type: "metric", ref: "orders.count", aggregator: "sum", range: { from: "-60m", to: "now" } },
          sessions: { type: "metric", ref: "sessions.count", aggregator: "sum", range: { from: "-60m", to: "now" } }
        }
      },
      thresholds: [{ when: "<", value: 2.0, status: "warn" }],
      tags: ["funnel"], 
      visibility: "org"
    },
    {
      id: "kpi-default-revenue",
      kind: "business",
      name: "Revenue",
      unit: "₹",
      format: "currency",
      query: {
        type: "metric",
        ref: "revenue.total",
        aggregator: "sum",
        range: { from: "-60m", to: "now" }
      },
      thresholds: [{ when: "<", value: 10000, status: "warn" }],
      tags: ["revenue"],
      visibility: "org"
    }
  ];
  
  kpiState.defs = defaultKpis;
  lsSave(kpiState.defs);
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
