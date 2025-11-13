import { z } from "zod";

const zRange = z.object({ from: z.string(), to: z.string() });

const zMetric = z.object({
  type: z.literal("metric"),
  ref: z.string().min(1),
  aggregator: z.enum(["avg", "sum", "p95", "p99"]).optional(),
  range: zRange,
});

const zFormula: z.ZodType<any> = z.lazy(() =>
  z.object({
    type: z.literal("formula"),
    expr: z.string().regex(/^[0-9a-zA-Z_\s\.\+\-\*\/\(\)]+$/, "Invalid formula expression"),
    inputs: z.record(z.string(), z.union([zMetric, zFormula])),
  })
);

const zThreshold = z.object({
  when: z.enum([">", ">=", "<", "<=", "between", "outside"]),
  value: z.union([z.number(), z.tuple([z.number(), z.number()])]),
  status: z.enum(["ok", "warn", "crit"]),
});

export const zKpiDef = z.object({
  id: z.string().min(1),
  kind: z.enum(["business", "tech"]),
  name: z.string().min(1),
  unit: z.string().optional(),
  format: z.enum(["number", "pct", "currency", "duration"]).optional(),
  query: z.union([zMetric, zFormula]),
  thresholds: z.array(zThreshold).optional(),
  tags: z.array(z.string()).optional(),
  sparkline: z.object({ windowMins: z.number().int().positive() }).optional(),
  ownerUserId: z.string().optional(),
  visibility: z.enum(["private", "team", "org"]).optional(),
  layout: z
    .object({
      w: z.number().int().positive(),
      h: z.number().int().positive(),
      x: z.number().int().optional(),
      y: z.number().int().optional(),
    })
    .optional(),
});

export type ZKpiDef = z.infer<typeof zKpiDef>;
