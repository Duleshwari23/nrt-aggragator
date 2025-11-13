import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

function spark(base) {
  const out = [];
  const now = Date.now();
  for (let i=30;i>0;i--) out.push([now - i*60000, base + Math.sin(i/3)*5]);
  return out;
}

// Metrics mock
app.post('/api/v1/metrics/query', (req, res) => {
  const { ref = '', aggregator = 'avg' } = req.body || {};
  const isConv = String(ref).toLowerCase().includes('conversion');
  const base = aggregator.startsWith('p') ? 700 : 100;
  const value = isConv ? 2.1 : base + Math.random()*50;
  res.json({ value, spark: spark(value) });
});

// MIRA chat (SSE) mock
app.post('/api/v1/mira/chat', (req, res) => {
  if (req.query.stream === '1') {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    const chunks = [
      { event:'token', data:'Conversion ' },
      { event:'token', data:'dropped ~14% ' },
      { event:'token', data:'after 08:56. ' },
      { event:'token', data:'Earliest degrading: DB pool exhaustion → Payment API 5xx.' },
      { event:'meta',  data: JSON.stringify({ model:'local-llm@q4', confidence:0.78, rcaId:'rca_mock_1' }) },
      { event:'done',  data: JSON.stringify({ usage:{ prompt_tokens:120, completion_tokens:60 }}) },
    ];
    let i = 0;
    const iv = setInterval(() => {
      const c = chunks[i++];
      if (!c) { clearInterval(iv); return; }
      res.write(`event: ${c.event}\n`);
      res.write(`data: ${c.data}\n\n`);
      if (c.event === 'done') { /* keep open briefly */ setTimeout(()=>res.end(), 200); }
    }, 250);
  } else {
    res.json({
      answer: 'Conversion dipped ~14% due to DB pool exhaustion in Payment API.',
      meta: { model:'local-llm@q4', confidence:0.78, rcaId:'rca_mock_1' }
    });
  }
});

const PORT = process.env.MOCK_PORT || 8787;
app.listen(PORT, () => console.log(`Mock API on http://localhost:${PORT}`));

// RCA investigate mock
app.post('/api/v1/rca/investigate', (req, res) => {
  const now = Date.now();
  const mk = (i, role) => ({
    t: new Date(now - (60 - i) * 60_000).toISOString(),
    value: role === 'impact' ? 100 + Math.sin(i/6)*10 + (i>40?15:0) : 50 + Math.cos(i/5)*8 + (i>38?12:0),
    role
  });
  const timeline = Array.from({length:60}, (_,i)=>[mk(i,'impact'), mk(i,'cause')]).flat();
  res.json({
    timeline,
    root_cause: { signal: "db.pool.exhaustion", confidence: 0.78 },
    explanation: "Conversion dipped after 08:56. Earliest degrading signal: DB pool exhaustion → Payment API errors.",
    meta: { model: "local-llm@q4", generated_at: new Date().toISOString() }
  });
});

// ----- In-memory KPI defs DB (mock) -----
const __KPI_DEFS_DB__ = new Map();
// Seed a couple of org-level KPIs for demo
__KPI_DEFS_DB__.set("kpi-seed-conv", {
  id: "kpi-seed-conv",
  kind: "business",
  name: "Conversion",
  unit: "%",
  format: "pct",
  query: {
    type: "formula",
    expr: "orders / sessions * 100",
    inputs: {
      orders: { type: "metric", ref: "orders.count", aggregator: "sum", range: { from: "-60m", to: "now" } },
      sessions:{ type: "metric", ref: "sessions.count", aggregator: "sum", range: { from: "-60m", to: "now" } }
    }
  },
  thresholds: [{ when: "<", value: 2.0, status: "warn" }],
  tags: ["funnel"], visibility: "org"
});

// ----- Batch metrics endpoint -----
app.post('/api/v1/metrics/batch', (req, res) => {
  const { items = [] } = req.body || {};
  // items: [{ id, query: KpiQuery }]
  function spark(base) {
    const out = [];
    const now = Date.now();
    for (let i=30;i>0;i--) out.push([now - i*60000, base + Math.sin(i/3)*5]);
    return out;
  }
  function metricVal(q) {
    const base = (q.aggregator || "").startsWith("p") ? 700 : 100;
    const isConv = String(q.ref||"").toLowerCase().includes("conversion");
    return isConv ? 2.1 : base + Math.random()*50;
  }
  function solve(q) {
    if (q.type === "metric") {
      const v = metricVal(q);
      return { value: v, spark: spark(v) };
    }
    // formula
    const inputs = {};
    for (const k of Object.keys(q.inputs||{})) inputs[k] = solve(q.inputs[k]).value;
    const safe = q.expr.replace(/[A-Za-z_][A-Za-z0-9_]*/g, (m) => String(inputs[m] ?? 0));
    const value = Function(`"use strict"; return (${safe});`)();
    return { value };
  }
  const out = items.map((it) => {
    try {
      const { value, spark } = solve(it.query);
      return { id: it.id, value, spark };
    } catch (e) {
      return { id: it.id, error: String(e) };
    }
  });
  res.json({ results: out });
});

// ----- KPI defs CRUD (very lightweight mock) -----
app.get('/api/v1/kpi/defs', (req, res) => {
  const defs = Array.from(__KPI_DEFS_DB__.values());
  res.json({ defs });
});
app.post('/api/v1/kpi/defs', (req, res) => {
  const def = req.body || {};
  if (!def.id) return res.status(400).json({ error: "id required" });
  __KPI_DEFS_DB__.set(def.id, def);
  res.json(def);
});
app.put('/api/v1/kpi/defs/:id', (req, res) => {
  const id = req.params.id;
  const def = req.body || {};
  if (!__KPI_DEFS_DB__.has(id)) return res.status(404).json({ error: "not found" });
  __KPI_DEFS_DB__.set(id, def);
  res.json(def);
});
app.delete('/api/v1/kpi/defs/:id', (req, res) => {
  const id = req.params.id;
  __KPI_DEFS_DB__.delete(id);
  res.json({ ok: true });
});
