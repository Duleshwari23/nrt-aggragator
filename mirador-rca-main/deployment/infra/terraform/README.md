# Terraform: mirador-rca Dependencies

This module provisions the external services mirador-rca expects in each environment:

- **Valkey** (Redis-compatible cache) via the Bitnami Valkey Helm chart.
- **Weaviate** vector DB / similarity store via the official Helm chart.

## Prerequisites
- Terraform ≥ 1.5
- Access to the target Kubernetes cluster (kubeconfig on disk)
- Helm CRDs installed

## Usage

```bash
cd deployment/infra/terraform
terraform init
terraform plan \
  -var="kubeconfig_path=$HOME/.kube/config" \
  -var="namespace=mirador-prod" \
  -var="valkey_password=$(op read op://team/mirador-rca/valkey-password)"
terraform apply
```

Override chart versions, resource requests, storage classes, or auth settings with `-var` flags or a `.tfvars` file. Sensitive values (passwords) should be sourced from your secret manager rather than hard-coding them in version control.

## Outputs
- `namespace` – namespace where resources were created
- `valkey_service` – internal DNS for the Valkey service
- `weaviate_service` – internal DNS for Weaviate HTTP endpoint

## Hardening Checklist
- Set `valkey_auth_enabled=false` only in trusted dev clusters; production should supply usernames/passwords.
- Configure network policies to restrict access to the Valkey and Weaviate services from mirador-rca pods only.
- Provide TLS/mTLS termination via service mesh or chart configuration when required by compliance.
