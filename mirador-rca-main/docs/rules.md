# Recommender Rule Pack

Rules live in `configs/rules/default.yaml` and are loaded via the `rules.path` config setting.

Each rule supports the following fields:

```yaml
- id: unique_rule_id
  match:
    service: "checkout"            # optional service name
    severity: "error"              # optional timeline severity
    selector_contains: ["cpu"]     # optional list of anchor selector substrings
  recommendations:
    - "Investigate upstream"
    - "Scale service"
```

Rules trigger when all provided match criteria align with the investigation request:

- `service` matches any affected service or red anchor service.
- `severity` matches any timeline event severity (case-insensitive).
- `selector_contains` matches if any red anchor selector contains one of the substrings.

Recommendations from the first matching rule are appended to the investigation output when Weaviate recall is unavailable.
