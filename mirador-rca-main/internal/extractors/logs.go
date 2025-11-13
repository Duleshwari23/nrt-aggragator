package extractors

import (
	"math"
	"sort"
	"strings"
	"time"

	"github.com/miradorstack/mirador-rca/internal/repo"
)

// LogAnomaly represents an error spike or signature surge.
type LogAnomaly struct {
	Timestamp time.Time
	Severity  string
	Count     int
	Score     float64
}

// LogsExtractor spots volume spikes vs baseline.
type LogsExtractor struct{}

// NewLogsExtractor constructs a log anomaly detector.
func NewLogsExtractor() *LogsExtractor {
	return &LogsExtractor{}
}

// Detect identifies log spikes using simple deviation from the rolling median.
func (e *LogsExtractor) Detect(entries []repo.LogEntry) []LogAnomaly {
	if len(entries) == 0 {
		return nil
	}

	counts := make([]float64, 0, len(entries))
	for _, entry := range entries {
		counts = append(counts, float64(entry.Count))
	}

	median := percentile(counts, 0.5)
	mad := meanAbsoluteDeviation(counts, median)
	if mad == 0 {
		mad = 1
	}

	anomalies := make([]LogAnomaly, 0)
	for _, entry := range entries {
		score := math.Abs(float64(entry.Count)-median) / mad
		if score >= 3 {
			anomalies = append(anomalies, LogAnomaly{
				Timestamp: entry.Timestamp,
				Severity:  entry.Severity,
				Count:     entry.Count,
				Score:     score,
			})
		} else if strings.EqualFold(entry.Severity, "error") && entry.Count > int(median*1.3) {
			anomalies = append(anomalies, LogAnomaly{
				Timestamp: entry.Timestamp,
				Severity:  entry.Severity,
				Count:     entry.Count,
				Score:     3,
			})
		}
	}
	return anomalies
}

func percentile(values []float64, p float64) float64 {
	if len(values) == 0 {
		return 0
	}
	sorted := append([]float64(nil), values...)
	sort.Float64s(sorted)
	idx := int(math.Round(p * float64(len(sorted)-1)))
	if idx < 0 {
		idx = 0
	}
	if idx >= len(sorted) {
		idx = len(sorted) - 1
	}
	return sorted[idx]
}

func meanAbsoluteDeviation(values []float64, center float64) float64 {
	if len(values) == 0 {
		return 0
	}
	sum := 0.0
	for _, v := range values {
		sum += math.Abs(v - center)
	}
	return sum / float64(len(values))
}
