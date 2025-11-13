# Performance Validation Checklist

The RCA service tracks investigation latency internally using `LatencyTracker`. To capture real p95 numbers on dev incident data:

1. Deploy mirador-rca to the dev cluster with logging level `info`.
2. Generate incident traffic (or replay stored investigations) via mirador-core.
3. Tail the service logs: every 20 investigations the service emits `investigation latency` with the current p95 and sample count.
4. If p95 exceeds `4s`, adjust detector thresholds or sampling windows in `internal/extractors` and retest.
5. Record the observed p95 in the release checklist.

For offline profiling you can run `make verify` (fmt-check + lint + vet + unit tests) followed by targeted benchmarks inside `internal/engine` if deeper profiling is required.
