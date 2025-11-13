#!/usr/bin/env bash
set -euo pipefail

echo ">> Installing Storybook (Vite + React)"
pnpm dlx storybook@latest init --builder @storybook/builder-vite --type react

echo ">> Adding stories for KPI components"
mkdir -p src/components/KpiCard src/components/KpiGrid

cat > src/components/KpiCard/KpiCard.stories.tsx <<'EOF'
import type { Meta, StoryObj } from '@storybook/react';
import { KpiCard } from './index';
import { KpiDef } from '../../lib/kpi-types';

const meta: Meta<typeof KpiCard> = {
  title: 'Mirador/KPI/KpiCard',
  component: KpiCard,
};
export default meta;
type Story = StoryObj<typeof KpiCard>;

const def: KpiDef = {
  id: 'kpi-latency-p95',
  kind: 'tech',
  name: 'Latency p95',
  unit: 'ms',
  format: 'duration',
  query: { type:'metric', ref:'service.latency', aggregator:'p95', range:{from:'-60m', to:'now'} },
  thresholds: [{ when: '>', value: 800, status:'crit' }, { when: '>', value: 500, status:'warn' }],
  tags: ['checkout'], visibility: 'private'
};

export const Default: Story = { args: { def } };
EOF

cat > src/components/KpiGrid/KpiGrid.stories.tsx <<'EOF'
import type { Meta, StoryObj } from '@storybook/react';
import { KpiGrid } from './index';
import type { KpiDef } from '../../lib/kpi-types';

const meta: Meta<typeof KpiGrid> = {
  title: 'Mirador/KPI/KpiGrid',
  component: KpiGrid,
};
export default meta;
type Story = StoryObj<typeof KpiGrid>;

const defs: KpiDef[] = [
  { id:'kpi-conv', kind:'business', name:'Conversion', unit:'%', format:'pct',
    query:{ type:'formula', expr:'orders / sessions * 100', inputs:{
      orders:{ type:'metric', ref:'orders.count', aggregator:'sum', range:{from:'-60m', to:'now'} },
      sessions:{ type:'metric', ref:'sessions.count', aggregator:'sum', range:{from:'-60m', to:'now'} },
    }}, thresholds:[{ when:'<', value:2.0, status:'warn' }], tags:['funnel'], visibility:'private' },
  { id:'kpi-latency', kind:'tech', name:'Latency p95', unit:'ms', format:'duration',
    query:{ type:'metric', ref:'service.latency', aggregator:'p95', range:{from:'-60m', to:'now'} },
    thresholds:[{ when:'>', value:800, status:'crit' }], tags:['checkout'], visibility:'private' },
];

export const Default: Story = { args: { defs } };
EOF

echo
echo ">> Storybook ready."
echo "Run:  pnpm storybook"