# Graph Schema & Rule Pack Specification

## 1. Graph Entities
| Entity | Description | Key Attributes |
| ------ | ----------- | -------------- |
| `Service` | Logical microservice or application component. | `id`, `name`, `tenant_id`, `team`, `tier`, `owner` |
| `Instance` | Runtime unit (pod, VM). | `id`, `service_id`, `environment`, `zone`, `node_id` |
| `Dependency` | External service or resource consumed. | `id`, `type`, `name`, `provider` |
| `Alert` | Aggregated alert signal (metric/log/trace). | `id`, `source_type`, `severity`, `symptom_id` |
| `Symptom` | Derived anomaly from extractors. | `id`, `signal_type`, `score`, `timestamp`, `anomaly_kind` |
| `Event` | Operational change (deploy, config). | `id`, `category`, `actor`, `timestamp` |
| `Pattern` | Stored failure pattern from Weaviate. | `id`, `name`, `prevalence`, `precision`, `recall` |

## 2. Relationships
| Relationship | Source → Target | Notes |
| ------------- | -------------- | ----- |
| `RUNS` | `Instance` → `Service` | Instance belongs to service. |
| `DEPENDS_ON` | `Service` → `Dependency`/`Service` | Weighted by trace-derived call frequency. |
| `EXPERIENCES` | `Service` → `Symptom` | Symptom affects service. |
| `RAISED_ALERT` | `Symptom` → `Alert` | One-to-many; alerts aggregate symptoms. |
| `CORRELATED_WITH` | `Symptom` → `Symptom` | Discovered via OpenRCA reasoner. |
| `PRECEDES` | `Event` → `Symptom` | Temporal sequence for causality. |
| `MATCHES_PATTERN` | `Symptom` → `Pattern` | Similarity score from Weaviate. |

Each relationship stores metadata: `confidence`, `weight`, `observed_at`, `source` (metrics/logs/traces).

## 3. Signal Mapping
- **Metrics**: `MetricAnomaly` ⇒ `Symptom(signal_type="metrics")` with `score`, `baseline`, `delta`.
- **Logs**: `LogAnomaly` ⇒ `Symptom(signal_type="logs")` with `severity`, `signature`.
- **Traces**: `TraceSpan` anomaly ⇒ `Symptom(signal_type="traces")` plus `edge_weight` updates for `DEPENDS_ON`.
- **Events**: mirador-core change feed (future) populates `Event` nodes.

## 4. Rule Pack Template
```
rules:
  - id: cpu_saturation_root_cause
    description: CPU saturation followed by error spike
    applies_to:
      service_tier: "backend"
    conditions:
      - symptom:
          signal_type: metrics
          selector: cpu_usage
          min_score: 3.0
      - symptom:
          signal_type: logs
          severity: error
          min_count_in_window: 10
    weighting:
      base_confidence: 0.6
      adjustments:
        - match_pattern: "pattern-1" -> +0.1
        - recent_deploy_within_minutes: 30 -> -0.05
    recommendations:
      - "Scale replica count"
      - "Check throttling settings"
  - id: dependency_latency
    description: Upstream dependency latency causing downstream errors
    conditions:
      - edge:
          type: DEPENDS_ON
          min_weight: 0.4
      - symptom:
          signal_type: traces
          selector: http.client.duration
          min_score: 2.5
      - symptom:
          signal_type: logs
          severity: error
          min_count_in_window: 5
    weighting:
      base_confidence: 0.5
      adjustments:
        - correlated_symptom_count: ">=3" -> +0.1
        - missing_pattern_match -> -0.05
    recommendations:
      - "Investigate upstream service health"
```

## 5. Storage & Synchronisation
- Graph data persisted in Neo4j (optional) or in-memory snapshot exported as JSON for airgapped deployments.
- Rule pack YAML stored in `configs/rules/default.yaml`; reload on SIGHUP.

## 6. Validation Checklist
- Schema aligns with OpenRCA entity/relationship types for compatibility.
- All nodes reference tenant IDs for isolation.
- Rule conditions map to extractor outputs (metrics/logs/traces) and allow pattern augmentation from external Weaviate.
