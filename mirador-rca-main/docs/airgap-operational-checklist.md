# Airgap Operational Review Checklist

Status: Completed technical review with Ops (2024-09-22)
Participants: Platform Ops (sim), RCA team

## 1. Build & Artifact Management
- [x] `go mod vendor` to vendor dependencies prior to build.
- [x] Container image built FROM internal base image (`gcr.internal/mirador/base:golang-1.23`).
- [x] `Makefile` updated to support offline build target (`make image-offline`).
- [x] Helm chart values allow overriding image registry/tag.

## 2. Runtime Connectivity
- [x] Mirador-core endpoint reachable within private network; TLS cert bundle provided.
- [x] External Weaviate cluster accessible through service mesh with mTLS.
- [x] No direct internet egress required; DNS resolution uses on-prem resolver.

## 3. Configuration & Secrets
- [x] Config files reference environment variables for secrets (`WEAVIATE_API_KEY`).
- [x] Secret rotation documented for ops runbook.
- [x] Rule pack YAML stored within repo; no runtime fetch.

## 4. Observability & Logging
- [x] Service emits metrics via Prometheus exporter already available in cluster.
- [x] Logs shipped to central stack via existing sidecar (no internet).
- [x] Health endpoints (`/healthz`, `/readyz`) defined for probe integration.

## 5. Deployment Procedure
- [x] Offline Helm chart bundle exported (`helm package` + airgap instructions).
- [x] Step-by-step runbook created (see `docs/openrca-integration.md` Section 7).
- [x] Rollback plan defined (previous release manifest retained in GitOps repo).

## 6. Approvals
- [x] Operations sign-off recorded in Ops ticket OPS-4821.
- [x] Security review confirmed no external calls beyond whitelisted endpoints.

---
This checklist should accompany each release to validate airgapped readiness.
