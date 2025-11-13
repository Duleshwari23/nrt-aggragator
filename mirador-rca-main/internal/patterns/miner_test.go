package patterns

import (
	"context"
	"testing"
	"time"

	"github.com/miradorstack/mirador-rca/internal/models"
)

type fakePatternStore struct {
	stored int
}

func (f *fakePatternStore) StorePatterns(ctx context.Context, tenantID string, patterns []models.FailurePattern) error {
	f.stored += len(patterns)
	return nil
}

func TestMinerMinesPatterns(t *testing.T) {
	store := &fakePatternStore{}
	miner := NewMiner(nil, store)

	now := time.Now()
	correlations := []models.CorrelationResult{
		{
			CorrelationID:    "c1",
			AffectedServices: []string{"checkout"},
			CreatedAt:        now,
			RedAnchors: []models.RedAnchor{
				{Service: "checkout", Selector: "metrics:cpu", AnomalyScore: 3},
			},
		},
		{
			CorrelationID:    "c2",
			AffectedServices: []string{"checkout"},
			CreatedAt:        now.Add(10 * time.Minute),
			RedAnchors: []models.RedAnchor{
				{Service: "checkout", Selector: "logs:error", AnomalyScore: 4},
			},
		},
	}

	patterns, err := miner.Mine(context.Background(), "tenant", correlations)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(patterns) == 0 {
		t.Fatalf("expected patterns")
	}
	if store.stored == 0 {
		t.Fatalf("expected patterns to be stored")
	}
}
