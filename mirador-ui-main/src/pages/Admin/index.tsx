import { useState, useEffect } from "react";

export default function Admin() {
  const [apiEndpoint, setApiEndpoint] = useState(() => {
    return localStorage.getItem('mirador-core-endpoint') || 'https://api.mirador-core.com';
  });

  const [saved, setSaved] = useState(false);
  const [apiStatus, setApiStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking');

  useEffect(() => {
    checkApiStatus();
  }, [apiEndpoint]);

  const checkApiStatus = async () => {
    setApiStatus('checking');
    try {
      // Use configured endpoint, or default to unified container mock API on port 3001
      const baseUrl = apiEndpoint || 'http://localhost:3001';
      const response = await fetch(`${baseUrl}/api/v1/kpi/defs`);
      if (response.ok) {
        setApiStatus('connected');
      } else {
        setApiStatus('disconnected');
      }
    } catch (error) {
      setApiStatus('disconnected');
    }
  };

  const handleSave = () => {
    localStorage.setItem('mirador-core-endpoint', apiEndpoint);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    // Re-check API status with new endpoint
    checkApiStatus();
  };

  const handleTestConnection = async () => {
    try {
      // Use configured endpoint, or default to unified container mock API on port 3001
      const baseUrl = apiEndpoint || 'http://localhost:3001';
      const response = await fetch(`${baseUrl}/api/v1/kpi/defs`);
      if (response.ok) {
        alert('Connection successful! KPI API is accessible.');
      } else {
        alert(`Connection failed! Status: ${response.status}`);
      }
    } catch (error) {
      alert('Connection failed! Unable to reach the API endpoint.');
    }
  };

  return (
    <div className="p-8 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen transition-colors duration-300">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold mb-1 text-white dark:text-white text-light-text-primary">Admin Settings</h1>
        <p className="text-gray-400 dark:text-gray-400 text-light-text-secondary text-sm font-body">Configure system settings and endpoints</p>
      </div>

      {/* Engines Configuration */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
        <h2 className="text-xl font-semibold mb-4 text-white dark:text-white text-light-text-primary">Engines</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Mirador Core API Endpoint
            </label>
            <div className="flex gap-3">
              <input
                type="url"
                value={apiEndpoint}
                onChange={(e) => setApiEndpoint(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="http://localhost:3001"
              />
              <button
                onClick={handleTestConnection}
                className="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 transition-colors"
              >
                Test
              </button>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Leave empty to use the unified container's internal mock API (http://localhost:3001). Enter a full URL (e.g., https://api.example.com) to connect to an external mirador-core instance.
            </p>
          </div>
        </div>

        <div className="mt-6 flex items-center gap-4">
          <button
            onClick={handleSave}
            className="px-6 py-2 bg-impact-primary text-white rounded-md hover:bg-impact-primary/90 transition-colors"
          >
            Save Configuration
          </button>
          {saved && (
            <span className="text-green-600 dark:text-green-400 text-sm">
              ✓ Configuration saved successfully
            </span>
          )}
        </div>
      </div>

      {/* System Information */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
        <h2 className="text-xl font-semibold mb-4 text-white dark:text-white text-light-text-primary">System Information</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Version</h3>
            <p className="text-gray-900 dark:text-gray-100">MiradorStack UI v0.0.0</p>
          </div>
          <div>
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Environment</h3>
            <p className="text-gray-900 dark:text-gray-100">Development</p>
          </div>
          <div>
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">API Status</h3>
            <p className="text-gray-900 dark:text-gray-100">
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                apiStatus === 'connected' 
                  ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                  : apiStatus === 'checking'
                  ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                  : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
              }`}>
                {apiStatus === 'connected' ? 'Connected' : apiStatus === 'checking' ? 'Checking...' : 'Disconnected'}
              </span>
            </p>
          </div>
          <div>
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Last Updated</h3>
            <p className="text-gray-900 dark:text-gray-100">{new Date().toLocaleDateString()}</p>
          </div>
        </div>
      </div>
    </div>
  );
}