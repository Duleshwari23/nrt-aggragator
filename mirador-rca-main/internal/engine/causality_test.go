package engine

import (
	"testing"
	"time"

	"github.com/miradorstack/mirador-rca/internal/models"
	"github.com/miradorstack/mirador-rca/internal/repo"
)

func TestCausalityEngineEvaluate(t *testing.T) {
	engine := NewCausalityEngine(nil)
	now := time.Now()
	timeline := []models.TimelineEvent{
		{Service: "payments", Time: now.Add(-1 * time.Minute)},
		{Service: "checkout", Time: now},
	}
	edges := []repo.ServiceGraphEdge{{Source: "payments", Target: "checkout", CallRate: 100}}

	res := engine.Evaluate("checkout", timeline, edges)
	if res.Score <= 0 {
		t.Fatalf("expected positive causality score, got %f", res.Score)
	}
}

func TestCausalityEngineNoEvidence(t *testing.T) {
	engine := NewCausalityEngine(nil)
	res := engine.Evaluate("checkout", nil, nil)
	if res.Score != 0 {
		t.Fatalf("expected zero score without data")
	}
}
