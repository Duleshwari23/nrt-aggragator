import { useEffect } from "react";
import { useKpiDefs, ensureKpiDefsLoaded } from "../../state/kpi-store";
import { useWidgetState, widgetActions } from "../../state/widgets";
import { KpiGrid } from "../../components/KpiGrid";

export default function Home() {
  const defs = useKpiDefs();
  const widgetState = useWidgetState();
  
  useEffect(() => {
    // Load remote data in background (will update state if successful)
    ensureKpiDefsLoaded();
  }, []);

  const handleResetLayout = () => {
    if (confirm("Reset layout to defaults?")) {
      widgetActions.resetLayout(JSON.parse(JSON.stringify(defs)));
    }
  };

  return (
    <div className="p-8 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen transition-colors duration-300">
      {/* Page Header with Toolbar */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold mb-1 text-white dark:text-white text-light-text-primary">Dashboard</h1>
          <p className="text-gray-400 dark:text-gray-400 text-light-text-secondary text-sm font-body">Monitor your key performance indicators</p>
        </div>
        
        {/* Toolbar */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleResetLayout}
            className="px-3 py-1.5 text-sm bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
            title="Reset layout to defaults"
          >
            Reset Layout
          </button>
          <button
            onClick={widgetActions.toggleEdit}
            className={`px-4 py-2 rounded-lg font-body text-sm transition-colors ${
              widgetState.editMode 
                ? "bg-blue-500 text-white hover:bg-blue-600" 
                : "bg-impact-primary text-white hover:bg-impact-primary/90"
            }`}
            title={widgetState.editMode ? "Done editing" : "Edit widgets"}
          >
            {widgetState.editMode ? "Done" : "Edit"}
          </button>
          <a 
            href="#/kpi-builder" 
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-impact-primary text-white hover:bg-impact-primary/90 transition-colors font-body text-sm shadow-lg"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd"/>
            </svg>
            New KPI
          </a>
        </div>
      </div>
      
      {/* Content */}
      <KpiGrid defs={JSON.parse(JSON.stringify(defs))} />
    </div>
  );
}
