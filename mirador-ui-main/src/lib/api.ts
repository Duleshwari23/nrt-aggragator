export type TimeRange = { from: string; to: string };

export type ChatRequest = {
  question: string;
  context?: Record<string, unknown>;
  session_id?: string;
  attachments?: { type: "metric" | "log" | "trace"; ref: string }[];
  preferences?: { temperature?: number; max_tokens?: number };
};
export type ChatChunk = { type: "token" | "meta" | "done" | "error"; data: string };

export function miraChatStream(req: ChatRequest, onChunk: (c: ChatChunk)=>void) {
  const ctrl = new AbortController();
  const url = "/api/v1/mira/chat?stream=1";
  fetch(url, {
    method: "POST",
    body: JSON.stringify(req),
    headers: { "Content-Type": "application/json" },
    signal: ctrl.signal,
  }).then(async (res) => {
    const reader = res.body?.getReader();
    const dec = new TextDecoder();
    let buf = "";
    while (reader) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      // parse very simply event-stream frames
      const frames = buf.split("\n\n");
      // keep the last partial buffer (if any)
      buf = frames.pop() || "";
      for (const f of frames) {
        const t = (f.match(/event:\s*(\w+)/)?.[1] ?? "token") as ChatChunk["type"];
        const d = f.match(/data:\s*([\s\S]*)$/m)?.[1] ?? "";
        onChunk({ type: t, data: d });
      }
    }
  }).catch((e) => onChunk({ type: "error", data: String(e) }));
  return () => ctrl.abort();
}

export type RcTimelinePoint = { t: string; value: number; role: "impact"|"cause" };
export type RcResponse = {
  timeline: RcTimelinePoint[];
  root_cause?: { signal: string; confidence: number };
  explanation: string;
  meta: { model: string; generated_at: string };
};

export async function rcaInvestigate(body: { window: TimeRange; include?: string[] }): Promise<RcResponse> {
  const res = await fetch("/api/v1/rca/investigate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`RCA ${res.status}`);
  return res.json();
}
