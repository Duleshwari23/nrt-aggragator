# Operations Observability Handbook

This guide captures the SLOs, alert policies, and dashboards that ship with mirador-rca. Pair it with the Helm chart (`charts/mirador-rca`) when rolling out to new clusters.

## 1. Service-Level Objectives

| SLO | Target | Measurement | Notes |
| --- | ------ | ----------- | ----- |
| Investigation p95 latency | ≤ 4 s over 15 min windows | `mirador_rca_investigation_seconds` histogram | Matches action-plan exit criteria; investigate extractor thresholds if breached |
| Investigation success rate | ≥ 99.5% over 1 h windows | `mirador_rca_investigations_total{outcome}` | Treat `outcome="error"` spikes as availability incidents |
| gRPC availability | ≥ 99.5% | `grpc_server_handled_total` + `grpc_server_handled_total{grpc_code!="OK"}` | Delivered by `go-grpc-prometheus` interceptors |

## 2. Metrics Surface

mirador-rca starts an HTTP metrics listener on `server.metricsAddress` (default `:2112`). Scrape `/metrics` via Prometheus or an OpenTelemetry collector using the `prometheusreceiver`.

Key series:

- `mirador_rca_investigations_total{outcome}` – counter partitioned by `success` and `error` outcomes.
- `mirador_rca_investigation_seconds` – histogram backing the p95 latency SLO.
- `grpc_server_handled_total` / `grpc_server_handled_seconds_bucket` – emitted by `go-grpc-prometheus` for gRPC level telemetry.
- `process_*` and Go runtime stats – provided by the Prometheus client for capacity trending.

Set `.Values.metrics.enabled=false` (or blank `server.metricsAddress`) to disable the listener when an internal service mesh handles scraping. Update `.Values.metrics.annotations`/`.labels` to add `prometheus.io/*` hints or ServiceMonitor selectors.

## 3. Alert Catalogue

The Helm chart renders a `PrometheusRule` when `alerts.enabled=true`:

1. **MiradorRCAHighLatency** – triggers if the p95 latency exceeds 4 s for 5 minutes.
2. **MiradorRCANoTraffic** – warns when no investigations are handled for 10 minutes (helps catch stuck queues or routing issues).

Tune thresholds and severities via `values.yaml` (`alerts.rules`). For multi-tenant clusters, use namespace selectors in your Prometheus configuration or set custom labels through `alerts.labels`.

## 4. Dashboards

`dashboards.enabled=true` installs a Grafana dashboard ConfigMap. Panels included by default:

- p95 investigation latency time-series with threshold colouring.
- Investigations-per-minute stat sourced from `grpc_server_handled_total`.

Add additional panels (cache hit rate, Weaviate latency) by editing `values.yaml` (`dashboards.content`).

## 5. Incident Response Runbook

### Detection
- **Pager trigger**: Alerts listed in §3 fan-out to PagerDuty service `mirador-rca` (level 1 on-call).
- **Dashboard review**: Grafana dashboard (`mirador-rca` folder) for latency, throughput, cache hit rate, and upstream dependencies.

### Common Error Signatures

| Symptom | Log / Metric Pattern | Likely Root Cause | First Actions |
| ------- | -------------------- | ----------------- | ------------- |
| High p95 latency | `mirador_rca_investigation_seconds` burn-rate > 1, logs show `pipeline investigation took` > 4s | Slow response from Weaviate or mirador-core APIs | Check upstream latency dashboards, temporarily disable cache eviction, consider widening timeouts |
| Investigation failures | `mirador_rca_investigations_total{outcome="error"}` spike; logs: `mirador-core ... returned 5xx` | mirador-core outages or missing data windows | Verify mirador-core health, confirm servicegraphconnector exporting data, coordinate with core team |
| Cache misses / Valkey errors | Log line `valkey cache unavailable` or `dial tcp ...: connect: connection refused` | Valkey deployment offline or credentials rotated | Check Valkey pod state, redeploy secret, fail back to Noop provider temporarily |
| gRPC unavailability | `grpc_server_handled_total{grpc_code!="OK"}` increase; Istio/Ingress 503 logs | Network policies or TLS cert expiry | Validate ingress certs, restart pods with renewed certs, review service mesh routes |

### Triage Procedure
1. **Acknowledge alert**: L1 on-call acknowledges within 5 minutes.
2. **Stabilise service**: If investigations fail, scale replicas to 1 and disable traffic in mirador-core (`/rca` feature flag) to stop customer impact.
3. **Validate dependencies**:
   - `kubectl get pods -n observability` for Valkey & Weaviate states.
   - `curl http://core-mock:8080/healthz` (or real mirador-core health) to confirm upstream.
4. **Inspect logs**: `kubectl logs deploy/mirador-rca -c mirador-rca --since=10m` focusing on error stack traces.

### Escalation Path
- **L1**: Platform Ops on-call.
- **L2**: Mirador RCA engineering (Slack `#mirador-rca-alerts`, paging through PagerDuty escalation policy).
- **L3**: Mirador Core platform team for upstream data issues, Weaviate SRE for storage outages.

Escalate if impact persists >15 minutes or if root cause sits outside the RCA team.

### Post-incident Checklist
- Capture timeline and remediation in the incident ticket.
- Run `make localdev-down` / `make localdev-up` to reproduce if needed.
- File follow-up issues for code fixes, alert tuning, or documentation gaps.

## 6. Configuration Reference

| Setting | Location | Purpose |
| ------- | -------- | ------- |
| `server.metricsAddress` | `configs/config.example.yaml` / `.Values.config.server.metricsAddress` | Bind address for the `/metrics` HTTP listener. Set to `""` to disable. |
| `.Values.metrics.*` | `charts/mirador-rca/values.yaml` | Controls port exposure, annotations, and labels for the metrics Service port. |
| `.Values.alerts.*` | Helm values | Enables/overrides Prometheus alerts. |
| `.Values.dashboards.*` | Helm values | Configures packaged Grafana dashboard. |
| Sloth SLO manifest | `deployment/infra/slo/mirador-rca-sloth.yaml` | Declarative SLOs for latency and success rate; apply with the Sloth operator. |

Keep this document updated as new metrics, alerts, or dashboards are introduced.
