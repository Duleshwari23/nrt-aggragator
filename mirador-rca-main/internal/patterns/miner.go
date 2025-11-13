package patterns

import (
	"context"
	"log/slog"
	"sort"
	"strings"
	"time"

	"github.com/miradorstack/mirador-rca/internal/models"
)

// Store abstracts persistence for mined patterns.
type Store interface {
	StorePatterns(ctx context.Context, tenantID string, patterns []models.FailurePattern) error
}

// Miner mines simple frequency-based failure patterns from correlation history.
type Miner struct {
	store  Store
	logger *slog.Logger
}

// NewMiner constructs a Miner; store may be nil for dry runs.
func NewMiner(logger *slog.Logger, store Store) *Miner {
	if logger == nil {
		logger = slog.Default()
	}
	return &Miner{store: store, logger: logger}
}

// Mine analyses correlations and returns aggregated patterns by service.
func (m *Miner) Mine(ctx context.Context, tenantID string, correlations []models.CorrelationResult) ([]models.FailurePattern, error) {
	if len(correlations) == 0 {
		return nil, nil
	}

	serviceStats := make(map[string]*serviceAggregate)
	for _, corr := range correlations {
		seen := make(map[string]struct{})
		for _, service := range corr.AffectedServices {
			agg := ensureAggregate(serviceStats, service)
			agg.count++
			if corr.CreatedAt.After(agg.lastSeen) {
				agg.lastSeen = corr.CreatedAt
			}
		}
		for _, anchor := range corr.RedAnchors {
			agg := ensureAggregate(serviceStats, anchor.Service)
			key := anchor.Selector
			if key == "" {
				continue
			}
			agg.anchorCounts[key]++
			agg.anchorScores[key] += anchor.AnomalyScore
			if corr.CreatedAt.After(agg.lastSeen) {
				agg.lastSeen = corr.CreatedAt
			}
			seen[anchor.Service] = struct{}{}
		}
		for _, service := range corr.AffectedServices {
			agg := ensureAggregate(serviceStats, service)
			agg.totalCorrelations++
		}
	}

	patterns := make([]models.FailurePattern, 0, len(serviceStats))
	for service, agg := range serviceStats {
		if agg.totalCorrelations == 0 {
			continue
		}
		pattern := models.FailurePattern{
			ID:          "pattern-" + service,
			Name:        service + " hotspot",
			Description: "Auto-mined pattern based on historical anomalies",
			Services:    []string{service},
			Prevalence:  float64(agg.count) / float64(len(correlations)),
			LastSeen:    agg.lastSeen,
			Precision:   0.5,
			Recall:      0.5,
		}

		selectors := agg.topSelectors(3)
		for _, sel := range selectors {
			avgScore := agg.anchorScores[sel] / float64(agg.anchorCounts[sel])
			pattern.AnchorTemplates = append(pattern.AnchorTemplates, models.AnchorTemplate{
				Service:    service,
				SignalType: inferSignalType(sel),
				Selector:   sel,
				TypicalLag: 1,
				Threshold:  avgScore,
			})
		}
		patterns = append(patterns, pattern)
	}

	sort.Slice(patterns, func(i, j int) bool {
		return patterns[i].Prevalence > patterns[j].Prevalence
	})

	if m.store != nil && len(patterns) > 0 {
		if err := m.store.StorePatterns(ctx, tenantID, patterns); err != nil {
			m.logger.Warn("pattern store failed", slog.Any("error", err))
		}
	}

	return patterns, nil
}

type serviceAggregate struct {
	count             int
	totalCorrelations int
	lastSeen          time.Time
	anchorCounts      map[string]int
	anchorScores      map[string]float64
}

func ensureAggregate(m map[string]*serviceAggregate, service string) *serviceAggregate {
	if service == "" {
		service = "unknown"
	}
	agg, ok := m[service]
	if !ok {
		agg = &serviceAggregate{
			anchorCounts: make(map[string]int),
			anchorScores: make(map[string]float64),
		}
		m[service] = agg
	}
	return agg
}

func (agg *serviceAggregate) topSelectors(limit int) []string {
	selectors := make([]string, 0, len(agg.anchorCounts))
	for sel := range agg.anchorCounts {
		selectors = append(selectors, sel)
	}
	sort.Slice(selectors, func(i, j int) bool {
		return agg.anchorCounts[selectors[i]] > agg.anchorCounts[selectors[j]]
	})
	if len(selectors) > limit {
		selectors = selectors[:limit]
	}
	return selectors
}

func inferSignalType(selector string) string {
	switch {
	case strings.Contains(selector, "log"):
		return "logs"
	case strings.Contains(selector, "trace"):
		return "traces"
	default:
		return "metrics"
	}
}
