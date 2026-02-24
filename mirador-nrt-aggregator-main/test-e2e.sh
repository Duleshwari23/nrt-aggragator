#!/usr/bin/env bash
# ==========================================================================
# E2E test for mirador-nrt-aggregator
#
# This script:
#   1. Creates the Weaviate schema class
#   2. Starts the NRT aggregator with config-e2e-test.yaml
#   3. Builds & runs the test sender (sends OTLP traces + metrics)
#   4. Waits for the summarizer window to flush (~35s)
#   5. Queries Weaviate to verify objects were created
#   6. Cleans up
# ==========================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

WEAVIATE_URL="http://localhost:8080"
AGG_BINARY="./mirador-nrt-aggregator"
AGG_CONFIG="config-e2e-test.yaml"
AGG_PID=""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

cleanup() {
    echo -e "\n${YELLOW}>>> Cleaning up...${NC}"
    if [[ -n "$AGG_PID" ]] && kill -0 "$AGG_PID" 2>/dev/null; then
        kill "$AGG_PID" 2>/dev/null || true
        wait "$AGG_PID" 2>/dev/null || true
        echo "  Aggregator (PID $AGG_PID) stopped."
    fi
}
trap cleanup EXIT

# ------------------------------------------------------------------
echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}  NRT Aggregator E2E Test${NC}"
echo -e "${CYAN}========================================${NC}"

# Step 0: Pre-checks
echo -e "\n${YELLOW}>>> Step 0: Pre-checks${NC}"

if ! curl -sf "$WEAVIATE_URL/v1/.well-known/ready" >/dev/null 2>&1; then
    echo -e "${RED}ERROR: Weaviate is not running at $WEAVIATE_URL${NC}"
    echo "Start it with: docker compose -f weaviate-docker-compose.yml up -d"
    exit 1
fi
echo "  ✓ Weaviate is running"

if [[ ! -x "$AGG_BINARY" ]]; then
    echo "  Building aggregator binary..."
    go build -o "$AGG_BINARY" ./cmd/mirador-nrt-aggregator/
    echo "  ✓ Built $AGG_BINARY"
else
    echo "  ✓ Aggregator binary exists"
fi

# Step 1: Create Weaviate schema
echo -e "\n${YELLOW}>>> Step 1: Creating Weaviate schema class 'MiradorAggregate'${NC}"

# Delete existing class if any (clean slate)
curl -sf -X DELETE "$WEAVIATE_URL/v1/schema/MiradorAggregate" >/dev/null 2>&1 || true

SCHEMA_PAYLOAD='{
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

HTTP_CODE=$(curl -sf -o /dev/null -w "%{http_code}" -X POST "$WEAVIATE_URL/v1/schema" \
    -H "Content-Type: application/json" \
    -d "$SCHEMA_PAYLOAD")

if [[ "$HTTP_CODE" == "200" ]]; then
    echo "  ✓ Schema class created (HTTP $HTTP_CODE)"
else
    echo -e "${RED}  ✗ Failed to create schema (HTTP $HTTP_CODE)${NC}"
    exit 1
fi

# Step 2: Start the NRT aggregator
echo -e "\n${YELLOW}>>> Step 2: Starting NRT aggregator${NC}"
$AGG_BINARY --config="$AGG_CONFIG" > /tmp/nrt-agg-e2e.log 2>&1 &
AGG_PID=$!
echo "  Started aggregator (PID $AGG_PID), config=$AGG_CONFIG"

# Wait for readiness
echo "  Waiting for aggregator to become ready..."
for i in $(seq 1 30); do
    if curl -sf http://localhost:9090/readyz >/dev/null 2>&1; then
        echo "  ✓ Aggregator is ready (took ~${i}s)"
        break
    fi
    if ! kill -0 "$AGG_PID" 2>/dev/null; then
        echo -e "${RED}  ✗ Aggregator process died. Logs:${NC}"
        cat /tmp/nrt-agg-e2e.log
        exit 1
    fi
    sleep 1
done

if ! curl -sf http://localhost:9090/readyz >/dev/null 2>&1; then
    echo -e "${RED}  ✗ Aggregator failed to become ready after 30s${NC}"
    cat /tmp/nrt-agg-e2e.log
    exit 1
fi

# Step 3: Send test data
echo -e "\n${YELLOW}>>> Step 3: Sending test OTLP data${NC}"
echo "  Building test sender..."
(cd test-sender && go run main.go --endpoint=http://localhost:4318 --count=60 --interval=500ms)

# Step 4: Wait for summarizer window
WAIT_SEC=15
echo -e "\n${YELLOW}>>> Step 4: Waiting ${WAIT_SEC}s for summarizer window to flush...${NC}"
for i in $(seq 1 $WAIT_SEC); do
    printf "\r  %d/%d seconds elapsed" "$i" "$WAIT_SEC"
    sleep 1
done
echo ""

# Step 5: Check Weaviate for results
echo -e "\n${YELLOW}>>> Step 5: Querying Weaviate for exported objects${NC}"

RESULT=$(curl -sf "$WEAVIATE_URL/v1/objects?class=MiradorAggregate&limit=100" 2>/dev/null)

if [[ -z "$RESULT" ]]; then
    echo -e "${RED}  ✗ Failed to query Weaviate${NC}"
    echo "  Aggregator logs:"
    cat /tmp/nrt-agg-e2e.log
    exit 1
fi

OBJ_COUNT=$(echo "$RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('objects',[])))" 2>/dev/null || echo "0")

echo ""
echo -e "${CYAN}========================================${NC}"
if [[ "$OBJ_COUNT" -gt 0 ]]; then
    echo -e "${GREEN}  ✓ SUCCESS: Found $OBJ_COUNT aggregate objects in Weaviate!${NC}"
    echo -e "${CYAN}========================================${NC}"
    echo ""
    echo -e "${YELLOW}Object details:${NC}"
    echo "$RESULT" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for i, obj in enumerate(data.get('objects', [])):
    props = obj.get('properties', {})
    has_vector = len(obj.get('vector', [])) > 0
    vec_status = 'YES' if has_vector else 'NO'
    print('  [%d] service=%-20s  p50=%.4f  p95=%.4f  p99=%.4f  rps=%.4f  err_rate=%.4f  anomaly=%.4f  count=%s  vector=%s' % (
        i+1, props.get('service','?'),
        props.get('p50',0), props.get('p95',0), props.get('p99',0),
        props.get('rps',0), props.get('error_rate',0),
        props.get('anomaly_score',0), props.get('count',0), vec_status))
"
else
    echo -e "${RED}  ✗ FAIL: No objects found in Weaviate${NC}"
    echo -e "${CYAN}========================================${NC}"
    echo ""
    echo "  Aggregator logs (last 30 lines):"
    tail -30 /tmp/nrt-agg-e2e.log
fi

echo ""
echo -e "${YELLOW}Full aggregator logs:${NC} /tmp/nrt-agg-e2e.log"
echo -e "${YELLOW}Raw Weaviate query:${NC}  curl -s $WEAVIATE_URL/v1/objects?class=MiradorAggregate | python3 -m json.tool"
