package services

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"github.com/miradorstack/mirador-rca/internal/api"
	"github.com/miradorstack/mirador-rca/internal/engine"
	rcav1 "github.com/miradorstack/mirador-rca/internal/grpc/generated"
	"github.com/miradorstack/mirador-rca/internal/metrics"
	"github.com/miradorstack/mirador-rca/internal/models"
	"github.com/miradorstack/mirador-rca/internal/repo"
	"github.com/miradorstack/mirador-rca/internal/utils"
)

// CorrelationPatternRepo defines storage operations required for correlation history and patterns.
type CorrelationPatternRepo interface {
	ListCorrelations(ctx context.Context, req models.ListCorrelationsRequest) (models.ListCorrelationsResponse, error)
	FetchPatterns(ctx context.Context, tenantID, service string) ([]models.FailurePattern, error)
	StoreFeedback(ctx context.Context, feedback models.Feedback) error
}

// RCAService implements the gRPC RCAEngine service.
type RCAService struct {
	rcav1.UnimplementedRCAEngineServer

	logger      *slog.Logger
	coreClient  *repo.MiradorCoreClient
	pipeline    *engine.Pipeline
	historyRepo CorrelationPatternRepo
	latencies   *utils.LatencyTracker
}

// NewRCAService constructs the RCA service facade.
func NewRCAService(logger *slog.Logger, coreClient *repo.MiradorCoreClient, pipeline *engine.Pipeline, historyRepo CorrelationPatternRepo) *RCAService {
	if logger == nil {
		logger = slog.Default()
	}
	return &RCAService{
		logger:      logger,
		coreClient:  coreClient,
		pipeline:    pipeline,
		historyRepo: historyRepo,
		latencies:   utils.NewLatencyTracker(1024),
	}
}

// InvestigateIncident orchestrates anomaly extraction and ranking (to be implemented).
func (s *RCAService) InvestigateIncident(ctx context.Context, req *rcav1.RCAInvestigationRequest) (*rcav1.CorrelationResult, error) {
	if req == nil {
		return nil, status.Error(codes.InvalidArgument, "request cannot be nil")
	}
	if s.pipeline == nil {
		return nil, status.Error(codes.FailedPrecondition, "pipeline not configured")
	}

	s.logger.Debug("InvestigateIncident called", slog.String("incident_id", req.GetIncidentId()), slog.String("tenant_id", req.GetTenantId()))

	domainReq, err := api.FromProtoInvestigationRequest(req)
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, err.Error())
	}

	start := time.Now()
	result, err := s.pipeline.Investigate(ctx, domainReq)
	duration := time.Since(start)
	if err != nil {
		metrics.ObserveInvestigation(duration, metrics.OutcomeError)
		s.logger.Error("pipeline investigation failed", slog.Any("error", err))
		return nil, status.Error(codes.Internal, fmt.Sprintf("investigation failed: %v", err))
	}
	s.latencies.Observe(duration)
	metrics.ObserveInvestigation(duration, metrics.OutcomeSuccess)
	if count := s.latencies.Count(); count >= 20 && count%20 == 0 {
		p95 := s.latencies.Percentile(95)
		s.logger.Info("investigation latency", slog.Duration("p95", p95), slog.Int("samples", count))
	}

	return api.ToProtoCorrelationResult(result), nil
}

// ListCorrelations returns historical correlations (placeholder).
func (s *RCAService) ListCorrelations(ctx context.Context, req *rcav1.ListCorrelationsRequest) (*rcav1.ListCorrelationsResponse, error) {
	if req == nil {
		return nil, status.Error(codes.InvalidArgument, "request cannot be nil")
	}
	if s.historyRepo == nil {
		return nil, status.Error(codes.FailedPrecondition, "history repository not configured")
	}

	domainReq, err := api.FromProtoListCorrelationsRequest(req)
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, err.Error())
	}

	resp, err := s.historyRepo.ListCorrelations(ctx, domainReq)
	if err != nil {
		s.logger.Error("list correlations failed", slog.Any("error", err))
		return nil, status.Error(codes.Internal, "failed to list correlations")
	}

	return api.ToProtoListCorrelationsResponse(resp), nil
}

// GetPatterns returns known failure patterns (placeholder).
func (s *RCAService) GetPatterns(ctx context.Context, req *rcav1.GetPatternsRequest) (*rcav1.GetPatternsResponse, error) {
	if req == nil {
		return nil, status.Error(codes.InvalidArgument, "request cannot be nil")
	}
	if s.historyRepo == nil {
		return nil, status.Error(codes.FailedPrecondition, "pattern repository not configured")
	}

	patterns, err := s.historyRepo.FetchPatterns(ctx, req.GetTenantId(), req.GetService())
	if err != nil {
		s.logger.Error("fetch patterns failed", slog.Any("error", err))
		return nil, status.Error(codes.Internal, "failed to fetch patterns")
	}

	return api.ToProtoPatternsResponse(patterns), nil
}

// SubmitFeedback records user feedback (placeholder).
func (s *RCAService) SubmitFeedback(ctx context.Context, req *rcav1.FeedbackRequest) (*rcav1.FeedbackAck, error) {
	if req == nil {
		return nil, status.Error(codes.InvalidArgument, "request cannot be nil")
	}
	if s.historyRepo == nil {
		return nil, status.Error(codes.FailedPrecondition, "feedback repository not configured")
	}

	feedback, err := api.FromProtoFeedbackRequest(req)
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, err.Error())
	}

	if err := s.historyRepo.StoreFeedback(ctx, feedback); err != nil {
		s.logger.Error("store feedback failed", slog.Any("error", err))
		return nil, status.Error(codes.Internal, "failed to persist feedback")
	}

	return &rcav1.FeedbackAck{CorrelationId: feedback.CorrelationID, Accepted: true}, nil
}

// HealthCheck returns the current health state.
func (s *RCAService) HealthCheck(ctx context.Context, req *rcav1.HealthRequest) (*rcav1.HealthResponse, error) {
	return &rcav1.HealthResponse{Status: "SERVING"}, nil
}

// LatencyP95 returns the current p95 investigation latency.
func (s *RCAService) LatencyP95() time.Duration {
	if s.latencies == nil {
		return 0
	}
	return s.latencies.Percentile(95)
}
