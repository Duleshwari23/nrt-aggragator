package utils

import (
	"testing"
	"time"
)

func TestLatencyTrackerPercentile(t *testing.T) {
	tracker := NewLatencyTracker(10)
	durations := []time.Duration{10 * time.Millisecond, 20 * time.Millisecond, 30 * time.Millisecond, 40 * time.Millisecond, 50 * time.Millisecond}
	for _, d := range durations {
		tracker.Observe(d)
	}

	if tracker.Count() != len(durations) {
		t.Fatalf("expected count %d, got %d", len(durations), tracker.Count())
	}

	p95 := tracker.Percentile(95)
	if p95 < 40*time.Millisecond {
		t.Fatalf("expected percentile >= 40ms, got %v", p95)
	}
}

func TestLatencyTrackerBoundedSize(t *testing.T) {
	tracker := NewLatencyTracker(3)
	for i := 0; i < 10; i++ {
		tracker.Observe(time.Duration(i) * time.Millisecond)
	}
	if tracker.Count() != 3 {
		t.Fatalf("expected tracker size 3, got %d", tracker.Count())
	}
}
