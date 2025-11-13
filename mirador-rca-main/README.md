# mirador-rca

> Work-in-progress Root Cause Analysis service for the Mirador stack.

## Prerequisites
- Go 1.23+
- `protoc` with Go & gRPC plugins (`protoc-gen-go`, `protoc-gen-go-grpc`).
- External Weaviate cluster reachable from the service.
- mirador-core API access for metrics/logs/traces aggregation.
- **Mandatory:** Deploy the OpenTelemetry Collector [servicegraphconnector](https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/connector/servicegraphconnector) and ensure its emitted service graph metrics are available. mirador-rca relies on this topology data to correlate anomalies across services; if the endpoint is missing or empty, investigations fail.
- Configure mirador-core to expose a service-graph endpoint (default `/api/v1/rca/service-graph`) that proxies the connector metrics so mirador-rca can fetch the dependency topology prior to each investigation.
- mirador-rca performs no synthetic fallbacks—metrics, logs, traces, and service graph data **must** be returned by mirador-core for investigations to succeed.
- See `docs/phase3-eval.md` for precision@1 evaluation details and `docs/indicent-analysis.md` for a deep dive of the pipeline.

## Quickstart
```
make fmt            # gofmt + goimports all sources
make verify         # fmt-check + lint + vet + test
make govulncheck    # vulnerability scan (requires govulncheck)
make build          # produces bin/mirador-rca
make image          # docker build tagged with git describe
make image-offline  # docker build with network access disabled
```

`make ci` runs the full verification plus `govulncheck` locally.

## Local Development Stack

Launch the Docker Compose sandbox (mock mirador-core, Valkey, Weaviate, and the service) with:

```
make localdev-up
```

Shut everything down and remove data volumes with `make localdev-down`. The stack definition lives under `deployment/localdev` and mounts your working copy so code changes are picked up instantly.

Run the service locally:
```
go run ./cmd/rca-engine --config configs/config.yaml
```

Build & publish a container image:
```
make docker-build IMAGE=ghcr.io/your-org/mirador-rca:$(git rev-parse --short HEAD)
make docker-push  IMAGE=ghcr.io/your-org/mirador-rca:$(git rev-parse --short HEAD)
```

Configuration fields are documented in `configs/config.example.yaml`.

## Valkey caching

Phase 4 adds read-through caching for Weaviate nearest-neighbour lookups and mirador-core service graph fetches. Configure the cache block in your config file (or via the `MIRADOR_RCA_CACHE_*` env vars) to point at a Valkey/Redis endpoint. Example:

```yaml
cache:
  addr: "valkey.mirador.svc.cluster.local:6379"
  username: ""
  db: 0
  tls: false
  similarIncidentsTTL: 2m
  serviceGraphTTL: 5m
```

If `addr` is blank the cache is disabled and requests fall back to direct Weaviate / mirador-core calls.

## Metrics & Alerts

mirador-rca exposes Prometheus metrics on the HTTP endpoint configured via `server.metricsAddress` (defaults to `:2112`). The binary registers both the gRPC default metrics (`grpc_server_handled_total`, handling histograms) and custom RCA series:

- `mirador_rca_investigations_total{outcome="success|error"}`
- `mirador_rca_investigation_seconds`

Disable the endpoint by setting `server.metricsAddress: ""` (or `.Values.metrics.enabled=false` in the Helm chart). Refer to `docs/ops-observability.md` for the SLO catalogue, alert rules, and Grafana dashboard guidance.

## Helm deployment

A production-ready Helm chart lives under `charts/mirador-rca`. It ships with:

- Deployment + Service definitions with configurable probes and resources
- HorizontalPodAutoscaler targeting CPU and memory utilisation
- ConfigMap-driven application configuration
- Optional PrometheusRule alerts for investigation latency and traffic gaps
- A Grafana dashboard ConfigMap that visualises p95 latency and request volume

Render or install the chart locally:

```
helm lint charts/mirador-rca
helm install mirador-rca charts/mirador-rca \
  --set config.weaviate.endpoint=https://weaviate.example.com \
  --set runtimeSecrets.weaviateAPIKey.name=weaviate-credentials \
  --set runtimeSecrets.weaviateAPIKey.key=apiKey
```

## CI

GitHub Actions workflows in `.github/workflows` enforce linters, vet/test runs, Helm linting, and a scheduled `govulncheck` scan on pushes and pull requests to `main`.

## Release process

Follow `docs/release-process.md` for tagging, signing, and promoting releases. The document also references the SLO manifests under `deployment/infra/slo` and infrastructure-as-code assets used to stand up Valkey and Weaviate.
