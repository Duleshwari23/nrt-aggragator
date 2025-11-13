package extractors

import (
	"math"

	"github.com/miradorstack/mirador-rca/internal/repo"
)

// TraceAnomaly captures an anomalous span within a trace.
type TraceAnomaly struct {
	Span   repo.TraceSpan
	Score  float64
	Median float64
}

// TracesExtractor detects slow/error spans using a simple z-score heuristic.
type TracesExtractor struct {
	threshold float64
}

// NewTracesExtractor constructs a TracesExtractor with default threshold (2.0).
func NewTracesExtractor() *TracesExtractor {
	return &TracesExtractor{threshold: 2.0}
}

// Detect returns spans whose duration significantly exceeds the population mean.
func (e *TracesExtractor) Detect(spans []repo.TraceSpan) []TraceAnomaly {
	if len(spans) == 0 {
		return nil
	}

	durations := make([]float64, len(spans))
	for i, span := range spans {
		durations[i] = span.Duration.Seconds()
	}

	mean := mean(durations)
	std := stdDev(durations, mean)
	if std == 0 {
		std = 0.01
	}

	anomalies := make([]TraceAnomaly, 0)
	for i, span := range spans {
		score := (durations[i] - mean) / std
		if score >= e.threshold || span.Status == "error" {
			anomalies = append(anomalies, TraceAnomaly{
				Span:   span,
				Score:  score,
				Median: mean,
			})
		}
	}

	return anomalies
}

func mean(values []float64) float64 {
	total := 0.0
	for _, v := range values {
		total += v
	}
	return total / float64(len(values))
}

func stdDev(values []float64, mean float64) float64 {
	sum := 0.0
	for _, v := range values {
		diff := v - mean
		sum += diff * diff
	}
	variance := sum / float64(len(values))
	return math.Sqrt(variance)
}
