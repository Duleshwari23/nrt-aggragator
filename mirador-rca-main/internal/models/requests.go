package models

import "time"

// InvestigationRequest represents a mirador-core investigation call.
type InvestigationRequest struct {
	IncidentID       string
	Symptoms         []string
	TimeRange        TimeRange
	AffectedServices []string
	AnomalyThreshold float64
	TenantID         string
}

// TimeRange bounds the signal window for analysis.
type TimeRange struct {
	Start time.Time
	End   time.Time
}

// ListCorrelationsRequest captures filters for historical correlations.
type ListCorrelationsRequest struct {
	TenantID  string
	Service   string
	Start     time.Time
	End       time.Time
	PageSize  int
	PageToken string
}

// ListCorrelationsResponse contains correlation history records and pagination state.
type ListCorrelationsResponse struct {
	Correlations  []CorrelationResult
	NextPageToken string
}

// Feedback captures user feedback for a correlation result.
type Feedback struct {
	TenantID      string
	CorrelationID string
	Correct       bool
	Notes         string
	SubmittedAt   time.Time
}
