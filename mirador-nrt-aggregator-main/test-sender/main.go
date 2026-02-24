// Package main sends synthetic OTLP traces, metrics, and logs (as protobuf) to the
// NRT aggregator's OTLP HTTP receiver for E2E testing.
//
// Usage:
//
//	go run test-sender/main.go [--endpoint=http://localhost:8052] [--count=10] [--interval=500ms]
package main

import (
	"bytes"
	"flag"
	"fmt"
	"log"
	"math/rand"
	"net/http"
	"time"

	colllog "go.opentelemetry.io/proto/otlp/collector/logs/v1"
	collmet "go.opentelemetry.io/proto/otlp/collector/metrics/v1"
	colltr "go.opentelemetry.io/proto/otlp/collector/trace/v1"
	com "go.opentelemetry.io/proto/otlp/common/v1"
	logspb "go.opentelemetry.io/proto/otlp/logs/v1"
	met "go.opentelemetry.io/proto/otlp/metrics/v1"
	res "go.opentelemetry.io/proto/otlp/resource/v1"
	tr "go.opentelemetry.io/proto/otlp/trace/v1"
	"google.golang.org/protobuf/proto"
)

var (
	endpoint = flag.String("endpoint", "http://localhost:8052", "OTLP HTTP base URL")
	count    = flag.Int("count", 20, "Number of requests to send per signal type")
	interval = flag.Duration("interval", 200*time.Millisecond, "Interval between requests")
)

var services = []string{"payment-svc", "auth-svc", "order-svc", "user-svc", "inventory-svc", "notification-svc", "gateway-svc", "search-svc"}
var methods = []string{"GET", "POST", "PUT", "DELETE", "PATCH", "GET", "POST", "GET"}
var routes = []string{"/api/v1/pay", "/api/v1/login", "/api/v1/orders", "/api/v1/users", "/api/v1/stock", "/api/v1/notify", "/api/v1/route", "/api/v1/search"}

func main() {
	flag.Parse()
	log.Printf("=== NRT Aggregator E2E Test Sender ===")
	log.Printf("Endpoint: %s", *endpoint)
	log.Printf("Count: %d per signal type, Interval: %s", *count, *interval)

	client := &http.Client{Timeout: 10 * time.Second}

	// Send traces
	log.Println("\n--- Sending OTLP Traces ---")
	for i := 0; i < *count; i++ {
		svc := services[i%len(services)]
		method := methods[i%len(methods)]
		route := routes[i%len(routes)]
		durMs := 10 + rand.Intn(990)
		isError := rand.Float64() < 0.15

		payload := buildTracePayload(svc, method, route, durMs, isError)
		resp, err := sendOTLP(client, *endpoint+"/v1/traces", payload)
		if err != nil {
			log.Printf("  [%d] ERROR sending trace: %v", i, err)
			continue
		}
		status := "OK"
		if isError {
			status = "ERROR"
		}
		log.Printf("  [%d] trace svc=%s method=%s dur=%dms status=%s -> HTTP %d", i, svc, method, durMs, status, resp.StatusCode)
		time.Sleep(*interval)
	}

	// Send metrics
	log.Println("\n--- Sending OTLP Metrics ---")
	for i := 0; i < *count; i++ {
		svc := services[i%len(services)]
		reqCount := 100 + rand.Intn(900)
		errCount := rand.Intn(reqCount / 10)

		payload := buildMetricsPayload(svc, reqCount, errCount)
		resp, err := sendOTLP(client, *endpoint+"/v1/metrics", payload)
		if err != nil {
			log.Printf("  [%d] ERROR sending metrics: %v", i, err)
			continue
		}
		log.Printf("  [%d] metrics svc=%s reqs=%d errs=%d -> HTTP %d", i, svc, reqCount, errCount, resp.StatusCode)
		time.Sleep(*interval)
	}

	// Send logs
	log.Println("\n--- Sending OTLP Logs ---")
	levels := []string{"INFO", "WARN", "ERROR", "DEBUG", "INFO", "ERROR", "WARN", "INFO"}
	messages := []string{
		"Request processed successfully",
		"Connection pool nearing capacity",
		"Failed to process payment: timeout",
		"Cache hit for user session",
		"Health check passed",
	}
	for i := 0; i < *count; i++ {
		svc := services[i%len(services)]
		level := levels[i%len(levels)]
		msg := messages[i%len(messages)]

		payload := buildLogsPayload(svc, level, msg, 3+rand.Intn(8))
		resp, err := sendOTLP(client, *endpoint+"/v1/logs", payload)
		if err != nil {
			log.Printf("  [%d] ERROR sending logs: %v", i, err)
			continue
		}
		log.Printf("  [%d] logs svc=%s level=%s records=%d -> HTTP %d", i, svc, level, 3+i%8, resp.StatusCode)
		time.Sleep(*interval)
	}

	// ---- ANOMALY PHASE: Send outlier data for anomaly-svc ----
	log.Println("\n--- Sending ANOMALOUS Traces (anomaly-svc, ~900ms latency, 80% errors) ---")
	for i := 0; i < 15; i++ {
		durMs := 800 + rand.Intn(400)    // 800-1200ms (far above normal 10-100ms)
		isError := rand.Float64() < 0.80 // 80% error rate

		payload := buildTracePayload("anomaly-svc", "POST", "/api/v1/slow-endpoint", durMs, isError)
		resp, err := sendOTLP(client, *endpoint+"/v1/traces", payload)
		if err != nil {
			log.Printf("  [%d] ERROR: %v", i, err)
			continue
		}
		status := "OK"
		if isError {
			status = "ERROR"
		}
		log.Printf("  [%d] ANOMALY trace svc=anomaly-svc dur=%dms status=%s -> HTTP %d", i, durMs, status, resp.StatusCode)
		time.Sleep(200 * time.Millisecond)
	}

	log.Println("\n--- Sending ANOMALOUS Metrics (anomaly-svc, high errors, low RPS) ---")
	for i := 0; i < 15; i++ {
		reqCount := 5 + rand.Intn(10) // very low RPS (~5-15)
		errCount := reqCount * 8 / 10 // 80% errors

		payload := buildMetricsPayload("anomaly-svc", reqCount, errCount)
		resp, err := sendOTLP(client, *endpoint+"/v1/metrics", payload)
		if err != nil {
			log.Printf("  [%d] ERROR: %v", i, err)
			continue
		}
		log.Printf("  [%d] ANOMALY metrics svc=anomaly-svc reqs=%d errs=%d -> HTTP %d", i, reqCount, errCount, resp.StatusCode)
		time.Sleep(200 * time.Millisecond)
	}

	log.Printf("\n=== Done! Sent %d normal + 30 anomalous per signal type ===", *count)
	log.Printf("Wait for summarizer window to flush, then check Weaviate:")
	log.Printf("  curl -s http://localhost:8080/v1/objects?class=MiradorAggregate | python3 -m json.tool")
}

