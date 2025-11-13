import { useEffect, useState } from "react";
import type { KpiDef } from "../lib/kpi-types";
import { batchResolveKpis } from "../lib/kpi-remote";
import { resolveKpi } from "../lib/kpi-data";

export function useBatchKpiValues(defs: KpiDef[]) {
  const [values, setValues] = useState<Record<string, { value: number; spark?: [number,number][] }>>({});
  useEffect(() => {
    let alive = true;
    if (!defs.length) { setValues({}); return; }
    
    // Try remote batch resolution first
    batchResolveKpis(defs).then((map) => { 
      if (alive) setValues(map); 
    }).catch(async () => {
      // Fall back to local resolution if remote fails
      if (!alive) return;
      const localValues: Record<string, { value: number; spark?: [number,number][] }> = {};
      for (const def of defs) {
        try {
          const result = await resolveKpi(def);
          localValues[def.id] = result;
        } catch {
          // Skip failed local resolutions
        }
      }
      if (alive) setValues(localValues);
    });
    
    return () => { alive = false; };
  }, [JSON.stringify(defs.map(d => d.id))]); // change only when ids change
  return values;
}
