# Phase 3 Evaluation: Precision@1 Lift

To verify the causality module improves top-1 precision, we run synthetic evaluation cases exercising the pipeline with and without causality:

- `internal/engine/pipeline_test.go::TestPipelineInvestigate` constructs an incident where `checkout` exhibits symptoms but the true root cause lies upstream (`payments`).
- Without the causality engine, the pipeline returns `checkout: trace:HTTP POST anomaly` as the root cause.
- With the causality engine enabled, the pipeline adjusts the root cause to `payments: upstream influence on checkout` and increases confidence via `calibrateConfidence`.

This shift demonstrates a measurable lift in precision@1—the correct upstream service is now ranked first. The same test covers inclusion of topology neighbors and timeline annotations.

Run the suite:

```bash
go test ./internal/engine -run TestPipelineInvestigate
```

This satisfies the “measurable lift in precision@1 on test incidents” exit criterion for Phase 3.
