import { useEffect, useRef, useState } from "react";
import { miraChatStream } from "../../lib/api";

export default function Chat() {
  const [q, setQ] = useState("Why is conversion down in the last hour?");
  const [ans, setAns] = useState("");
  const [meta, setMeta] = useState<string>("");
  const cancelRef = useRef<null | (()=>void)>(null);

  function ask() {
    setAns(""); setMeta("");
    cancelRef.current?.();
    cancelRef.current = miraChatStream({ question: q, context: { env: "prod" } }, (chunk) => {
      if (chunk.type === "token") setAns((p)=>p + chunk.data);
      if (chunk.type === "meta") setMeta(chunk.data);
      if (chunk.type === "error") setAns((p)=>p + "\n[error] " + chunk.data);
    });
  }
  useEffect(()=>()=>cancelRef.current?.(),[]);

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-1">Ask MIRA</h1>
        <p className="text-gray-400 text-sm font-body">Get AI-powered insights about your metrics and incidents</p>
      </div>
      <div className="flex gap-3">
        <input 
          value={q} 
          onChange={e=>setQ(e.target.value)} 
          className="flex-1 px-4 py-3 rounded-xl bg-gray-100 dark:bg-gray-800 border-0 focus:ring-2 focus:ring-impact-primary font-body"
          placeholder="Ask about your metrics..."
        />
        <button 
          onClick={ask} 
          className="px-6 py-3 rounded-xl bg-impact-primary text-white hover:bg-impact-primary/90 transition-colors font-body flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd"/>
          </svg>
          Ask
        </button>
      </div>
      <div className="rounded-2xl p-6 bg-gray-100 dark:bg-gray-800 min-h-[200px]">
        <pre className="whitespace-pre-wrap font-body text-sm leading-relaxed">{ans || "Ask MIRA a question about your metrics or incidents..."}</pre>
      </div>
      {meta && <pre className="text-xs opacity-70">{meta}</pre>}
    </div>
  );
}
