#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${WEAVIATE_URL:-}" ]]; then
  echo "WEAVIATE_URL not set" >&2
  exit 1
fi

API_KEY=${WEAVIATE_API_KEY:-}
ENDPOINT="${WEAVIATE_URL%/}/v1/.well-known/ready"

headers=("-H" "Accept: application/json")
if [[ -n "$API_KEY" ]]; then
  headers+=("-H" "Authorization: Bearer $API_KEY")
fi

curl -fsSL "${headers[@]}" "$ENDPOINT" >/dev/null

echo "Weaviate ready endpoint reachable at $ENDPOINT"
