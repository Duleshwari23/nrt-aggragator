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
