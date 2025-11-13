# mirador-rca Release Process

This document describes the end-to-end flow for shipping a production-grade release, from code freeze to canary promotion.

## 1. Pre-release Checklist
- [ ] Ensure `main` is green (`make verify` + `make govulncheck`).
- [ ] Confirm integration tests pass in staging (Helm chart deployed against real mirador-core + Weaviate + Valkey).
- [ ] Review open incidents and TODOs. Defer risky work to the next milestone.
- [ ] Update documentation (runbooks, API docs) for any behavioural changes.

## 2. Version Bumps
1. Update the application version in `charts/mirador-rca/Chart.yaml` (`version` + `appVersion`).
2. If protobuf contracts changed, regenerate artifacts (`make generate`) and include them in the commit.
3. Open `CHANGELOG.md` and move items from `Unreleased` into a new section (e.g. `## [v0.4.0] - 2025-09-22`). Summarise features, fixes, and ops notes.

## 3. Build & Sign the Image
```bash
IMAGE=ghcr.io/miradorstack/mirador-rca:v0.4.0
make image IMAGE=$IMAGE
cosign sign --key "file://~/.cosign/mirador-rca.key" $IMAGE
cosign verify --key "file://~/.cosign/mirador-rca.pub" $IMAGE
```

Push the image and record the digest returned by `cosign`:
```bash
make image-push IMAGE=$IMAGE
DIGEST=$(crane digest $IMAGE)
echo "Published digest: $DIGEST"
```

## 4. Chart Packaging
```bash
helm dependency update charts/mirador-rca
make helm-lint
helm package charts/mirador-rca --destination dist
crane digest dist/mirador-rca-*.tgz
```

Publish the chart to your registry/GitOps repo and update any index (`helm repo index`).

## 5. Canary Rollout
1. Prepare values overlay (`values-canary.yaml`) overriding:
   - `replicaCount: 1`
   - `image.tag: v0.4.0`
   - Prometheus labels to separate metrics if required.
2. Deploy/upgrade into the staging namespace:
```bash
helm upgrade --install mirador-rca-canary charts/mirador-rca \
  -n mirador-staging \
  -f values/canary.yaml
```
3. Monitor SLO burn (use the Sloth alerts) for at least one investigation cycle (30–60 minutes).
4. Exercise manual smoke tests:
   - `grpcurl` investigation request.
   - `GetPatterns` / `ListCorrelations` gRPC calls.
   - Validate cache hit rate via metrics.

If the canary is stable, promote traffic by updating mirador-core routing (switch feature flag or traffic weight to 100%).

## 6. Production Promotion
```bash
helm upgrade --install mirador-rca charts/mirador-rca \
  -n mirador-prod \
  --set image.tag=v0.4.0
```

Verify:
- Pods are Ready and receiving traffic (`kubectl get pods -w`).
- Prometheus metrics have no burn alerts.
- Dashboards show expected throughput.

## 7. Tag & Announce
```bash
git tag -a v0.4.0 -m "mirador-rca v0.4.0"
git push origin v0.4.0
```

Create a GitHub/GitLab release referencing the changelog entry and linking to artifact digests.

Notify stakeholders:
- Post release summary in `#mirador-release` Slack channel.
- Update operational calendar / status page.

## 8. Post-release Tasks
- Close the milestone in issue tracker.
- Open a new `Unreleased` section in `CHANGELOG.md` for ongoing work.
- Retrospect on canary metrics; tune SLO objectives or alert thresholds if necessary.

Keep this process updated as toolchains evolve (e.g. Cosign key management, GitOps workflow changes).
