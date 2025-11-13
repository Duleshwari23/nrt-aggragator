package api

import (
	"testing"
	"time"

	"google.golang.org/protobuf/types/known/timestamppb"

	rcav1 "github.com/miradorstack/mirador-rca/internal/grpc/generated"
	"github.com/miradorstack/mirador-rca/internal/models"
)

func TestFromProtoInvestigationRequest(t *testing.T) {
	now := time.Now()
	req := &rcav1.RCAInvestigationRequest{
		IncidentId: "incident-1",
		Symptoms:   []string{"checkout"},
		TimeRange: &rcav1.TimeRange{
			Start: timestamppb.New(now),
			End:   timestamppb.New(now.Add(5 * time.Minute)),
		},
		AffectedServices: []string{"checkout"},
		TenantId:         "tenant",
	}

	domainReq, err := FromProtoInvestigationRequest(req)
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if domainReq.IncidentID != "incident-1" {
		t.Fatalf("unexpected incident id: %s", domainReq.IncidentID)
	}
}

func TestToProtoCorrelationResult(t *testing.T) {
	now := time.Now()
	res := models.CorrelationResult{
		CorrelationID:    "corr-1",
		IncidentID:       "incident-1",
		RootCause:        "checkout",
		Confidence:       0.7,
		AffectedServices: []string{"checkout"},
		Recommendations:  []string{"Do thing"},
		RedAnchors: []models.RedAnchor{
			{
				Service:      "checkout",
				Selector:     "metrics:cpu",
				DataType:     models.DataTypeMetrics,
				Timestamp:    now,
				AnomalyScore: 3,
				Threshold:    2,
			},
		},
		Timeline: []models.TimelineEvent{
			{
				Time:         now,
				Event:        "Metric spike",
				Service:      "checkout",
				Severity:     models.SeverityHigh,
				AnomalyScore: 3,
				DataSource:   models.DataTypeMetrics,
			},
		},
		CreatedAt: now,
	}

	proto := ToProtoCorrelationResult(res)
	if proto.GetCorrelationId() != "corr-1" {
		t.Fatalf("unexpected correlation id: %s", proto.GetCorrelationId())
	}
	if len(proto.GetRedAnchors()) != 1 {
		t.Fatalf("expected 1 red anchor, got %d", len(proto.GetRedAnchors()))
	}
}

func TestFromProtoListCorrelationsRequest(t *testing.T) {
	now := time.Now().Round(time.Second)
	req := &rcav1.ListCorrelationsRequest{
		TenantId:  "tenant",
		Service:   "checkout",
		StartTime: timestamppb.New(now),
		EndTime:   timestamppb.New(now.Add(time.Hour)),
		PageSize:  25,
		PageToken: "50",
	}

	domainReq, err := FromProtoListCorrelationsRequest(req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if domainReq.Service != "checkout" || domainReq.PageSize != 25 || domainReq.PageToken != "50" {
		t.Fatalf("unexpected domain request: %+v", domainReq)
	}
}

func TestToProtoListCorrelationsResponse(t *testing.T) {
	resp := models.ListCorrelationsResponse{
		Correlations:  []models.CorrelationResult{{CorrelationID: "corr-1"}},
		NextPageToken: "100",
	}

	proto := ToProtoListCorrelationsResponse(resp)
	if proto.GetNextPageToken() != "100" {
		t.Fatalf("unexpected page token: %s", proto.GetNextPageToken())
	}
	if len(proto.GetCorrelations()) != 1 {
		t.Fatalf("expected one correlation")
	}
}

func TestToProtoPatternsResponse(t *testing.T) {
	now := time.Now()
	patterns := []models.FailurePattern{
		{
			ID:          "p1",
			Name:        "CPU",
			Description: "desc",
			Services:    []string{"checkout"},
			AnchorTemplates: []models.AnchorTemplate{
				{Service: "checkout", SignalType: "metrics", Selector: "cpu", TypicalLag: 1, Threshold: 0.8},
			},
			Prevalence: 0.5,
			LastSeen:   now,
			Precision:  0.7,
			Recall:     0.4,
		},
	}

	proto := ToProtoPatternsResponse(patterns)
	if len(proto.GetPatterns()) != 1 {
		t.Fatalf("expected pattern in response")
	}
	if proto.GetPatterns()[0].GetQuality().GetPrecision() != 0.7 {
		t.Fatalf("unexpected quality precision")
	}
}

func TestFromProtoFeedbackRequest(t *testing.T) {
	req := &rcav1.FeedbackRequest{
		TenantId:      "tenant",
		CorrelationId: "corr-1",
		Correct:       true,
		Notes:         "Looks good",
	}

	feedback, err := FromProtoFeedbackRequest(req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !feedback.Correct || feedback.CorrelationID != "corr-1" {
		t.Fatalf("feedback mapping incorrect: %+v", feedback)
	}
}
