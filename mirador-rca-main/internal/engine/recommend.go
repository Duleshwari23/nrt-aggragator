package engine

import (
	"errors"
	"log/slog"
	"os"
	"strings"

	"gopkg.in/yaml.v3"

	"github.com/miradorstack/mirador-rca/internal/models"
)

// RuleEngine applies rule-based recommendations when similarity recall is insufficient.
type RuleEngine struct {
	rules  []Rule
	logger *slog.Logger
}

// Rule represents a single recommendation rule.
type Rule struct {
	ID              string    `yaml:"id"`
	Match           RuleMatch `yaml:"match"`
	Recommendations []string  `yaml:"recommendations"`
}

// RuleMatch defines optional attributes for rule matching.
type RuleMatch struct {
	Service          string   `yaml:"service"`
	Severity         string   `yaml:"severity"`
	SelectorContains []string `yaml:"selector_contains"`
}

// RuleConfigFile is the YAML root structure.
type RuleConfigFile struct {
	Rules []Rule `yaml:"rules"`
}

// NewRuleEngine loads rules from the provided path. If path is empty, returns nil engine.
func NewRuleEngine(path string, logger *slog.Logger) (*RuleEngine, error) {
	if path == "" {
		return nil, nil
	}
	data, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, nil
		}
		return nil, err
	}
	var cfg RuleConfigFile
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil, err
	}
	if logger == nil {
		logger = slog.Default()
	}
	return &RuleEngine{rules: cfg.Rules, logger: logger}, nil
}

// Recommend produces rule-based recommendations based on anchors and timeline events.
func (e *RuleEngine) Recommend(req models.InvestigationRequest, anchors []models.RedAnchor, timeline []models.TimelineEvent) []string {
	if e == nil {
		return nil
	}

	matched := make([]string, 0)
	for _, rule := range e.rules {
		if rule.Match.Service != "" && !serviceMatches(rule.Match.Service, req, anchors) {
			continue
		}
		if rule.Match.Severity != "" && !timelineHasSeverity(rule.Match.Severity, timeline) {
			continue
		}
		if len(rule.Match.SelectorContains) > 0 && !anchorsContain(rule.Match.SelectorContains, anchors) {
			continue
		}
		matched = appendUnique(matched, rule.Recommendations...)
	}
	return matched
}

func serviceMatches(service string, req models.InvestigationRequest, anchors []models.RedAnchor) bool {
	for _, s := range req.AffectedServices {
		if strings.EqualFold(service, s) {
			return true
		}
	}
	for _, anchor := range anchors {
		if strings.EqualFold(service, anchor.Service) {
			return true
		}
	}
	return false
}

func timelineHasSeverity(severity string, events []models.TimelineEvent) bool {
	if severity == "" {
		return true
	}
	for _, ev := range events {
		if strings.EqualFold(severity, string(ev.Severity)) {
			return true
		}
	}
	return false
}

func anchorsContain(keywords []string, anchors []models.RedAnchor) bool {
	if len(keywords) == 0 {
		return true
	}
	for _, anchor := range anchors {
		selector := strings.ToLower(anchor.Selector)
		for _, kw := range keywords {
			if kw != "" && strings.Contains(selector, strings.ToLower(kw)) {
				return true
			}
		}
	}
	return false
}

func appendUnique(existing []string, additions ...string) []string {
	seen := make(map[string]struct{}, len(existing))
	for _, rec := range existing {
		seen[rec] = struct{}{}
	}
	for _, item := range additions {
		if item == "" {
			continue
		}
		if _, ok := seen[item]; ok {
			continue
		}
		existing = append(existing, item)
		seen[item] = struct{}{}
	}
	return existing
}
