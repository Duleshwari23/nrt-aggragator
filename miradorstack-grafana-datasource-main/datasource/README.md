# MiradorStack Grafana Datasource Plugin

A Grafana datasource plugin that connects to MiradorStack's unified query interface through the Mirador Core API. This plugin enables seamless visualization of logs, metrics, and traces from your MiradorStack observability platform.

## Features

- **Unified Query Interface**: Connect to Mirador Core's unified query API for logs, metrics, and traces
- **Multiple Query Types**: Support for logs (Lucene/Bleve), metrics (PromQL-compatible), and traces
- **Visual Query Builder**: Intuitive query building interface for both logs and metrics
- **Authentication**: Secure token-based authentication with tenant isolation
- **Real-time Data**: Live data streaming and real-time dashboard updates

## Prerequisites

- Grafana 10.4.0 or higher
- MiradorStack platform with Mirador Core API running
- Valid tenant ID and authentication token (if authentication is enabled)

## Installation

### From Grafana Plugins Directory (Recommended)

1. Navigate to **Configuration → Plugins** in your Grafana instance
2. Search for "MiradorStack"
3. Click **Install** to add the plugin
4. Restart Grafana to activate the plugin

### Manual Installation

1. Download the latest release from the GitHub releases page
2. Extract the plugin to your Grafana plugins directory:
   ```bash
   unzip miradorstack-datasource-v1.0.0.zip -d /var/lib/grafana/plugins/
   ```
3. Restart Grafana

### Development Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/platformbuilds/miradorstack.git
   cd miradorstack/miradorstack-grafana-datasource/datasource
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build the plugin:
   ```bash
   npm run build
   ```

4. Start development environment:
   ```bash
   npm run server
   ```

## Configuration

1. In Grafana, navigate to **Configuration → Data Sources**
2. Click **Add data source**
3. Select **MiradorStack** from the list
4. Configure the connection settings:

### Connection Settings

- **URL**: The base URL of your Mirador Core API (e.g., `https://mirador-core.your-domain.com/api/v1`)
- **Tenant ID**: Your MiradorStack tenant identifier
- **Enable Authentication**: Toggle authentication on/off
- **Bearer Token**: Your API authentication token (if authentication is enabled)

### Example Configuration

```
URL: https://mirador-core.example.com/api/v1
Tenant ID: production-tenant
Authentication: Enabled
Bearer Token: eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...
```

5. Click **Save & Test** to verify the connection

## Usage

### Querying Logs

1. Create a new panel or edit an existing one
2. Select **MiradorStack** as the data source
3. Set **Query Type** to **Logs**
4. Choose your query engine:
   - **Bleve**: Fast full-text search (recommended)
   - **Lucene**: Advanced query syntax support

#### Log Query Examples

```
# Simple text search
error AND authentication

# Field-specific search
severity:ERROR AND service:api-gateway

# Time range with wildcards
timestamp:[2023-01-01 TO 2023-12-31] AND message:*timeout*

# Complex boolean queries
(level:ERROR OR level:WARN) AND NOT service:monitoring
```

### Querying Metrics

1. Set **Query Type** to **Metrics**
2. Choose the metrics query type:
   - **Range**: Time series data over a range
   - **Instant**: Single point-in-time value
   - **Aggregate**: Statistical aggregations (sum, avg, etc.)

#### Metric Query Examples

```promql
# CPU utilization over time
cpu_usage_percent{instance="web-server-1"}

# Memory usage with aggregation
avg(memory_usage_bytes) by (service)

# Rate of HTTP requests
rate(http_requests_total[5m])

# 95th percentile response time
histogram_quantile(0.95, rate(http_response_time_bucket[5m]))
```

### Querying Traces

1. Set **Query Type** to **Traces**
2. Enter trace search criteria
3. Use trace IDs or service names to filter

#### Trace Query Examples

