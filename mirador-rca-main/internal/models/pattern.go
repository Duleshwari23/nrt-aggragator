package models

import "time"

// FailurePattern represents a mined failure template stored in Weaviate.
type FailurePattern struct {
	ID              string
	Name            string
	Description     string
	Services        []string
	AnchorTemplates []AnchorTemplate
	Prevalence      float64
	LastSeen        time.Time
	Precision       float64
	Recall          float64
}

// AnchorTemplate describes a recurring anomaly signature.
type AnchorTemplate struct {
	Service    string
	SignalType string
	Selector   string
	TypicalLag float64
	Threshold  float64
}
