import { useEffect, useState } from "react";
import SimpleTimeline from "../../components/SimpleTimeline";
import { rcaInvestigate, type RcResponse } from "../../lib/api";

export default function Incident() {
  const [rca, setRca] = useState<RcResponse | null>(null);
  const [err, setErr] = useState<string>("");

  useEffect(() => {
    const now = new Date();
    const from = new Date(now.getTime() - 60*60*1000);
    rcaInvestigate({ window: { from: from.toISOString(), to: now.toISOString() }, include: ["timeline","root_cause","explanation"] })
      .then(setRca)
      .catch(e=>setErr(String(e)));
  }, []);

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-1">Incident Analysis</h1>
        <p className="text-gray-400 text-sm font-body">Root cause analysis and timeline visualization</p>
      </div>
      {err && <div className="text-red-400 text-sm">{err}</div>}
      {rca ? (
        <>
          <div className="rounded-2xl p-6 bg-surface-100">
            <h3 className="text-lg font-semibold mb-4">Timeline</h3>
            <SimpleTimeline data={rca.timeline} />
          </div>
          <div className="rounded-2xl p-6 bg-surface-100 space-y-4">
            <h3 className="text-lg font-semibold">Analysis</h3>
            <div className="font-body leading-relaxed">{rca.explanation}</div>
            {rca.root_cause && (
              <div className="flex items-center gap-4 p-4 bg-surface-200 rounded-xl">
                <svg className="w-5 h-5 text-anomaly flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd"/>
                </svg>
                <div>
                  <div className="font-semibold">Root Cause: {rca.root_cause.signal}</div>
                  <div className="text-sm text-gray-400 font-body">
                    Confidence: {(rca.root_cause.confidence*100).toFixed(0)}% • Model: {rca.meta.model}
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="flex items-center justify-center py-16">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-impact-primary mx-auto mb-4"></div>
            <div className="text-gray-400 font-body">Analyzing incident data...</div>
          </div>
        </div>
      )}
    </div>
  );
}