func sendOTLP(client *http.Client, url string, payload []byte) (*http.Response, error) {
	req, err := http.NewRequest("POST", url, bytes.NewReader(payload))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/x-protobuf")
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	resp.Body.Close()
	return resp, nil
}

func buildTracePayload(svc, method, route string, durMs int, isError bool) []byte {
	now := time.Now()
	startNano := uint64(now.Add(-time.Duration(durMs) * time.Millisecond).UnixNano())
	endNano := uint64(now.UnixNano())

	statusCode := tr.Status_STATUS_CODE_OK
	if isError {
		statusCode = tr.Status_STATUS_CODE_ERROR
	}

	traceID := make([]byte, 16)
	spanID := make([]byte, 8)
	rand.Read(traceID)
	rand.Read(spanID)

	et := &colltr.ExportTraceServiceRequest{
		ResourceSpans: []*tr.ResourceSpans{
			{
				Resource: &res.Resource{
					Attributes: []*com.KeyValue{
						strKV("service.name", svc),
						strKV("deployment.environment", "test"),
					},
				},
				ScopeSpans: []*tr.ScopeSpans{
					{
						Scope: &com.InstrumentationScope{
							Name:    "test-sender",
							Version: "1.0.0",
						},
						Spans: []*tr.Span{
							{
								TraceId:           traceID,
								SpanId:            spanID,
								Name:              fmt.Sprintf("%s %s", method, route),
								Kind:              tr.Span_SPAN_KIND_SERVER,
								StartTimeUnixNano: startNano,
								EndTimeUnixNano:   endNano,
								Status: &tr.Status{
									Code: statusCode,
								},
								Attributes: []*com.KeyValue{
									strKV("http.method", method),
									strKV("http.route", route),
									strKV("http.status_code", func() string {
										if isError {
											return "500"
										}
										return "200"
									}()),
								},
							},
						},
					},
				},
			},
		},
	}

	b, err := proto.Marshal(et)
	if err != nil {
		log.Fatalf("marshal trace: %v", err)
	}
	return b
}

