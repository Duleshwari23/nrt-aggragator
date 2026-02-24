# E2E Test: OTEL Collector → NRT Aggregator → Weaviate

## Prerequisites (one-time)

Make sure Docker services are running:
```bash
cd ~/Documents/ews-sense-platform/mirador-core
sg docker -c "docker compose up -d"
```

Verify services are healthy:
```bash
sg docker -c "docker ps --format 'table {{.Names}}\t{{.Status}}'"
```

You should see: `otel-collector`, `weaviate`, `victoriametrics`, `victorialogs`, `victoriatraces` all running.

---

## Step 1: Build the NRT Aggregator

```bash
cd ~/Documents/ews-sense-platform/mirador-nrt-aggregator-main
go build -o mirador-nrt-aggregator ./cmd/mirador-nrt-aggregator/
```

## Step 2: Delete old Weaviate data (clean slate)

```bash
curl -sf -X DELETE "http://localhost:8080/v1/schema/MiradorAggregate"
```

## Step 3: Create the Weaviate schema

```bash
curl -sf -X POST "http://localhost:8080/v1/schema" \
  -H "Content-Type: application/json" \
  -d '{
    "class": "MiradorAggregate",
    "vectorizer": "none",
    "properties": [
      {"name": "summary",       "dataType": ["text"]},
      {"name": "service",       "dataType": ["text"]},
      {"name": "window_start",  "dataType": ["int"]},
      {"name": "window_end",    "dataType": ["int"]},
      {"name": "p50",           "dataType": ["number"]},
      {"name": "p95",           "dataType": ["number"]},
      {"name": "p99",           "dataType": ["number"]},
      {"name": "rps",           "dataType": ["number"]},
      {"name": "error_rate",    "dataType": ["number"]},
      {"name": "anomaly_score", "dataType": ["number"]},
      {"name": "count",         "dataType": ["int"]},
      {"name": "labels",        "dataType": ["text"]},
      {"name": "locator",       "dataType": ["text"]}
    ]
  }'
```

Expected: `200 OK`

## Step 4: Start the NRT Aggregator

```bash
cd ~/Documents/ews-sense-platform/mirador-nrt-aggregator-main
./mirador-nrt-aggregator --config=config-e2e-test.yaml > /tmp/nrt-agg-e2e.log 2>&1 &
echo "Aggregator PID: $!"
```

Wait for it to be ready:
```bash
curl -sf http://localhost:9090/readyz
```

Expected: success response.

## Step 5: Send test data to OTEL Collector

```bash
cd ~/Documents/ews-sense-platform/mirador-nrt-aggregator-main/test-sender
go run main.go --endpoint=http://localhost:4318 --count=60 --interval=500ms
```

**Data flow:**
```
test-sender → OTEL Collector (:4318) → Victoria* (for VMUI)
                                     → NRT Aggregator (:8052) → Weaviate
```

This sends:
- 60 traces (8 services, various latencies)
- 60 metrics (request counts, error counts)
- 60 log batches (various severity levels)
- 15 **anomalous** traces (anomaly-svc, 800-1200ms latency, 80% errors)
- 15 **anomalous** metrics (anomaly-svc, very low RPS, high error rate)

## Step 6: Wait for summarizer window to flush

```bash
echo "Waiting 15 seconds for 10s window to flush..."
sleep 15
```

## Step 7: Check Weaviate for aggregated objects

```bash
curl -s "http://localhost:8080/v1/objects?class=MiradorAggregate&limit=100" | jq '.objects | length'
```

Expected: **~100 objects**

### View all objects with anomaly scores:
```bash
curl -s "http://localhost:8080/v1/objects?class=MiradorAggregate&limit=100" | \
  jq -r '.objects[] | .properties | "\(.service)\t p99=\(.p99)\t err=\(.error_rate)\t rps=\(.rps)\t anomaly=\(.anomaly_score)\t count=\(.count)"' | \
  sort -t'=' -k5 -rn | head -20
```

## Step 8: Check VictoriaLogs has raw logs

```bash
curl -s 'http://localhost:9428/select/logsql/query?query=*&limit=5' | jq .
```

Expected: raw log records with `body.text`, `severity_text`, `resource.attributes.service.name`

## Step 9: Check VictoriaMetrics has metrics

```bash
curl -s 'http://localhost:8428/api/v1/label/service_name/values' | jq .
```

Expected: list of service names including `payment-svc`, `auth-svc`, `order-svc`, etc.

## Step 10: Verify anomaly scoring

Look for high anomaly scores (>0.85) vs normal scores (~0.79-0.84):
```bash
curl -s "http://localhost:8080/v1/objects?class=MiradorAggregate&limit=100" | \
  jq -r '.objects[] | .properties | select(.anomaly_score > 0.85) | "\(.service)\t anomaly=\(.anomaly_score)\t p99=\(.p99)\t err=\(.error_rate)\t rps=\(.rps)"'
```

**Score interpretation:**
| Score | Meaning |
|-------|---------|
| 0.90+ | Strong anomaly (extreme p99 or 100% errors) |
| 0.85–0.90 | Moderate anomaly (high errors, abnormal rps) |
| 0.83–0.85 | Normal high-volume traffic |
| 0.79 | Low activity / idle window |

## Step 11: Cleanup

```bash
kill $(pgrep -f "mirador-nrt-aggregator") 2>/dev/null
echo "Aggregator stopped"
```

---

## Quick one-liner (automated test)

```bash
cd ~/Documents/ews-sense-platform/mirador-nrt-aggregator-main
bash ./test-e2e.sh
```

This runs all of the above steps automatically.