package engine

import (
	"log/slog"
	"os"
	"path/filepath"
	"testing"

	"github.com/miradorstack/mirador-rca/internal/models"
)

func TestRuleEngineRecommend(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "rules.yaml")
	if err := os.WriteFile(path, []byte(`rules:
  - id: cpu
    match:
      service: "checkout"
      selector_contains: ["cpu"]
    recommendations: ["Scale"]
`), 0644); err != nil {
		t.Fatalf("write rules: %v", err)
	}

	engine, err := NewRuleEngine(path, slog.New(slog.NewTextHandler(os.Stdout, nil)))
	if err != nil {
		t.Fatalf("new rule engine: %v", err)
	}

	req := models.InvestigationRequest{AffectedServices: []string{"checkout"}}
	anchors := []models.RedAnchor{{Service: "checkout", Selector: "metrics:cpu_usage"}}
	recs := engine.Recommend(req, anchors, nil)
	if len(recs) == 0 {
		t.Fatalf("expected recommendations")
	}
}

func TestRuleEngineNoFile(t *testing.T) {
	engine, err := NewRuleEngine("non-existent", nil)
	if err != nil {
		t.Fatalf("expected nil error, got %v", err)
	}
	if engine != nil {
		t.Fatalf("expected nil engine when file missing")
	}
}
