#!/usr/bin/env bash
set -euo pipefail

echo ">> Adding express mock server and tooling"
pnpm i -D express cors concurrently

mkdir -p mock
cat > mock/server.js <<'EOF'
const express = require('express');
const cors = require('cors');

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
EOF

# Vite proxy
if [ -f vite.config.ts ]; then
  if ! grep -q "server: { proxy" vite.config.ts; then
    echo ">> Patching vite.config.ts with proxy"
    cat > vite.config.ts <<'EOF'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/v1': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      }
    }
  }
})
EOF
  fi
else
  echo "!! vite.config.ts not found — skipping proxy patch"
fi

# Patch package.json scripts
echo ">> Updating package.json scripts"
node - <<'EOF'
const fs = require('fs');
const p = JSON.parse(fs.readFileSync('package.json','utf8'));
p.scripts = p.scripts || {};
p.scripts["dev:fe"] = "vite";
p.scripts["dev:mock"] = "node mock/server.js";
p.scripts["dev:all"] = "concurrently -k \"pnpm dev:mock\" \"pnpm dev:fe\"";
fs.writeFileSync('package.json', JSON.stringify(p, null, 2));
EOF

echo
echo ">> Mock API ready."
echo "Run:  pnpm dev:all"
echo "Open http://localhost:5173 — Home + KPI Builder work, API requests proxy to the mock."