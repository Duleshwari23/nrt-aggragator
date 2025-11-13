# OpenRCA Integration Architecture

## 1. Goal
Design how mirador-rca will adopt the analytical strengths of Microsoft's OpenRCA (knowledge-graph-driven root-cause reasoning) while remaining Go-native and fully operational in airgapped environments.

## 2. OpenRCA Overview (Reference Capabilities)
- **Signal Ingestion & Enrichment**: Streams Kubernetes/Prometheus events, contextualises with topology, converts to graph entities (Resources, Events, Symptoms).
- **Knowledge Graph Store**: Neo4j schema with entities (Node, Pod, Service, Alert) and relationships (DEPENDS_ON, RUNS_ON, TRIGGERS).
- **Correlation & RCA Engine**: Combines anomaly scoring, temporal alignment, graph traversal, and rule heuristics to rank candidate causes.
- **Visualization APIs**: Serves RCA graphs to UI clients (REST, WebSocket) including storylines and causal paths.
- **Extensibility**: Plugin-based collectors, scoring modules, and rule packs.

> Note: The upstream implementation is predominantly Python (with FastAPI, Celery, Kafka, Neo4j drivers).

## 3. Component Mapping (OpenRCA ➜ mirador-rca)
| OpenRCA Component | Capability | Mirador-RCA Target | Integration Decision |
| ----------------- | ---------- | ------------------ | -------------------- |
| Collectors (Prometheus/K8s) | Pull metrics/events | mirador-core RCA APIs | Delegate signal retrieval to mirador-core; convert API payloads into graph events |
| Enricher & Topology Builder | Build dependency graph | `internal/engine/topology` (new) using external Weaviate + mirador-core topology data | Port algorithms; store graph in embedded cache + optional Neo4j |
| Knowledge Graph Store | Persist entities/relationships | Neo4j (self-hosted) or embedded Cayley/Badger fallback | Allow pluggable store with offline import/export |
| Correlator & RCA Engine | Graph-based scoring & path ranking | Extend `internal/engine/correlate.go` and `causality.go` | Port heuristics to Go (gonum graph) |
| Rule Packs | Domain-specific adjustments | Config-driven rules in Go | Convert YAML rule packs to Go structs |
| Visualization API | Graph/Storyline | Future integration via mirador-core UI | Provide gRPC payloads + optional REST adaptor |
| Stream Processing (Kafka/Celery) | Async pipelines | Go goroutines + channel pipeline | Use in-memory queues; optional NATS if available |

## 4. Target Architecture
```
mirador-core RCA APIs (metrics/logs/traces) --> Extractors --> Event Normaliser -->
                     |                                 |
                     v                                 v
               Graph Projector  ----> Knowledge Graph Store (Neo4j offline bundle)
                     |
                     v
        Graph Reasoner (OpenRCA ported logic) --> Ranking --> CorrelationResult
                     |
                     v
             External Weaviate Similarity Recall
```
- **Event Normaliser**: Converts anomalies to OpenRCA-style Symptoms/Events.
- **Graph Projector**: Builds/updates in-memory graph; periodically syncs to Neo4j if configured.
- **Graph Reasoner**: Runs influence scoring, time-window filtering, and dependency walks to find root-cause candidates.

## 5. Data Flow
1. mirador-core RCA APIs provide raw signal windows which extractors convert into `MetricAnomaly`, `LogAnomaly`, `TraceSpan`.
2. Normaliser maps anomalies to graph nodes (Service, Component, Alert) and relationships (HAS_ANOMALY, IMPACTS).
3. Topology service enriches with dependencies from mirador-core trace APIs and cached service map.
4. Graph Projector updates a directed graph stored in-go (e.g., `gonum.org/v1/gonum/graph/simple`).
5. Reasoner executes OpenRCA-derived algorithms:
   - Temporal alignment of anomalies.
   - BFS/DFS weighted by dependency strength.
   - Confidence scoring from anomaly severity + graph centrality.
