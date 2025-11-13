package engine

import (
	"log/slog"
	"strings"
	"time"

	"github.com/miradorstack/mirador-rca/internal/models"
	"github.com/miradorstack/mirador-rca/internal/repo"
)

// CausalityEngine applies lightweight causality heuristics to validate root causes.
type CausalityEngine struct {
	logger *slog.Logger
}

// CausalityResult captures the outcome of a causality evaluation.
type CausalityResult struct {
	Score            float64
	Notes            []string
	SuggestedService string
}

// NewCausalityEngine constructs a CausalityEngine.
func NewCausalityEngine(logger *slog.Logger) *CausalityEngine {
	if logger == nil {
		logger = slog.Default()
	}
	return &CausalityEngine{logger: logger}
}

// Evaluate inspects upstream edges and timeline ordering to derive a causality score in [0,1].
func (e *CausalityEngine) Evaluate(rootService string, timeline []models.TimelineEvent, edges []repo.ServiceGraphEdge) CausalityResult {
	result := CausalityResult{}
	if rootService == "" || len(edges) == 0 || len(timeline) == 0 {
		return result
	}

	rootTime := rootEventTime(rootService, timeline)
	if rootTime.IsZero() {
		rootTime = timeline[0].Time
	}

	totalUpstream := 0
	supporting := 0

	var suggested repo.ServiceGraphEdge
	for _, edge := range edges {
		if !strings.EqualFold(edge.Target, rootService) {
			continue
		}
		totalUpstream++
		srcTime := firstEventTime(edge.Source, timeline)
		if srcTime.IsZero() {
			if edge.ErrorRate > 0 {
				supporting++
				result.Notes = append(result.Notes, edge.Source+" error rate influencing "+rootService)
				if !suggestedEdgeSet(suggested) || edge.ErrorRate > suggested.ErrorRate {
					suggested = edge
				}
			}
			continue
		}
		if srcTime.Before(rootTime) {
			supporting++
			result.Notes = append(result.Notes, edge.Source+" precedes "+rootService)
			if !suggestedEdgeSet(suggested) || edge.CallRate > suggested.CallRate {
				suggested = edge
			}
		} else {
			result.Notes = append(result.Notes, edge.Source+" occurs after root cause")
		}
	}

	if totalUpstream == 0 {
		return result
	}

	score := float64(supporting) / float64(totalUpstream)
	if score < 0 {
		score = 0
	}
	if score > 1 {
		score = 1
	}
	result.Score = clamp(0.4+0.6*score, 0, 1)
	if suggestedEdgeSet(suggested) {
		result.SuggestedService = suggested.Source
	}
	return result
}

func suggestedEdgeSet(edge repo.ServiceGraphEdge) bool {
	return edge.Source != "" || edge.Target != ""
}

func rootEventTime(service string, events []models.TimelineEvent) time.Time {
	for _, event := range events {
		if strings.EqualFold(event.Service, service) {
			return event.Time
		}
	}
	return time.Time{}
}

func firstEventTime(service string, events []models.TimelineEvent) time.Time {
	for _, event := range events {
		if strings.EqualFold(event.Service, service) {
			return event.Time
		}
	}
	return time.Time{}
}
