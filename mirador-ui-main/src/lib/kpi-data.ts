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
