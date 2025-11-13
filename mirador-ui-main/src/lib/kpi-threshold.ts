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
