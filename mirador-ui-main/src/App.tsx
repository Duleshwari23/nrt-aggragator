import { useEffect, useMemo, useState } from "react";
import Home from "./pages/Home";
import KpiBuilder from "./pages/KpiBuilder";
import Chat from "./pages/Chat";
import Incident from "./pages/Incident";
import Admin from "./pages/Admin";
import { KeyboardHint } from "./components/KeyboardHint";
import { ThemeSwitcher } from "./components/ThemeSwitcher";

function useHashRoute() {
  const [hash, setHash] = useState<string>(() => location.hash || "#/");
  useEffect(() => {
    const fn = () => setHash(location.hash || "#/");
    window.addEventListener("hashchange", fn);
    return () => window.removeEventListener("hashchange", fn);
  }, []);
  return hash.replace(/^#/, "") || "/";
}

export default function App() {
  // useEffect(() => { ensureKpiDefsLoaded(); }, []);
  const route = useHashRoute();
  
  // Initialize sidebar state from localStorage
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebar-collapsed');
    return saved ? JSON.parse(saved) : false;
  });

  // Save sidebar state to localStorage
  useEffect(() => {
    localStorage.setItem('sidebar-collapsed', JSON.stringify(sidebarCollapsed));
  }, [sidebarCollapsed]);

  // Show keyboard hint for a few seconds on first load
  const [showKeyboardHint, setShowKeyboardHint] = useState(false);
  useEffect(() => {
    const hasSeenHint = localStorage.getItem('keyboard-hint-seen');
    if (!hasSeenHint) {
      const timer = setTimeout(() => {
        setShowKeyboardHint(true);
        const hideTimer = setTimeout(() => {
          setShowKeyboardHint(false);
          localStorage.setItem('keyboard-hint-seen', 'true');
        }, 3000);
        return () => clearTimeout(hideTimer);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, []);

  // Keyboard shortcut to toggle sidebar (Ctrl/Cmd + B)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
        e.preventDefault();
        setSidebarCollapsed((prev: boolean) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
  const page = useMemo(() => {
    if (route.startsWith("/kpi-builder")) {
      // Extract KPI ID from route like /kpi-builder/123-456-789
      const kpiId = route.includes('/kpi-builder/') ? route.split('/kpi-builder/')[1] : undefined;
      return <KpiBuilder editingKpiId={kpiId} />;
    }
    if (route.startsWith("/chat")) return <Chat />;
    if (route.startsWith("/incident")) return <Incident />;
    if (route.startsWith("/admin")) return <Admin />;
    return <Home />;
  }, [route]);

  return (
    <div className="min-h-screen flex bg-gray-50 dark:bg-gray-900 transition-colors duration-300">
      {/* Sidebar */}
      <aside className={`${
        sidebarCollapsed ? 'w-16' : 'w-64'
      } bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col transition-all duration-300 ease-in-out relative lg:static fixed z-20 h-full ${
        sidebarCollapsed ? 'lg:relative' : 'lg:relative'
      }`}>
        {/* Logo Header */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <a href="#/" className={`flex items-center gap-3 ${sidebarCollapsed ? 'justify-center' : ''}`}>
            <img src="/logos/miradorstack-logo.svg" alt="MiradorStack" className="h-8 w-auto flex-shrink-0" />
            <span className={`font-semibold text-lg transition-opacity duration-300 ${sidebarCollapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100'}`}>
              MiradorStack UI
            </span>
          </a>
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors group"
            title={`${sidebarCollapsed ? 'Expand' : 'Collapse'} sidebar (⌘B)`}
          >
            <svg 
              className={`w-5 h-5 transition-transform duration-300 group-hover:scale-110 ${sidebarCollapsed ? 'rotate-180' : ''}`} 
              fill="currentColor" 
              viewBox="0 0 20 20"
            >
              <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd"/>
            </svg>
          </button>
        </div>
        
        {/* Navigation Menu */}
        <nav className="flex-1 p-4">
          <ul className="space-y-2">
            <li>
              <a 
                href="#/" 
                className={`flex items-center ${sidebarCollapsed ? 'justify-center px-2' : 'gap-3 px-3'} py-2 rounded-lg font-body text-sm transition-all duration-200 ${
                  route === "/" ? "bg-impact-primary text-white" : "hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300"
                }`}
                title={sidebarCollapsed ? "Home" : ""}
              >
                <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z"/>
                </svg>
                <span className={`transition-all duration-300 ${sidebarCollapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100'}`}>
                  Home
                </span>
              </a>
            </li>
            <li>
              <a 
                href="#/kpi-builder" 
                className={`flex items-center ${sidebarCollapsed ? 'justify-center px-2' : 'gap-3 px-3'} py-2 rounded-lg font-body text-sm transition-all duration-200 ${
                  route.startsWith("/kpi-builder") ? "bg-impact-primary text-white" : "hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300"
                }`}
                title={sidebarCollapsed ? "KPI Builder" : ""}
              >
                <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z"/>
                </svg>
                <span className={`transition-all duration-300 ${sidebarCollapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100'}`}>
                  KPI Builder
                </span>
              </a>
            </li>
            <li>
              <a 
                href="#/chat" 
                className={`flex items-center ${sidebarCollapsed ? 'justify-center px-2' : 'gap-3 px-3'} py-2 rounded-lg font-body text-sm transition-all duration-200 ${
                  route.startsWith("/chat") ? "bg-impact-primary text-white" : "hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300"
                }`}
                title={sidebarCollapsed ? "Chat" : ""}
              >
                <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd"/>
                </svg>
                <span className={`transition-all duration-300 ${sidebarCollapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100'}`}>
                  Chat
                </span>
              </a>
            </li>
            <li>
              <a 
                href="#/admin" 
                className={`flex items-center ${sidebarCollapsed ? 'justify-center px-2' : 'gap-3 px-3'} py-2 rounded-lg font-body text-sm transition-all duration-200 ${
                  route.startsWith("/admin") ? "bg-impact-primary text-white" : "hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300"
                }`}
                title={sidebarCollapsed ? "Admin" : ""}
              >
                <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c1.56.379 2.978-1.56 2.978-2.978a1.533 1.533 0 01.947-2.287c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01-2.287-.947c-.379-1.56-2.6-1.56-2.978 0a1.533 1.533 0 01-2.287-.947zm-.41 2.83a.75.75 0 101.06 1.06.75.75 0 00-1.06-1.06zM10 14a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd"/>
                </svg>
                <span className={`transition-all duration-300 ${sidebarCollapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100'}`}>
                  Admin
                </span>
              </a>
            </li>
          </ul>
        </nav>
        
        {/* Footer */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-700">
          <div className={`flex items-center gap-2 text-xs text-gray-400 dark:text-gray-400 text-light-text-secondary ${sidebarCollapsed ? 'justify-center' : ''}`}>
            <img src="/logos/platformbuilds-logo-only.svg" alt="PlatformBuilds" className="h-4 w-auto flex-shrink-0" />
            <span className={`transition-all duration-300 ${sidebarCollapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100'}`}>
              by PlatformBuilds
            </span>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-auto relative">
        {/* Mobile backdrop when sidebar is open */}
        {!sidebarCollapsed && (
          <div 
            className="fixed inset-0 bg-black bg-opacity-50 z-10 lg:hidden"
            onClick={() => setSidebarCollapsed(true)}
          />
        )}
        
        {/* Theme Switcher - Top Right */}
        <div className="fixed top-6 right-6 z-30">
          <ThemeSwitcher />
        </div>
        
        {/* Content with subtle transition */}
        <div className="transition-all duration-300 ease-in-out">
          {page}
        </div>
      </main>

      {/* Keyboard shortcut hint */}
      <KeyboardHint show={showKeyboardHint} />
    </div>
  );
}
