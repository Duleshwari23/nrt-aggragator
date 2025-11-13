# MiradorStack Grafana Datasource Plugin - Local Development

This guide explains how to set up a local development environment for the MiradorStack Grafana datasource plugin.

## Prerequisites

- Docker and Docker Compose
- Node.js and npm (for building the plugin)
- mirador-core running locally (optional, for testing)

## Quick Start

### 1. Start Development Environment

```bash
./localdev-up.sh
```

This script will:
- Build the datasource plugin
- Pull Grafana 12.2.0 Docker image
- Start Grafana with the plugin loaded
- Open Grafana in your browser (macOS)

### 2. Access Grafana

- **URL**: http://localhost:3000
- **Username**: admin
- **Password**: admin

### 3. Configure Data Source

1. Go to **Configuration → Data Sources**
2. Click **Add data source**
3. Search for and select **"MiradorStack Datasource"**
4. Configure the settings:
   - **URL**: `http://host.docker.internal:8081/api/v1` (if mirador-core is running locally)
   - **Tenant ID**: Your tenant ID
   - **Authentication**: Enable/disable as needed
   - **Bearer Token**: Your API token (if authentication enabled)

### 4. Test the Data Source

Click **"Save & Test"** to verify the connection to mirador-core.

## Development Workflow

### Making Changes

1. Edit the plugin code in `datasource/src/`
2. Rebuild the plugin:
   ```bash
   cd datasource
   npm run build
   ```
3. Restart the Grafana container:
   ```bash
   ./localdev-down.sh
   ./localdev-up.sh
   ```

### Viewing Logs

```bash
# View Grafana container logs
docker logs grafana-miradorstack-dev

# Follow logs in real-time
docker logs -f grafana-miradorstack-dev
```

### Debugging

- Plugin files are mounted as a volume at `/var/lib/grafana/plugins/platformbuilds-miradorstack-datasource`
- Check Grafana logs for plugin loading issues
- Ensure mirador-core is accessible from the container

## Scripts

- **`./localdev-up.sh`**: Start the development environment
- **`./localdev-down.sh`**: Stop and clean up the development environment

## Troubleshooting

### Plugin Not Loading

1. Check that the plugin built successfully: `cd datasource && npm run build`
2. Verify the plugin files exist in the container:
   ```bash
   docker exec grafana-miradorstack-dev ls -la /var/lib/grafana/plugins/platformbuilds-miradorstack-datasource/
   ```
3. Check Grafana logs for plugin loading errors

### Connection Issues

1. Ensure mirador-core is running and accessible
2. Use `host.docker.internal` to access services on the host machine
3. Check network connectivity from within the container

### Build Issues

1. Clear node_modules: `cd datasource && rm -rf node_modules && npm install`
2. Check for TypeScript errors: `npm run typecheck`
3. Verify all dependencies are installed

## Environment Variables

The development container uses these Grafana environment variables:

- `GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS`: Allows loading the unsigned plugin
- `GF_LOG_LEVEL`: Set to `info` for detailed logging
- `GF_SECURITY_ADMIN_PASSWORD`: Sets admin password to `admin`

## Network Configuration

- **Grafana**: http://localhost:3000
- **mirador-core** (if running): http://localhost:8081
- **Container access to host**: Use `host.docker.internal` instead of `localhost`

## File Structure

```
├── localdev-up.sh          # Start development environment
├── localdev-down.sh        # Stop development environment
├── datasource/             # Plugin source code
│   ├── src/               # TypeScript source
│   ├── dist/              # Built plugin files
│   └── package.json       # Plugin dependencies
└── plugin-temp/           # Temporary plugin files (created by script)
```