6. Top-k candidates converted to `CorrelationResult` Red Anchors.
7. Optional: store correlations/patterns to the external Weaviate cluster for future recall.

## 6. Technology Decisions
- **Language**: Pure Go implementation to comply with mirador stack and simplify airgap builds.
- **Graph Library**: Gonum simple.DirectedGraph for in-memory reasoning; driver-based adapter for Neo4j if persistence required.
- **Config**: Extend `configs/config.yaml` with Neo4j settings (url, credentials, offline mode) plus mirador-core API paths.
- **Packaging**: Build static Go binary; optional sidecar for Neo4j shipped as offline docker image or helm dependency.
- **Signal Access**: Mirador-core provides the canonical signal interface, ensuring tenancy enforcement and reuse of caching/authorisation logic.
- **Messaging**: Replace Kafka/Celery with Go worker pool; integrate with existing pipeline orchestrator.
- **Rules**: Provide YAML rule pack in `configs/rules/` parsed at startup.
- **Weaviate**: Assume an externally managed Weaviate cluster; service consumes it via configurable endpoint/API key with no in-cluster deployment.

## 7. Airgapped Operation Strategy
- Vendor Go dependencies (`go mod vendor`) and mirror to offline artifact store.
- Pre-package Neo4j (or selected graph DB) container image into internal registry; provide Helm chart values for offline image references.
- Avoid runtime downloads: embed default rule packs and graph schema in repo.
- Provide migration scripts with no external network (e.g., `scripts/bootstrap_graph.sh` using cypher files).
- Generate doc on how to build container images with `make image` using local base images.
- Store the external Weaviate cluster + mirador-core endpoints in private network; ensure TLS certs available offline.

## 8. Implementation Roadmap
1. **Research & Design (Week 1)**
   - Finalise graph schema mapping; document conversions (`docs/graph-schema.yaml`).
   - Produce rule pack template reflecting OpenRCA defaults.
2. **Foundational Port (Weeks 2-3)**
   - Implement mirador-core client adapters, Event Normaliser, Graph Projector, in-memory graph reasoner.
   - Add unit tests covering synthetic incidents (use upstream scenarios).
3. **Graph Persistence (Week 4)**
   - Implement Neo4j adapter with offline cypher migrations.
   - Add fallback embedded store (Badger) for environments w/o Neo4j.
4. **Integration (Week 5)**
   - Wire reasoner into `internal/engine` pipeline.
   - Extend gRPC `InvestigateIncident` to include graph context (anchors, causal path).
5. **Airgap Packaging (Week 6)**
   - Vendor dependencies; update Makefile/Helm for offline builds.
   - Provide ops runbook for offline deployment/testing.
6. **Validation (Week 7)**
   - Performance test to meet `p95 <= 4s` target.
   - Run shadow comparisons vs baseline heuristics; refine scoring.

## 9. Testing Strategy
- Unit tests for anomaly-to-graph mapping and reasoner scoring.
- Integration tests using synthetic topology fixtures to exercise end-to-end `InvestigateIncident`.
- Offline smoke test script that boots Neo4j (if available) from local tarball and runs sample investigation.

## 10. Risks & Mitigations
- **Graph DB Availability**: Provide embedded fallback to avoid dependency on Neo4j in airgapped clusters.
- **Performance**: Ensure graph reasoning stays within millisecond range by pruning window size and caching centrality.
- **Feature Parity**: Some OpenRCA heuristics rely on ML models; start with rule-based scoring, plan backlog item for learning enhancements.
- **Ops Complexity**: Document new components (graph store, rule packs) and add health checks/telemetry.

## 11. Open Questions
- Do we need full Neo4j feature set or can we store graph snapshots in Weaviate?
- Should we support hybrid mode (call existing OpenRCA Python service when not airgapped)?
- How will multi-tenancy map to graph partitions (separate graphs vs tenant property)?

---
_Last updated: 2024-09-22_
