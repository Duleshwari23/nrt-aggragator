package utils

import (
	"fmt"
	"time"
)

// ParseRFC3339 returns a time from the provided string or an error.
func ParseRFC3339(value string) (time.Time, error) {
	if value == "" {
		return time.Time{}, fmt.Errorf("empty time value")
	}
	t, err := time.Parse(time.RFC3339, value)
	if err != nil {
		return time.Time{}, fmt.Errorf("parse time: %w", err)
	}
	return t, nil
}

// DurationMinutes converts a pair of timestamps into minute duration.
func DurationMinutes(start, end time.Time) float64 {
	if end.Before(start) {
		start, end = end, start
	}
	return end.Sub(start).Minutes()
}
