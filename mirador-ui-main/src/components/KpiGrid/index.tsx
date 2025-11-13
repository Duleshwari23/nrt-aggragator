import type { KpiDef } from "../../lib/kpi-types";
import { KpiCard } from "../KpiCard";
import { useBatchKpiValues } from "../../hooks/useBatchKpiValues";
import { useWidgetState, widgetActions } from "../../state/widgets";
import { useEffect, useState, useCallback } from "react";
import { Responsive, WidthProvider } from "react-grid-layout";
import type { Layout } from "react-grid-layout";
import "react-grid-layout/css/styles.css";

const ResponsiveGridLayout = WidthProvider(Responsive);

export function KpiGrid({ defs }: { defs: KpiDef[] }) {
  const values = useBatchKpiValues(defs);
  const widgetState = useWidgetState();
  const [layouts, setLayouts] = useState<Record<string, Layout[]>>({});

  // Initialize layouts from widget state
  useEffect(() => {
    const newLayouts: Record<string, Layout[]> = {};
    const breakpoints = ['lg', 'md', 'sm', 'xs', 'xxs'];

    breakpoints.forEach(bp => {
      newLayouts[bp] = defs.map((def, index) => {
        let layout = widgetState.layoutById[def.id];
        
        // If no saved layout, create initial grid position
        if (!layout) {
          const cols = bp === 'lg' ? 4 : bp === 'md' ? 4 : 2;
          const x = index % cols;
          const y = Math.floor(index / cols);
          layout = { x, y, w: 2, h: 2 }; // Default to small
        }
        
        return {
          i: def.id,
          x: layout.x,
          y: layout.y,
          w: layout.w,
          h: layout.h,
          minW: 2,
          minH: 2,
          maxW: bp === 'lg' ? 4 : bp === 'md' ? 4 : 2,
          maxH: bp === 'lg' ? 4 : bp === 'md' ? 4 : 4,
          static: !widgetState.editMode
        };
      });
    });

    setLayouts(newLayouts);
  }, [defs]); // Only depend on defs for initial layout creation

  // Update static property when editMode changes
  useEffect(() => {
    setLayouts(prevLayouts => {
      const newLayouts = { ...prevLayouts };
      Object.keys(newLayouts).forEach(bp => {
        newLayouts[bp] = newLayouts[bp].map(layout => ({
          ...layout,
          static: !widgetState.editMode
        }));
      });
      return newLayouts;
    });
  }, [widgetState.editMode]);

  const handleLayoutChange = useCallback((currentLayout: Layout[], allLayouts: Record<string, Layout[]>) => {
    setLayouts(allLayouts);

    // Update widget state for the current breakpoint
    currentLayout.forEach(layout => {
      widgetActions.setLayout(layout.i, {
        x: layout.x,
        y: layout.y,
        w: layout.w,
        h: layout.h
      });
    });
  }, []);

  const handleBreakpointChange = useCallback((_newBreakpoint: string, _newCols: number) => {
    // Could store breakpoint if needed
  }, []);

  return (
    <div className="widgets-grid w-full" role="grid" aria-label="KPI widgets dashboard">
      <ResponsiveGridLayout
        className="layout"
        layouts={layouts}
        onLayoutChange={handleLayoutChange}
        onBreakpointChange={handleBreakpointChange}
        breakpoints={{ lg: 1024, md: 768, sm: 640, xs: 480, xxs: 0 }}
        cols={{ lg: 4, md: 4, sm: 2, xs: 2, xxs: 1 }}
        rowHeight={120}
        margin={[16, 16]}
        containerPadding={[0, 0]}
        isDraggable={widgetState.editMode}
        isResizable={widgetState.editMode}
        draggableHandle=".drag-handle"
        resizeHandles={['se']}
        compactType="vertical"
        preventCollision={false}
        useCSSTransforms={true}
        allowOverlap={false}
      >
        {defs.map((def, index) => (
          <div
            key={def.id}
            className={`widget-container h-full ${widgetState.editMode ? 'animate-jiggle' : ''}`}
            role="gridcell"
            aria-label={`KPI widget: ${def.name}`}
            style={{
              // Add slight random jiggle variation
              animationDelay: widgetState.editMode ? `${index * 0.05}s` : undefined,
            }}
          >
            <KpiCard
              def={def}
              valueOverride={values[def.id]?.value}
              editing={widgetState.editMode}
            />
          </div>
        ))}
      </ResponsiveGridLayout>
    </div>
  );
}
