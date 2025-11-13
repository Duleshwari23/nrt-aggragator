package extractors

import (
	"math"
	"time"

	"github.com/miradorstack/mirador-rca/internal/repo"
)

// MetricAnomaly captures an anomalous metric sample.
type MetricAnomaly struct {
	Timestamp time.Time
	Value     float64
	Score     float64
	Threshold float64
}

// MetricExtractor detects anomalies using a z-score approach as an STL+ESD stand-in.
type MetricExtractor struct{}

// NewMetricExtractor creates a metrics anomaly detector.
func NewMetricExtractor() *MetricExtractor {
	return &MetricExtractor{}
}

// Detect finds metric anomalies exceeding the provided threshold.
func (e *MetricExtractor) Detect(series []repo.MetricPoint, threshold float64) []MetricAnomaly {
	if len(series) == 0 {
		return nil
	}

	if threshold <= 0 {
		threshold = 2.5
	}

	mean := 0.0
	for _, point := range series {
		mean += point.Value
	}
	mean /= float64(len(series))

	variance := 0.0
	for _, point := range series {
		variance += math.Pow(point.Value-mean, 2)
	}
	variance /= float64(len(series))
	stdDev := math.Sqrt(variance)
	if stdDev == 0 {
		stdDev = 0.01
	}

	anomalies := make([]MetricAnomaly, 0)
	for _, point := range series {
		score := (point.Value - mean) / stdDev
		if score >= threshold {
			anomalies = append(anomalies, MetricAnomaly{
				Timestamp: point.Timestamp,
				Value:     point.Value,
				Score:     score,
				Threshold: threshold,
			})
		}
	}

	return anomalies
}
