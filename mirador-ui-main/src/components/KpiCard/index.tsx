import { useEffect, useState, useRef, useCallback } from "react";
import type { KpiDef } from "../../lib/kpi-types";
import { resolveKpi } from "../../lib/kpi-data";
import { statusForValue } from "../../lib/kpi-threshold";
import { removeKpi } from "../../state/kpi-store";

function fmt(v: number, fmt?: string, unit?: string) {
  if (fmt === "pct") return `${v.toFixed(2)}%`;
  if (fmt === "currency") return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(v);
  if (fmt === "duration") return `${Math.round(v)} ms`;
  return new Intl.NumberFormat("en-IN").format(v) + (unit ? ` ${unit}` : "");
}

interface KpiCardProps {
  def: KpiDef;
  valueOverride?: number;
  editing?: boolean;
}

export function KpiCard({
  def,
  valueOverride,
  editing = false
}: KpiCardProps) {
  const [value, setValue] = useState<number | null>(valueOverride ?? null);
  const [status, setStatus] = useState<"ok" | "warn" | "crit">("ok");
  const [longPressActive, setLongPressActive] = useState(false);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

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

  const handlePointerDown = useCallback(() => {
    if (editing) return; // Don't handle long press in edit mode

    setLongPressActive(false);
    longPressTimer.current = setTimeout(() => {
      setLongPressActive(true);
      // Import and call enterEdit here if needed
      import("../../state/widgets").then(({ widgetActions }) => {
        widgetActions.enterEdit();
      });
    }, 700);
  }, [editing]);

  const handlePointerUp = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    setLongPressActive(false);
  }, []);

  const handlePointerLeave = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    setLongPressActive(false);
  }, []);

  const handleDelete = useCallback(() => {
    if (confirm(`Delete KPI "${def.name}"?`)) {
      removeKpi(def.id);
    }
  }, [def.id, def.name]);

  const handleEdit = useCallback(() => {
    window.location.hash = `#/kpi-builder/${def.id}`;
  }, [def.id]);

  const color = status === "crit" ? "text-red-500" : status === "warn" ? "text-yellow-400" : "text-green-400";

  return (
    <div
      ref={cardRef}
      className={`
        relative h-full rounded-2xl bg-white dark:bg-gray-800 shadow-lg hover:shadow-xl
        transition-all duration-300 border border-gray-200 dark:border-gray-700
        widget-backdrop-blur p-4 flex flex-col
        ${longPressActive ? 'ring-2 ring-blue-500 ring-opacity-50' : ''}
        ${editing ? 'cursor-move' : 'cursor-pointer'}
      `}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerLeave}
      role="button"
      tabIndex={0}
      aria-label={`KPI widget: ${def.name}`}
    >
      {/* Delete badge - only visible in edit mode */}
      {editing && (
        <button
          onClick={handleDelete}
          className="absolute -top-2 -left-2 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center text-white text-sm hover:bg-red-600 transition-colors z-20 shadow-lg"
          aria-label={`Delete ${def.name}`}
        >
          –
        </button>
      )}

      {/* Drag handle - only visible in edit mode */}
      {editing && (
        <div className="drag-handle absolute top-2 right-2 w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 cursor-move">
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path d="M3 4h14a1 1 0 010 2H3a1 1 0 010-2zM3 8h14a1 1 0 010 2H3a1 1 0 010-2zM3 12h14a1 1 0 010 2H3a1 1 0 010-2z"/>
          </svg>
        </div>
      )}

      {/* Card Content */}
      <div className="flex-1 flex flex-col justify-between">
        <div>
          <div className="text-xs uppercase opacity-70 font-body tracking-wide text-gray-400 dark:text-gray-400 mb-1">
            {def.kind}
          </div>
          <div className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2 line-clamp-2">
            {def.name}
          </div>
        </div>

        <div className="text-center">
          <div className={`text-2xl font-bold ${color} mb-1`}>
            {value === null ? "…" : fmt(value, def.format, def.unit)}
          </div>
        </div>

        {def.tags?.length ? (
          <div className="text-xs opacity-60 text-gray-500 dark:text-gray-400 mt-2 line-clamp-1">
            {def.tags.join(" · ")}
          </div>
        ) : null}
      </div>

      {/* Edit button - appears on hover or focus */}
      <button
        onClick={handleEdit}
        className="absolute bottom-2 right-2 w-8 h-8 bg-blue-500 hover:bg-blue-600 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
        aria-label={`Edit ${def.name}`}
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/>
        </svg>
      </button>
    </div>
  );
}
