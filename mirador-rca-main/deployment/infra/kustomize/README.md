# Kustomize Manifests: mirador-rca Dependencies

This tree provides Kubernetes YAML for the two external services mirador-rca depends on (Valkey and Weaviate).

## Structure
- `base/` – opinionated defaults suitable for development clusters. Auth is disabled and minimal resources are requested.
- `overlays/prod/` – example production overlay that:
  - Replaces the Valkey secret via `secretGenerator`.
  - Enables append-only mode and scales the StatefulSet to three replicas.
  - Expands Weaviate storage and switches on OIDC authentication.

## Usage

Render dev manifests:
```bash
kubectl apply -k deployment/infra/kustomize/base
```

Render production overlay after creating the referenced secrets (`valkey-auth`, `weaviate-oidc`):
```bash
kubectl apply -k deployment/infra/kustomize/overlays/prod
```

Adjust storage classes, resource requests, or authentication settings as required for your environment. Combine with GitOps tooling (Flux/ArgoCD) to version-control infrastructure state alongside application releases.
