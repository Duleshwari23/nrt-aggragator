import { proxy, useSnapshot } from "valtio";
import type { KpiDef } from "../lib/kpi-types";

const LS_KEY = "mirador.kpi.layout.v1";

export const widgetState = proxy<{
  editMode: boolean;
  longPressMs: number;
  layoutById: Record<string, { x: number; y: number; w: number; h: number }>;
}>({
  editMode: false,
  longPressMs: 700,
  layoutById: {}
});

export function useWidgetState() {
  return useSnapshot(widgetState);
}

export const widgetActions = {
  enterEdit: () => {
    widgetState.editMode = true;
  },
  exitEdit: () => {
    widgetState.editMode = false;
  },
  toggleEdit: () => {
    widgetState.editMode = !widgetState.editMode;
  },
  setLayout: (id: string, layout: { x: number; y: number; w: number; h: number }) => {
    widgetState.layoutById[id] = layout;
    widgetActions.persist();
  },
  persist: () => {
    localStorage.setItem(LS_KEY, JSON.stringify(widgetState.layoutById));
  },
  restore: () => {
    try {
      const saved = localStorage.getItem(LS_KEY);
      if (saved) {
        widgetState.layoutById = JSON.parse(saved);
      }
    } catch {}
  },
  resetLayout: (defs: KpiDef[]) => {
    widgetState.layoutById = {};
    defs.forEach(def => {
      if (def.layout) {
        widgetState.layoutById[def.id] = {
          x: def.layout.x || 0,
          y: def.layout.y || 0,
          w: def.layout.w,
          h: def.layout.h
        };
      } else {
        // Default to small
        widgetState.layoutById[def.id] = { x: 0, y: 0, w: 2, h: 2 };
      }
    });
    widgetActions.persist();
  }
};

// Initialize on load
widgetActions.restore();