```
# Find traces by service
service:user-service AND duration:>100ms

# Search by operation
operation:GET AND error:true

# Trace ID lookup
trace_id:abc123def456
```

## Query Builder

The plugin includes visual query builders for both logs and metrics:

### Log Query Builder

- **Field-based filters**: Select fields and apply operators
- **Logical operators**: Combine conditions with AND/OR
- **Auto-completion**: Field names and values are suggested
- **Syntax validation**: Real-time query validation

### Metrics Query Builder

- **Metric selection**: Browse available metrics
- **Label filtering**: Apply label-based filters
- **Function operations**: Apply PromQL functions
- **Aggregation**: Group by labels and apply aggregations

## Advanced Features

### Variables and Templating

The plugin supports Grafana's templating system:

```
# Use dashboard variables in queries
service:$service_name AND level:$log_level

# Metrics with template variables  
cpu_usage{instance=~"$instance"}
```

### Alerting

Configure alerts based on MiradorStack queries:

1. Create alert rules using metrics queries
2. Set thresholds and evaluation intervals
3. Configure notification channels
4. Test alert conditions

## Development

### Running Tests

```bash
# Unit tests
npm run test

# E2E tests
npm run e2e

# Type checking
npm run typecheck

# Linting
npm run lint
```

### Building for Production

```bash
# Production build
npm run build

# Plugin signing (requires Grafana API key)
npm run sign
```

## Troubleshooting

### Connection Issues

**Problem**: "Cannot connect to API" error during data source test

**Solutions**:
- Verify the Mirador Core API URL is correct and accessible
- Check if authentication is required and token is valid
- Ensure the tenant ID is correct
- Verify network connectivity between Grafana and Mirador Core
- Check Mirador Core service status and logs

### Query Issues

**Problem**: Queries return no data or fail

**Solutions**:
- Verify the query syntax matches the selected engine (Bleve/Lucene for logs, PromQL for metrics)
- Check the time range is appropriate for available data
- Ensure proper field names and labels in queries
- Review Mirador Core logs for query processing errors

### Performance Issues

**Problem**: Slow query responses or timeouts

**Solutions**:
- Optimize queries by adding specific filters
- Reduce time ranges for large datasets
- Use appropriate aggregation levels for metrics
- Consider indexing strategies in MiradorStack
- Monitor Mirador Core resource utilization

### Plugin Loading Issues

**Problem**: Plugin doesn't appear in data source list

**Solutions**:
- Restart Grafana after plugin installation
- Check Grafana logs for plugin loading errors
- Verify plugin files are in the correct directory
- Ensure Grafana version compatibility (≥10.4.0)

### Authentication Issues

**Problem**: Authentication failures or permission errors

**Solutions**:
- Verify bearer token is valid and not expired
- Check tenant ID matches your MiradorStack configuration
- Ensure token has appropriate permissions for query operations
- Review Mirador Core authentication logs

## API Reference

The plugin interacts with the following Mirador Core API endpoints:

### Health Check
```
GET /health
```

### Logs
```
POST /logs/query
GET /logs/fields
```

### Metrics  
```
POST /metrics/query
POST /metrics/query_range
GET /metrics/names
GET /metrics/labels
GET /label/{name}/values
```

### Traces
```
GET /traces
```

## Support

- **Documentation**: [MiradorStack Documentation](https://github.com/platformbuilds/miradorstack)
- **Issues**: [GitHub Issues](https://github.com/platformbuilds/miradorstack/issues)
- **Discussions**: [GitHub Discussions](https://github.com/platformbuilds/miradorstack/discussions)

## Contributing

We welcome contributions! Please see our [Contributing Guide](../CONTRIBUTING.md) for details on how to:

- Report bugs and request features
- Submit pull requests
- Set up the development environment
- Run tests and quality checks

## License

This plugin is licensed under the Apache License 2.0. See [LICENSE](LICENSE) for details.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for a complete list of changes and release notes.
