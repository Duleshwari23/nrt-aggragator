# MiradorStack Playground

A demo playground for showcasing MiradorStack capabilities with a simple Spring Boot application and the full MiradorStack observability platform.

## Components

### 1. appServer ✅
A Spring Boot application that demonstrates basic CRUD operations with dual storage (Valkey and simulated Cassandra).

**APIs:**
- `GET /api/read/{key}` - Read from both Valkey and Cassandra
- `POST /api/create?key={key}&value={value}` - Create key-value pair
- `PUT /api/modify/{key}?value={value}` - Modify existing value
- `DELETE /api/delete/{key}` - Delete key from both stores

**Services:**
- Spring Boot app on port 8081
- Valkey (Redis-compatible) on port 6380
- Cassandra on port 9042

**API Documentation:**
- Swagger UI: http://localhost:8081/swagger-ui.html
- OpenAPI JSON: http://localhost:8081/v3/api-docs

### 2. miradorstackServer 🚧
Full observability stack with OTEL pipelines, VictoriaMetrics, logs, traces, and MiradorStack components.

**Services:**
- OTEL Collector (gRPC:4317, HTTP:4318)
- VictoriaMetrics (8428)
- VictoriaLogs (9428)
- VictoriaTraces (10428)
- Mirador Core (8010, 9090)
- Mirador RCA (8082)
- vLLM for RCA (8000)

## Usage

### Start appServer
```bash
cd appserver
docker-compose up -d
```

### Start miradorstackServer
```bash
cd miradorserver
docker-compose up -d
```

### Test APIs
```bash
# Create
curl -X POST "http://localhost:8081/api/create?key=test&value=hello"

# Read
curl "http://localhost:8081/api/read/test"

# Modify
curl -X PUT "http://localhost:8081/api/modify/test?value=world"

# Delete
curl -X DELETE "http://localhost:8081/api/delete/test"
```

### View API Documentation
Open http://localhost:8081/swagger-ui.html in your browser to explore and test the APIs interactively.

## Architecture

The playground demonstrates:
1. **Data Layer**: Valkey for caching, Cassandra for persistence
2. **Application Layer**: Spring Boot REST API with OpenAPI/Swagger documentation
3. **Observability Layer**: OTEL for telemetry, VictoriaMetrics for metrics/logs/traces, MiradorStack for analysis

## Status
- ✅ appServer: Fully functional with working APIs and Swagger documentation
- 🚧 miradorstackServer: Docker images built, docker-compose configured, ready for testing