package metrics

import (
	"time"

	"github.com/prometheus/client_golang/prometheus"
)

const (
	// OutcomeSuccess labels successful investigations.
	OutcomeSuccess = "success"
	// OutcomeError labels failed investigations (pipeline or dependency issues).
	OutcomeError = "error"
)

var (
	investigationsTotal = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Namespace: "mirador_rca",
			Name:      "investigations_total",
			Help:      "Total number of investigations handled, partitioned by outcome.",
		},
		[]string{"outcome"},
	)

	investigationDurationSeconds = prometheus.NewHistogram(
		prometheus.HistogramOpts{
			Namespace: "mirador_rca",
			Name:      "investigation_seconds",
			Help:      "Investigation latency in seconds.",
			Buckets:   []float64{0.25, 0.5, 1, 2, 3, 4, 5, 6, 8, 10},
		},
	)
)

// Register attaches mirador-rca collectors to the supplied Prometheus registerer.
func Register(reg prometheus.Registerer) error {
	collectors := []prometheus.Collector{
		investigationsTotal,
		investigationDurationSeconds,
	}

	for _, collector := range collectors {
		if err := reg.Register(collector); err != nil {
			if _, ok := err.(prometheus.AlreadyRegisteredError); ok {
				continue
			}
			return err
		}
	}
	return nil
}

// ObserveInvestigation records an investigation duration and outcome label.
func ObserveInvestigation(duration time.Duration, outcome string) {
	label := outcome
	if label != OutcomeError {
		label = OutcomeSuccess
	}
	investigationsTotal.WithLabelValues(label).Inc()
	if duration < 0 {
		duration = 0
	}
	investigationDurationSeconds.Observe(duration.Seconds())
}
