import { useState, useEffect } from "react";
import { v4 as uuid } from "uuid";
import type { KpiDef } from "../../lib/kpi-types";
import { addOrUpdateKpi, useKpiDefs, removeKpi, ensureKpiDefsLoaded } from "../../state/kpi-store";

const emptyMetric = { type: "metric" as const, ref: "", aggregator: "avg" as const, range: { from: "-60m", to: "now" } };

export default function KpiBuilder({ editingKpiId }: { editingKpiId?: string }) {
  const kpiDefs = useKpiDefs();
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

  // Load KPIs on mount and find existing KPI for editing
  useEffect(() => {
    ensureKpiDefsLoaded();
  }, []);

  useEffect(() => {
    if (editingKpiId) {
      const existingKpi = kpiDefs.find(k => k.id === editingKpiId);
      if (existingKpi) {
        // Create a mutable copy to avoid readonly issues with Valtio
        setKpi(JSON.parse(JSON.stringify(existingKpi)));
      }
    }
  }, [editingKpiId, kpiDefs]);

  function save() {
    addOrUpdateKpi(kpi);
    alert(editingKpiId ? "KPI updated successfully" : "KPI saved successfully");
    location.hash = "#/"; // go home
  }

  function deleteKpi() {
    if (!editingKpiId) return;
    if (confirm("Are you sure you want to delete this KPI? This action cannot be undone.")) {
      removeKpi(editingKpiId);
      alert("KPI deleted successfully");
      location.hash = "#/"; // go home
    }
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold mb-1">
            {editingKpiId ? 'Edit KPI' : 'KPI Builder'}
          </h1>
          <p className="text-gray-400 text-sm font-body">
            {editingKpiId ? 'Update your key performance indicator' : 'Create and configure your key performance indicators'}
          </p>
        </div>
        <a 
          href="#/" 
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors font-body text-sm"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd"/>
          </svg>
          Back to Dashboard
        </a>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <label className="space-y-1">
          <div className="text-xs">Name</div>
          <input className="px-3 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 w-full"
            value={kpi.name} onChange={(e)=>setKpi({...kpi, name: e.target.value})} />
        </label>

        <label className="space-y-1">
          <div className="text-xs">Kind</div>
          <select className="px-3 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 w-full"
            value={kpi.kind} onChange={(e)=>setKpi({...kpi, kind: e.target.value as any})}>
            <option value="business">Business</option>
            <option value="tech">Tech</option>
          </select>
        </label>

        <label className="space-y-1">
          <div className="text-xs">Format</div>
          <select className="px-3 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 w-full"
            value={kpi.format} onChange={(e)=>setKpi({...kpi, format: e.target.value as any})}>
            <option value="number">Number</option>
            <option value="pct">Percent</option>
            <option value="currency">Currency</option>
            <option value="duration">Duration (ms)</option>
          </select>
        </label>

        <label className="space-y-1">
          <div className="text-xs">Unit</div>
          <input className="px-3 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 w-full"
            value={kpi.unit ?? ""} onChange={(e)=>setKpi({...kpi, unit: e.target.value || undefined})}/>
        </label>
      </div>

      <div className="rounded-2xl p-4 bg-gray-100 dark:bg-gray-800 space-y-2">
        <div className="text-sm font-medium">Query</div>
        <div className="flex gap-3">
          <button className={`px-3 py-1 rounded-lg ${kpi.query.type==="metric"?"bg-impact-primary text-white":"bg-gray-200 dark:bg-gray-700"}`}
            onClick={()=>setKpi({...kpi, query: emptyMetric})}>Metric</button>
          <button className={`px-3 py-1 rounded-lg ${kpi.query.type==="formula"?"bg-impact-primary text-white":"bg-gray-200 dark:bg-gray-700"}`}
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
            <input className="px-3 py-2 rounded-xl bg-gray-100 dark:bg-gray-800" placeholder="metric ref (e.g., orders.count)"
              value={(kpi.query as any).ref || ""} 
              onChange={e=>setKpi({...kpi, query:{...kpi.query, ref:e.target.value} as any})} />
            <select className="px-3 py-2 rounded-xl bg-gray-100 dark:bg-gray-800"
              value={(kpi.query as any).aggregator ?? "avg"} 
              onChange={e=>setKpi({...kpi, query:{...kpi.query, aggregator:e.target.value} as any})}>
              <option>avg</option><option>sum</option><option>p95</option><option>p99</option>
            </select>
            <input className="px-3 py-2 rounded-xl bg-gray-100 dark:bg-gray-800" placeholder="from (e.g., -60m)"
              value={(kpi.query as any).range?.from || ""} 
              onChange={e=>setKpi({...kpi, query:{...kpi.query, range:{...(kpi.query as any).range, from:e.target.value}} as any})}/>
          </div>
        ) : (
          <div className="space-y-2">
            <input className="px-3 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 w-full"
              placeholder="expr, e.g., orders / sessions * 100"
              value={(kpi.query as any).expr || ""}
              onChange={e=>setKpi({ ...kpi, query: { ...kpi.query as any, expr: e.target.value }})}/>
            <div className="text-xs opacity-70">Inputs (JSON):</div>
            <textarea className="px-3 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 w-full h-32"
              value={JSON.stringify((kpi.query as any).inputs ?? {}, null, 2)}
              onChange={e=>{
                try { const inputs = JSON.parse(e.target.value); setKpi({...kpi, query:{ ...(kpi.query as any), inputs } }); } catch {}
              }}/>
          </div>
        )}
      </div>

      <div className="flex gap-3">
        <button onClick={save} className="px-4 py-2 rounded-xl bg-impact-primary text-white">
          {editingKpiId ? 'Update KPI' : 'Save KPI'}
        </button>
        {editingKpiId && (
          <button onClick={deleteKpi} className="px-4 py-2 rounded-xl bg-red-600 text-white hover:bg-red-700 transition-colors">
            Delete KPI
          </button>
        )}
      </div>
    </div>
  );
}