func buildMetricsPayload(svc string, reqCount, errCount int) []byte {
	now := uint64(time.Now().UnixNano())
	start := uint64(time.Now().Add(-30 * time.Second).UnixNano())

	em := &collmet.ExportMetricsServiceRequest{
		ResourceMetrics: []*met.ResourceMetrics{
			{
				Resource: &res.Resource{
					Attributes: []*com.KeyValue{
						strKV("service.name", svc),
					},
				},
				ScopeMetrics: []*met.ScopeMetrics{
					{
						Scope: &com.InstrumentationScope{
							Name:    "test-sender",
							Version: "1.0.0",
						},
						Metrics: []*met.Metric{
							{
								Name: "http_requests_total",
								Data: &met.Metric_Sum{
									Sum: &met.Sum{
										AggregationTemporality: met.AggregationTemporality_AGGREGATION_TEMPORALITY_DELTA,
										IsMonotonic:            true,
										DataPoints: []*met.NumberDataPoint{
											{
												TimeUnixNano:      now,
												StartTimeUnixNano: start,
												Attributes: []*com.KeyValue{
													strKV("status.code", "200"),
												},
												Value: &met.NumberDataPoint_AsDouble{
													AsDouble: float64(reqCount - errCount),
												},
											},
											{
												TimeUnixNano:      now,
												StartTimeUnixNano: start,
												Attributes: []*com.KeyValue{
													strKV("status.code", "500"),
												},
												Value: &met.NumberDataPoint_AsDouble{
													AsDouble: float64(errCount),
												},
											},
										},
									},
								},
							},
							{
								Name: "http_duration_seconds",
								Data: &met.Metric_Histogram{
									Histogram: &met.Histogram{
										AggregationTemporality: met.AggregationTemporality_AGGREGATION_TEMPORALITY_DELTA,
										DataPoints: []*met.HistogramDataPoint{
											{
												TimeUnixNano:      now,
												StartTimeUnixNano: start,
												ExplicitBounds:    []float64{0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10},
												BucketCounts:      []uint64{5, 10, 20, 30, 15, 8, 5, 3, 2, 1, 1, 0},
												Count:             uint64(reqCount),
												Sum:               floatPtr(float64(reqCount) * 0.15),
											},
										},
									},
								},
							},
						},
					},
				},
			},
		},
	}

	b, err := proto.Marshal(em)
	if err != nil {
		log.Fatalf("marshal metrics: %v", err)
	}
	return b
}

func buildLogsPayload(svc, level, msg string, numRecords int) []byte {
	now := uint64(time.Now().UnixNano())

	// Severity number mapping
	sevNum := logspb.SeverityNumber_SEVERITY_NUMBER_INFO
	switch level {
	case "DEBUG":
		sevNum = logspb.SeverityNumber_SEVERITY_NUMBER_DEBUG
	case "INFO":
		sevNum = logspb.SeverityNumber_SEVERITY_NUMBER_INFO
	case "WARN":
		sevNum = logspb.SeverityNumber_SEVERITY_NUMBER_WARN
	case "ERROR":
		sevNum = logspb.SeverityNumber_SEVERITY_NUMBER_ERROR
	case "FATAL":
		sevNum = logspb.SeverityNumber_SEVERITY_NUMBER_FATAL
	}

	records := make([]*logspb.LogRecord, 0, numRecords)
	for j := 0; j < numRecords; j++ {
		traceID := make([]byte, 16)
		spanID := make([]byte, 8)
		rand.Read(traceID)
		rand.Read(spanID)

		records = append(records, &logspb.LogRecord{
			TimeUnixNano:         now - uint64(j)*1000000, // stagger slightly
			ObservedTimeUnixNano: now,
			SeverityNumber:       sevNum,
			SeverityText:         level,
			Body: &com.AnyValue{
				Value: &com.AnyValue_StringValue{
					StringValue: fmt.Sprintf("[%s] %s (request #%d)", level, msg, j),
				},
			},
			TraceId: traceID,
			SpanId:  spanID,
			Attributes: []*com.KeyValue{
				strKV("log.source", "test-sender"),
				strKV("environment", "e2e-test"),
			},
		})
	}

	el := &colllog.ExportLogsServiceRequest{
		ResourceLogs: []*logspb.ResourceLogs{
			{
				Resource: &res.Resource{
					Attributes: []*com.KeyValue{
						strKV("service.name", svc),
						strKV("deployment.environment", "test"),
					},
				},
				ScopeLogs: []*logspb.ScopeLogs{
					{
						Scope: &com.InstrumentationScope{
							Name:    "test-sender",
							Version: "1.0.0",
						},
						LogRecords: records,
					},
				},
			},
		},
	}

	b, err := proto.Marshal(el)
	if err != nil {
		log.Fatalf("marshal logs: %v", err)
	}
	return b
}

func strKV(k, v string) *com.KeyValue {
	return &com.KeyValue{
		Key: k,
		Value: &com.AnyValue{
			Value: &com.AnyValue_StringValue{StringValue: v},
		},
	}
}

func floatPtr(v float64) *float64 { return &v }
