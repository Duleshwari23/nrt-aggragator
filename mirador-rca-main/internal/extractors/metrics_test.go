package extractors

import (
	"testing"
	"time"

	"github.com/miradorstack/mirador-rca/internal/repo"
)

func TestMetricExtractorDetect(t *testing.T) {
	extractor := NewMetricExtractor()

	start := time.Now().Add(-15 * time.Minute)
	series := make([]repo.MetricPoint, 0, 15)
	for i := 0; i < 15; i++ {
		ts := start.Add(time.Duration(i) * time.Minute)
		value := 0.6
		if i > 10 {
			value = 2.5
		}
		series = append(series, repo.MetricPoint{Timestamp: ts, Value: value})
	}

	anomalies := extractor.Detect(series, 1.0)
	if len(anomalies) == 0 {
		t.Fatalf("expected anomalies, got none")
	}
}

func TestLogsExtractorDetect(t *testing.T) {
	extractor := NewLogsExtractor()

	start := time.Now().Add(-10 * time.Minute)
	entries := make([]repo.LogEntry, 0, 5)
	for i := 0; i < 5; i++ {
		ts := start.Add(time.Duration(i) * time.Minute)
		severity := "info"
		count := 10
		if i >= 3 {
			severity = "error"
			count = 30
		}
		entries = append(entries, repo.LogEntry{Timestamp: ts, Severity: severity, Count: count})
	}

	anomalies := extractor.Detect(entries)
	if len(anomalies) == 0 {
		t.Fatalf("expected log anomalies, got none")
	}
}

func TestTracesExtractorDetect(t *testing.T) {
	extractor := NewTracesExtractor()

	start := time.Now().Add(-5 * time.Minute)
	spans := make([]repo.TraceSpan, 0, 5)
	for i := 0; i < 5; i++ {
		dur := 200 * time.Millisecond
		status := "ok"
		if i >= 3 {
			dur = 900 * time.Millisecond
			status = "error"
		}
		spans = append(spans, repo.TraceSpan{
			TraceID:   "trace",
			SpanID:    "span",
			Service:   "svc",
			Operation: "op",
			Duration:  dur,
			Status:    status,
			Timestamp: start.Add(time.Duration(i) * time.Second),
		})
	}

	anomalies := extractor.Detect(spans)
	if len(anomalies) == 0 {
		t.Fatalf("expected trace anomalies, got none")
	}
}
