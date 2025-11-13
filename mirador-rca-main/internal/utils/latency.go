package utils

import (
	"sort"
	"sync"
	"time"
)

// LatencyTracker stores recent duration samples and computes percentiles.
type LatencyTracker struct {
	mu      sync.RWMutex
	samples []time.Duration
	maxSize int
}

// NewLatencyTracker creates a tracker storing up to maxSize samples.
func NewLatencyTracker(maxSize int) *LatencyTracker {
	if maxSize <= 0 {
		maxSize = 512
	}
	return &LatencyTracker{maxSize: maxSize}
}

// Observe records a new duration.
func (l *LatencyTracker) Observe(d time.Duration) {
	l.mu.Lock()
	defer l.mu.Unlock()

	l.samples = append(l.samples, d)
	if len(l.samples) > l.maxSize {
		// Drop oldest sample to bound memory.
		copy(l.samples[0:], l.samples[1:])
		l.samples = l.samples[:l.maxSize]
	}
}

// Percentile returns the percentile (0-100) duration. Returns zero if no samples.
func (l *LatencyTracker) Percentile(p float64) time.Duration {
	l.mu.RLock()
	defer l.mu.RUnlock()

	if len(l.samples) == 0 {
		return 0
	}
	if p <= 0 {
		return l.min()
	}
	if p >= 100 {
		return l.max()
	}

	sorted := append([]time.Duration(nil), l.samples...)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i] < sorted[j] })

	index := int((p / 100.0) * float64(len(sorted)-1))
	if index < 0 {
		index = 0
	}
	if index >= len(sorted) {
		index = len(sorted) - 1
	}
	return sorted[index]
}

// Count returns number of samples recorded.
func (l *LatencyTracker) Count() int {
	l.mu.RLock()
	defer l.mu.RUnlock()
	return len(l.samples)
}

func (l *LatencyTracker) min() time.Duration {
	if len(l.samples) == 0 {
		return 0
	}
	min := l.samples[0]
	for _, s := range l.samples[1:] {
		if s < min {
			min = s
		}
	}
	return min
}

func (l *LatencyTracker) max() time.Duration {
	if len(l.samples) == 0 {
		return 0
	}
	max := l.samples[0]
	for _, s := range l.samples[1:] {
		if s > max {
			max = s
		}
	}
	return max
}
