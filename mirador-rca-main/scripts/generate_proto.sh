#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
PROTO_SRC_DIR="$ROOT_DIR/internal/grpc/proto"
OUT_DIR="$ROOT_DIR/internal/grpc/generated"
mkdir -p "$OUT_DIR"

PROTOBUF_INCLUDE="$(go env GOMODCACHE)/google.golang.org/protobuf@v1.34.2/src"

protoc \
  -I"$PROTO_SRC_DIR" \
  -I"$PROTOBUF_INCLUDE" \
  --go_out="paths=source_relative:$OUT_DIR" \
  --go-grpc_out="paths=source_relative:$OUT_DIR" \
  "$PROTO_SRC_DIR/rca.proto"
