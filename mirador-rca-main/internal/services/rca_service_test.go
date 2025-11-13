package services

import (
	"context"
	"testing"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	rcav1 "github.com/miradorstack/mirador-rca/internal/grpc/generated"
	"github.com/miradorstack/mirador-rca/internal/models"
)

type feedbackRepoStub struct {
	stored bool
	err    error
}

func (f *feedbackRepoStub) ListCorrelations(ctx context.Context, req models.ListCorrelationsRequest) (models.ListCorrelationsResponse, error) {
	return models.ListCorrelationsResponse{}, nil
}

func (f *feedbackRepoStub) FetchPatterns(ctx context.Context, tenantID, service string) ([]models.FailurePattern, error) {
	return nil, nil
}

func (f *feedbackRepoStub) StoreFeedback(ctx context.Context, feedback models.Feedback) error {
	f.stored = true
	return f.err
}

func TestSubmitFeedback(t *testing.T) {
	repo := &feedbackRepoStub{}
	service := NewRCAService(nil, nil, nil, repo)

	_, err := service.SubmitFeedback(context.Background(), &rcav1.FeedbackRequest{TenantId: "tenant", CorrelationId: "corr", Correct: true})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !repo.stored {
		t.Fatalf("expected feedback to be stored")
	}
}

func TestSubmitFeedbackMissingCorrelation(t *testing.T) {
	repo := &feedbackRepoStub{}
	service := NewRCAService(nil, nil, nil, repo)

	_, err := service.SubmitFeedback(context.Background(), &rcav1.FeedbackRequest{TenantId: "tenant"})
	if status.Code(err) != codes.InvalidArgument {
		t.Fatalf("expected invalid argument, got %v", err)
	}
}
