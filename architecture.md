# EWS-Sense Platform — Architecture & Code Walkthrough

![Architecture Diagram](/home/npci-admin/.gemini/antigravity/brain/50f0b132-376c-4dc2-9412-2863d168ce8b/architecture_diagram_1771852481138.png)

---

## Complete Data Flow — File by File

### STEP 1: Startup

📁 [main.go](file:///home/npci-admin/Documents/ews-sense-platform/mirador-nrt-aggregator-main/cmd/mirador-nrt-aggregator/main.go)

```go
// Line 51 — Load YAML config
cfg, err := config.Load(*cfgPath)

// Line 100 — Build and start all pipelines
err := pipeline.BuildAndRun(ctx, cfg)
```

📁 [config.go](file:///home/npci-admin/Documents/ews-sense-platform/mirador-nrt-aggregator-main/internal/config/config.go)

Parses `config-e2e-test.yaml` into these structs:
```go
type Config struct {
    Receivers  map[string]ReceiverCfg   // otlphttp
    Processors map[string]ProcessorCfg  // spanmetrics, summarizer, iforest, etc.
    Exporters  map[string]ExporterCfg   // weaviate
    Pipelines  map[string]PipelineCfg   // traces, metrics, logs
}
```

📁 [config-e2e-test.yaml](file:///home/npci-admin/Documents/ews-sense-platform/mirador-nrt-aggregator-main/config-e2e-test.yaml) — defines what runs:
```yaml
pipelines:
  traces:  [otlphttp → spanmetrics → summarizer → iforest → vectorizer → weaviate]
  metrics: [otlphttp → summarizer → iforest → vectorizer → weaviate]
  logs:    [otlphttp → otlplogs → logsum → iforest → vectorizer → weaviate]
```

---

### STEP 2: Pipeline Engine

📁 [pipeline.go](file:///home/npci-admin/Documents/ews-sense-platform/mirador-nrt-aggregator-main/internal/pipeline/pipeline.go)

This is the **orchestrator** — it wires receivers → processors → exporters using Go channels.

**Phase 1 — Start receivers once, fan-out to all pipelines** (line 54–110):
```go
// Line 78: One shared channel per receiver
shared := make(chan model.Envelope, 64)
rr.Start(ctx, shared)   // receiver writes here

// Line 88-109: Fan-out goroutine deep-copies Envelope.Bytes
// to avoid data races when 3 pipelines decode the same protobuf
for env := range shared {
    for i, sub := range subscribers {
        e := env
        if i > 0 {
            cp := make([]byte, len(env.Bytes))
            copy(cp, env.Bytes)      // ← deep copy for pipeline 2, 3
            e.Bytes = cp
        }
        sub.ch <- e   // send to pipeline's input channel
    }
}
```

**Phase 2 — Chain processors via channels** (line 160–253):
```go
// Line 173: Convert Envelope channel → any channel
var inAny <-chan any = envelopeToAny(rxOut)

// Line 174-186: Chain each processor
for _, pkey := range pl.Processors {
    outAny := make(chan any)
    pp.Start(ctx, inAny, outAny)   // processor reads in, writes out
    inAny = outAny                  // output becomes next input
}

// Line 189-198: Bridge final any → Aggregate for exporter
for v := range inAny {
    if a, ok := v.(model.Aggregate); ok {
        finalAgg <- a
    }
}
```

**Visual:**
```
Envelope ch ──► [spanmetrics] ──► [summarizer] ──► [iforest] ──► [vectorizer] ──► Aggregate ch ──► [weaviate]
          any ch            any ch           any ch           any ch
```

---

### STEP 3: Receiver — HTTP Data Ingestion

📁 [otlphttp.go](file:///home/npci-admin/Documents/ews-sense-platform/mirador-nrt-aggregator-main/internal/receivers/otlphttp/otlphttp.go)

Listens on `:8052` for OTEL Collector data:

```go
// Line 150-159: Register 3 HTTP endpoints
mux.HandleFunc("/v1/traces",  ➜ handleOTLP(out, "traces"))
mux.HandleFunc("/v1/metrics", ➜ handleOTLP(out, "metrics"))
mux.HandleFunc("/v1/logs",    ➜ handleOTLP(out, "json_logs"))

// Line 214-259: handleOTLP — read body, wrap in Envelope, send to channel
body, _ := io.ReadAll(reader)          // raw protobuf bytes
out <- model.Envelope{
    Kind:   kind,      // "traces" | "metrics" | "json_logs"
    Bytes:  body,      // raw protobuf
    TSUnix: time.Now().Unix(),
}
w.WriteHeader(http.StatusOK)
```

📁 [model.go](file:///home/npci-admin/Documents/ews-sense-platform/mirador-nrt-aggregator-main/internal/model/model.go) — the Envelope struct:
```go
type Envelope struct {
    Kind   string            // "traces", "metrics", "json_logs", "prom_rw"
    Bytes  []byte            // raw protobuf or JSON payload
    Attrs  map[string]string // optional metadata
    TSUnix int64             // arrival timestamp
}
```

---

### STEP 4: Traces Pipeline — spanmetrics (Traces → Metrics)

📁 [spanmetrics.go](file:///home/npci-admin/Documents/ews-sense-platform/mirador-nrt-aggregator-main/internal/processors/spanmetrics/spanmetrics.go)

**What:** Converts OTLP trace spans into RED (Rate, Error, Duration) metrics.

```go
// Line 86-116: Start() — reads Envelope, skips non-trace kinds
for v := range in {
    env := v.(model.Envelope)
    if env.Kind != model.KindTraces {
        out <- env   // pass-through non-traces (metrics, logs)
        continue
    }
    // Convert traces → metrics
    rms := p.tracesToResourceMetrics(env.Bytes)  // ← protobuf decode
    // Re-encode as OTLP Metrics protobuf
    out <- model.Envelope{Kind: "metrics", Bytes: metricsBytes}
}

// Line 118-172: tracesToResourceMetrics() — for each span:
//   1. Extract service.name, http.method, http.route from attributes
//   2. Compute duration = (endTime - startTime) in seconds
//   3. Check if error span (status code or error events)
//   4. Build 3 metrics per span:
//      - requests_total (counter)
//      - errors_total (counter, if error)
//      - duration_histogram (histogram with latency buckets)
```

**Output:** Envelope → with `Kind:"metrics"` protobuf (not traces anymore)

---

### STEP 5: Traces & Metrics Pipeline — summarizer (Metrics → Aggregate)

📁 [summarizer.go](file:///home/npci-admin/Documents/ews-sense-platform/mirador-nrt-aggregator-main/internal/processors/summarizer/summarizer.go)

**What:** Aggregates OTLP Metrics into fixed **time windows** using t-digest for percentiles.

```go
// Line 79-123: Start() — time-window loop
ticker := time.NewTicker(time.Duration(p.windowSec) * time.Second)
for {
    select {
    case v := <-in:
        env := v.(model.Envelope)
        winStart := trunc(env.TSUnix, int64(p.windowSec))
        p.consumeOTLPMetrics(env.Bytes, winStart)   // ← accumulate
    case <-ticker.C:
        p.flush(out, winStart)   // ← emit Aggregates every 10s
    }
}

// Line 164-190: consumeOTLPMetrics() — decode protobuf
//   For each metric in the OTLP payload:
//   - "requests_total" (Sum) → increment svc.req counter
//   - "errors_total" (Sum) → increment svc.err counter  
//   - "duration_histogram" (Histogram) → add to t-digest

// Line 35-43: Per-service accumulator
type svc struct {
    td    *tdigest.TDigest   // latency percentile tracker
    req   float64            // total requests
    ok    float64            // successful requests
    err   float64            // error requests
    count uint64             // sample count
}

// Line 125-160: flush() — emit one Aggregate per service
for svcName, st := range p.svcs {
    rps := st.req / float64(p.windowSec)
    errRate := st.err / max(st.req, 1)
    out <- model.Aggregate{
        Service:     svcName,
        WindowStart: winStart,
        WindowEnd:   winStart + int64(p.windowSec),
        Count:       st.count,
        RPS:         rps,                      // requests per second
        ErrorRate:   errRate,                   // fraction [0-1]
        P50:         st.td.Quantile(0.50),     // from t-digest
        P95:         st.td.Quantile(0.95),     // from t-digest
        P99:         st.td.Quantile(0.99),     // from t-digest
        SummaryText: buildSummaryText(svcName, rps, errRate, st.count),
    }
}
```

**Key data transformation:**
```
OTLP Metrics protobuf  ──►  model.Aggregate {
                                Service: "payment-svc"
                                P50: 0.05, P95: 1.0, P99: 5.05
                                RPS: 156.8
                                ErrorRate: 0.063
                                Count: 1768
                            }
```

---

### STEP 6: Logs Pipeline — otlplogs (OTLP Logs → JSON)

📁 [otlplogs.go](file:///home/npci-admin/Documents/ews-sense-platform/mirador-nrt-aggregator-main/internal/processors/otlplogs/otlplogs.go)

**What:** Flattens OTLP Log protobuf into JSON log records.

```go
// Start() — reads Envelope, skips non-log kinds
for v := range in {
    env := v.(model.Envelope)
    if env.Kind != model.KindJSONLogs { continue }
    
    // Decode OTLP LogsServiceRequest protobuf
    // For each LogRecord:
    //   - Extract: timestamp, severity_text, body, trace_id, span_id
    //   - Flatten resource attributes (service.name → "service")
    //   - Flatten log attributes
    //   - Emit as JSON Envelope:
    out <- model.Envelope{
        Kind:  "json_logs",
        Bytes: jsonBytes,   // {"service":"user-svc","severity":"ERROR","body":"..."}
    }
}
```

---

### STEP 7: Logs Pipeline — logsum (JSON Logs → Aggregate)

📁 [logsum.go](file:///home/npci-admin/Documents/ews-sense-platform/mirador-nrt-aggregator-main/internal/processors/logsum/logsum.go)

**What:** Aggregates JSON log records into per-service windows (like summarizer, but for logs).

```go
// Similar time-window approach as summarizer:
// - Counts total log records per service
// - Counts error log records (severity = ERROR | FATAL)
// - Computes error_rate
// - Tracks top-K message patterns
// Emits:
out <- model.Aggregate{
    Service:     "user-svc",
    Count:       18,
    ErrorRate:   0.0,         // no errors
    RPS:         0.9,         // logs per second
    SummaryText: "logs summary: service=user-svc total=18 error_rate=0.0000",
}
```

---

### STEP 8: iforest — Anomaly Detection (Aggregate → Aggregate + score)

📁 [iforest.go](file:///home/npci-admin/Documents/ews-sense-platform/mirador-nrt-aggregator-main/internal/processors/iforest/iforest.go)

**What:** Runs each Aggregate through an **Isolation Forest** model and assigns anomaly score.

```go
// Start() — reads Aggregate, adds anomaly score
for v := range in {
    a := v.(model.Aggregate)
    x := p.featuresOf(a)        // extract [p99, error_rate, rps]
    a.AnomalyScore = p.score(x) // run through forest
    out <- a
}

// featuresOf() — maps config features to vector
func (p *processor) featuresOf(a model.Aggregate) []float64 {
    // features: ["p99","error_rate","rps"]
    // returns: [0.005, 1.0, 0.9]
}

// score() — traverse all trees, compute average path length
func (p *processor) score(x []float64) float64 {
    if f == nil { return 0.0 }   // no model loaded → skip
    
    var totalDepth float64
    for _, tree := range f.Trees {
        depth := p.pathLength(tree, x, 0)  // walk one tree
        totalDepth += depth
    }
    avgDepth := totalDepth / float64(len(f.Trees))
    
    // Anomaly score formula:
    return math.Exp(-avgDepth / c(n))
    // c(n) = 2*(ln(n-1) + γ) − 2*(n-1)/n  (expected BST path length)
}
```

**The model file:**
📁 [iforest-model.json](file:///home/npci-admin/Documents/ews-sense-platform/mirador-nrt-aggregator-main/iforest-model.json) — 10 trees with split nodes:
```json
{
  "trees": [
    { "nodes": [
        {"f": 0, "t": 0.2, "l": 1, "r": 2},   // if x[0](p99) <= 0.2, go left
        {"f": 1, "t": 0.1, "l": 3, "r": 4},   // if x[1](error_rate) <= 0.1, go left
        {"leaf": true, "size": 2},               // ISOLATED! depth=2
        ...
    ]}
  ]
}
```

**Example calculation:**
```
Input:  Aggregate{p99=0.005, error_rate=1.0, rps=0.9}
Vector: [0.005, 1.0, 0.9]

Tree 0: p99=0.005 ≤ 0.2 → L → err=1.0 > 0.1 → R → leaf (depth=2)
Tree 1: err=1.0 > 0.08 → R → leaf (depth=1)
...
Average depth = 1.5
Score = e^(-1.5 / 10.24) = 0.8638
```

---

### STEP 9: vectorizer — Embedding Generation (Aggregate → Aggregate + vector)

📁 [vectorizer.go](file:///home/npci-admin/Documents/ews-sense-platform/mirador-nrt-aggregator-main/internal/processors/vectorizer/vectorizer.go)

**What:** Generates a vector embedding from the Aggregate for Weaviate semantic search.

```go
// Line 211-248: Start() — reads Aggregate, adds vector
for v := range in {
    a := v.(model.Aggregate)
    
    // Build text representation based on signal type
    text := p.defaultSummary(a)  // "payment-svc p50=0.05 p95=1.0 ..."
    
    // Generate embedding vector
    vec := p.embedText(ctx, text)   // mode: "hash" | "ollama" | "pca"
    a.Vector = vec
    out <- a
}

// embedHashing() — FNV hash-based embedding (used in E2E test)
// Tokenizes summary text → n-grams → FNV hash each → populate 384-dim vector
// Fast, no external dependencies, good for testing

// embedOllama() — call Ollama LLM API for real semantic embeddings
// POST http://ollama:11434/api/embeddings {"model":"...", "prompt":"..."}
// Returns high-quality dense vector for true semantic similarity
```

---

### STEP 10: weaviate exporter (Aggregate → Weaviate DB)

📁 [weaviate.go](file:///home/npci-admin/Documents/ews-sense-platform/mirador-nrt-aggregator-main/internal/exporters/weaviate/weaviate.go)

**What:** Writes each Aggregate as a Weaviate object via REST API.

```go
// Line 46-59: Start() — consume Aggregates from channel
for a := range in {
    e.upsert(ctx, a)
}

// Line 63-116: upsert() — POST to Weaviate
func (e *Exporter) upsert(a model.Aggregate) {
    // 1. Generate deterministic UUID from template
    rawID := "payment-svc:1771837020:summary service=payment-svc ..."
    id := toUUID5(rawID)   // SHA1 → UUID v5
    
    // 2. Build JSON body
    body := {
        "class":  "MiradorAggregate",
        "id":     "087de675-e605-5220-a9e3-e79204fecd45",
        "vector": [0.1, 0.3, ...],     // from vectorizer
        "properties": {
            "service":       "payment-svc",
            "p50":           0.05,
            "p95":           1.0,
            "p99":           5.05,
            "rps":           156.8,
            "error_rate":    0.063,
            "anomaly_score": 0.8389,    // from iforest
            "count":         1768,
            "summary":       "summary service=payment-svc ...",
            "window_start":  1771837020,
            "window_end":    1771837030,
        }
    }
    
    // 3. POST to Weaviate
    POST http://localhost:8080/v1/objects  ← body
    // 409/422 = already exists (idempotent)
}
```

---

## End-to-End Data Journey — Single Trace

Here's one trace's journey through the entire system:

```
 ┌─ Test Sender ─────────────────────────────────────────┐
 │  POST /v1/traces → OTEL Collector (:4318)             │
 │  Protobuf: span{service=payment-svc, dur=50ms, OK}    │
 └───────────────────────────────────────────────────────-┘
                         │
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼
   VictoriaTraces   VictoriaMetrics   NRT Aggregator (:8052)
   (raw span)       (via spanmetrics   │
                     connector)        │
                                       ▼
                              ┌─ otlphttp.go ───────────────┐
                              │ Envelope{Kind:"traces",      │
                              │   Bytes: <protobuf>}         │
                              └─────────────┬────────────────┘
                                            ▼
                              ┌─ spanmetrics.go ─────────────┐
                              │ Decode span, extract:         │
                              │   service = "payment-svc"     │
                              │   duration = 0.050s           │
                              │   status = OK                 │
                              │ Build: requests_total=1       │
                              │        duration_histogram     │
                              │ → Envelope{Kind:"metrics"}    │
                              └─────────────┬────────────────┘
                                            ▼
                              ┌─ summarizer.go ──────────────┐
                              │ Accumulate in 10s window:     │
                              │   t-digest.Add(0.050)         │
                              │   req += 1                    │
                              │ On window flush:               │
                              │   P50=0.05, P95=1.0, P99=5.05│
                              │   RPS=156.8, ErrorRate=0.063  │
                              │ → model.Aggregate             │
                              └─────────────┬────────────────┘
                                            ▼
                              ┌─ iforest.go ─────────────────┐
                              │ features = [5.05, 0.063, 156.8]
                              │ Walk 10 trees → avg depth=4.2 │
                              │ score = e^(-4.2/10.24) = 0.84│
                              │ → Aggregate.AnomalyScore=0.84│
                              └─────────────┬────────────────┘
                                            ▼
                              ┌─ vectorizer.go ──────────────┐
                              │ text = "payment-svc p50=0.05.."
                              │ FNV hash → 384-dim vector     │
                              │ → Aggregate.Vector=[0.1,...]  │
                              └─────────────┬────────────────┘
                                            ▼
                              ┌─ weaviate.go ────────────────┐
                              │ POST /v1/objects              │
                              │ ID = UUID5("payment-svc:...") │
                              │ → Stored in Weaviate DB!      │
                              └──────────────────────────────┘
```

---

## Key File Index

| File | Path | Role |
|------|------|------|
| main.go | [main.go](file:///home/npci-admin/Documents/ews-sense-platform/mirador-nrt-aggregator-main/cmd/mirador-nrt-aggregator/main.go) | Entry point, config load, pipeline start |
| config.go | [config.go](file:///home/npci-admin/Documents/ews-sense-platform/mirador-nrt-aggregator-main/internal/config/config.go) | YAML parsing into typed structs |
| pipeline.go | [pipeline.go](file:///home/npci-admin/Documents/ews-sense-platform/mirador-nrt-aggregator-main/internal/pipeline/pipeline.go) | Orchestrator — wires receivers/processors/exporters via channels |
| model.go | [model.go](file:///home/npci-admin/Documents/ews-sense-platform/mirador-nrt-aggregator-main/internal/model/model.go) | Core data types: `Envelope` and `Aggregate` |
| otlphttp.go | [otlphttp.go](file:///home/npci-admin/Documents/ews-sense-platform/mirador-nrt-aggregator-main/internal/receivers/otlphttp/otlphttp.go) | HTTP receiver — listens for /v1/{traces,metrics,logs} |
| spanmetrics.go | [spanmetrics.go](file:///home/npci-admin/Documents/ews-sense-platform/mirador-nrt-aggregator-main/internal/processors/spanmetrics/spanmetrics.go) | Converts trace spans → RED metrics |
| summarizer.go | [summarizer.go](file:///home/npci-admin/Documents/ews-sense-platform/mirador-nrt-aggregator-main/internal/processors/summarizer/summarizer.go) | Time-window aggregation with t-digest |
| otlplogs.go | [otlplogs.go](file:///home/npci-admin/Documents/ews-sense-platform/mirador-nrt-aggregator-main/internal/processors/otlplogs/otlplogs.go) | Flattens OTLP Log protobuf → JSON |
| logsum.go | [logsum.go](file:///home/npci-admin/Documents/ews-sense-platform/mirador-nrt-aggregator-main/internal/processors/logsum/logsum.go) | Aggregates JSON logs into windows |
| iforest.go | [iforest.go](file:///home/npci-admin/Documents/ews-sense-platform/mirador-nrt-aggregator-main/internal/processors/iforest/iforest.go) | Isolation Forest anomaly scoring |
| vectorizer.go | [vectorizer.go](file:///home/npci-admin/Documents/ews-sense-platform/mirador-nrt-aggregator-main/internal/processors/vectorizer/vectorizer.go) | Generates vector embeddings (hash/ollama/PCA) |
| weaviate.go | [weaviate.go](file:///home/npci-admin/Documents/ews-sense-platform/mirador-nrt-aggregator-main/internal/exporters/weaviate/weaviate.go) | REST API export to Weaviate DB |
