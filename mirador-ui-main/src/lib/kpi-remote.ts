import type { KpiDef } from "./kpi-types";

// Get the API base URL - for unified container, use port 3001 for mock API
function getApiBaseUrl(): string {
  // In the unified container, API calls go directly to the mock server on port 3001
  return 'http://localhost:3001';
}

// Persisted KPI defs (remote)
export async function fetchKpiDefsRemote(): Promise<KpiDef[]> {
  const baseUrl = getApiBaseUrl();
  const res = await fetch(`${baseUrl}/api/v1/kpi/defs`);
  if (!res.ok) throw new Error(`defs ${res.status}`);
  const data = await res.json();
  return data.defs || [];
}

export async function upsertKpiDefRemote(def: KpiDef): Promise<void> {
  const baseUrl = getApiBaseUrl();
  const method = "POST";
  const res = await fetch(`${baseUrl}/api/v1/kpi/defs`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(def),
  });
  if (!res.ok) throw new Error(`upsert ${res.status}`);
}

export async function deleteKpiDefRemote(id: string): Promise<void> {
  const baseUrl = getApiBaseUrl();
  const res = await fetch(`${baseUrl}/api/v1/kpi/defs/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`delete ${res.status}`);
}

// Batch KPI values
export async function batchResolveKpis(defs: KpiDef[]): Promise<Record<string, { value: number; spark?: [number,number][] }>> {
  const baseUrl = getApiBaseUrl();
  const items = defs.map(d => ({ id: d.id, query: d.query }));
  const res = await fetch(`${baseUrl}/api/v1/metrics/batch`, {
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
