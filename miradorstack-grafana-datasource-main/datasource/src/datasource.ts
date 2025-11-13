import {
  CoreApp,
  DataQueryRequest,
  DataQueryResponse,
  DataSourceApi,
  DataSourceInstanceSettings,
  createDataFrame,
  FieldType,
  MetricFindValue,
  DataSourceGetTagKeysOptions,
  DataSourceGetTagValuesOptions,
  ScopedVars,
  AdHocVariableFilter,
  QueryFixAction,
  TimeRange,
} from '@grafana/data';
import { BackendSrvRequest, getBackendSrv } from '@grafana/runtime';

import { MyQuery, MyDataSourceOptions, LogEntry } from './types';
import { MiradorAPIClient } from './api/MiradorAPIClient';
import { getQueryHints } from '@grafana/prometheus';

export class DataSource extends DataSourceApi<MyQuery, MyDataSourceOptions> {
  baseUrl: string;
  private client: MiradorAPIClient;
  // Debug: store last fetched metric/label arrays so the UI can display them
  public lastMetrics: string[] = [];
  public lastLabels: string[] = [];
  public lastLabelValues: Record<string, string[]> = {};

  // Add language provider for PromQL compatibility
  languageProvider = {
    request: async (url: string, params?: any, options?: any) => {
      // Handle Prometheus API endpoints by mapping them to MiradorStack API calls
      if (url.startsWith('/api/v1/')) {
        if (url === '/api/v1/label/__name__/values') {
          // Map to MiradorStack metrics names endpoint
          try {
            const metrics = await this.client.metricsNames();
            // Log returned shape so we can verify what Grafana receives
            console.log('languageProvider: /api/v1/label/__name__/values ->', metrics);
            // Store for on-screen debug
            try {
              this.lastMetrics = Array.isArray((metrics as any).data) ? (metrics as any).data : [];
            } catch (e) {
              this.lastMetrics = [];
            }
            // Return the raw array of metric names (Prometheus API returns {status,data: [...]})
            return Array.isArray((metrics as any).data) ? (metrics as any).data : metrics;
          } catch (error) {
            console.error('Failed to get metrics for __name__:', error);
            return {
              status: 'success',
              data: []
            };
          }
        } else if (url.startsWith('/api/v1/label/') && url.endsWith('/values')) {
          // Handle other label values queries
          const labelName = url.split('/api/v1/label/')[1].split('/values')[0];
          try {
            const values = await this.client.labelValues(labelName);
            console.log(`languageProvider: /api/v1/label/${labelName}/values ->`, values);
            // Store for debug UI
            try {
              this.lastLabelValues[labelName] = Array.isArray((values as any).data) ? (values as any).data : [];
            } catch (e) {
              this.lastLabelValues[labelName] = [];
            }
            // Return raw array
            return Array.isArray((values as any).data) ? (values as any).data : values;
          } catch (error) {
            console.error(`Failed to get values for label ${labelName}:`, error);
            return {
              status: 'success',
              data: []
            };
          }
        } else if (url === '/api/v1/labels') {
          // Return available label keys
          try {
            const labels = await this.client.metricsLabels();
            console.log('languageProvider: /api/v1/labels ->', labels);
            // Store for debug UI
            try {
              this.lastLabels = Array.isArray((labels as any).data) ? (labels as any).data : [];
            } catch (e) {
              this.lastLabels = [];
            }
            // Return raw array of labels
            return Array.isArray((labels as any).data) ? (labels as any).data : labels;
          } catch (error) {
            console.error('Failed to get labels:', error);
            return {
              status: 'success',
              data: ['__name__']
            };
          }
        }
      }
      
      // For other URLs, use the standard resource routing
      return this.getResource(url, params, options);
    },
    start: async (): Promise<void> => {
      // Initialize the language provider
      // In Prometheus datasource, this might load initial data
    },
    getLabelKeys: () => ['__name__'],
    // Return empty for synchronous getLabelValues so the builder will call
    // async queryLabelValues instead of using a static cached list.
    getLabelValues: (key: string) => {
      return [];
    },
    retrieveMetricsMetadata: (): Record<string, { type: string; help: string; unit?: string }> => {
      // Return empty metadata for synchronous calls
      return {};
    },
    queryMetricsMetadata: async (limit?: number) => {
      try {
        const metricsResponse = await this.client.metricsNames();
        const metrics = Array.isArray(metricsResponse.data) ? metricsResponse.data : [];
        
        // Create basic metadata for each metric
        const metadata: { [metric: string]: { type: string; help: string; unit?: string } } = {};
        
        // Limit the number of metrics if specified
        const limitedMetrics = limit ? metrics.slice(0, limit) : metrics;
        
        limitedMetrics.forEach((metric: string) => {
          metadata[metric] = {
            type: 'gauge', // Default type, MiradorStack doesn't provide metric types
            help: `Metric: ${metric}`,
            unit: undefined // MiradorStack doesn't provide units
          };
        });
        
        return metadata;
      } catch (error) {
        console.error('Failed to query metrics metadata:', error);
        return {};
      }
    },
    queryLabelKeys: async (timeRange: TimeRange, match?: string, limit?: number) => {
      try {
        // Convert timeRange to strings for the API
        const start = timeRange.from.toISOString();
        const end = timeRange.to.toISOString();
        
        // Parse match parameter if provided (PromQL selector)
        let matchArray: string[] | undefined;
        if (match) {
          // Simple parsing of PromQL selector like {job="api",instance="web-01"}
          // For now, we'll pass it as a single match if it's not empty
          matchArray = [match];
        }
        
        const labelsResponse = await this.client.metricsLabels(matchArray, start, end);
        const labels = labelsResponse.data || [];
        // Always include __name__ as it's a special label for metrics
        const allLabels = Array.from(new Set(['__name__', ...labels]));
        return limit ? allLabels.slice(0, limit) : allLabels;
      } catch (error) {
        console.error('Failed to query label keys:', error);
        // Fallback to common labels
        const commonLabels = [
          'job',
          'instance',
          'hostname',
          'service',
          'namespace',
          'pod',
          'container',
          '__name__'
        ];
        return limit ? commonLabels.slice(0, limit) : commonLabels;
      }
    },
    queryLabelValues: async (timeRange: TimeRange, labelKey: string, match?: string, limit?: number) => {
      try {
        if (labelKey === '__name__') {
          // For __name__, get actual metrics
          const metricsResponse = await this.client.metricsNames();
          const values = Array.isArray(metricsResponse.data) ? metricsResponse.data : [];
          return limit ? values.slice(0, limit) : values;
        } else {
          // For other labels, get actual label values
          const labelValuesResponse = await this.client.labelValues(labelKey);
          const values = Array.isArray(labelValuesResponse.data) ? labelValuesResponse.data : [];
          return limit ? values.slice(0, limit) : values;
        }
      } catch (error) {
        console.error(`Failed to get values for label ${labelKey}:`, error);
        // Fallback values
        if (labelKey === '__name__') {
          return ['cpu_usage', 'memory_usage', 'disk_usage'];
        } else {
          return [];
        }
      }
    },
    retrieveMetrics: async () => {
      try {
        const metricsResponse = await this.client.metricsNames();
        return Array.isArray(metricsResponse.data) ? metricsResponse.data : [];
      } catch (error) {
        console.error('Failed to retrieve metrics:', error);
        return [];
      }
    },
  };

  constructor(instanceSettings: DataSourceInstanceSettings<MyDataSourceOptions>) {
    super(instanceSettings);
    this.baseUrl = instanceSettings.url!;
    this.client = new MiradorAPIClient(
      this.baseUrl,
      undefined, // Let Grafana's backend proxy handle authentication
      instanceSettings.jsonData.tenantId
    );
  }

  /**
   * Make a GET request to the datasource resource path
   * Routes through /api/datasources/uid/{uid}/resources{path}
   */
  getResource<T = any>(path: string, params?: BackendSrvRequest['params'], options?: Partial<BackendSrvRequest>): Promise<T> {
    return getBackendSrv().get(`/api/datasources/uid/${this.uid}/resources${path}`, params, undefined, options);
  }

  /**
   * Send a POST request to the datasource resource path
   * Routes through /api/datasources/uid/{uid}/resources{path}
   */
  postResource<T = unknown>(path: string, data?: BackendSrvRequest['data'], options?: Partial<BackendSrvRequest>): Promise<T> {
    return getBackendSrv().post(`/api/datasources/uid/${this.uid}/resources${path}`, data, options);
  }

  getDefaultQuery(_: CoreApp): Partial<MyQuery> {
    return {
      queryType: 'logs',
      queryText: '',
      editorMode: 'code', // Default to code mode
      queryEngine: 'bleve',
      metricsQueryType: 'range',
      step: '15s',
      metricsEditorMode: 'code', // Default to code mode for metrics
      metricsVisualQuery: {
        metric: '',
        labels: [],
        operations: []
      }
    };
  }

  filterQuery(query: MyQuery): boolean {
    // if no query has been provided, prevent the query from being executed
    return !!query.queryText;
  }

  async query(options: DataQueryRequest<MyQuery>): Promise<DataQueryResponse> {
    const { range } = options;
    const from = range!.from.valueOf();
    const to = range!.to.valueOf();

    const data = await Promise.all(
      options.targets.map(async (target) => {
        try {
          switch (target.queryType) {
            case 'logs':
              // Build the query with time range included in the query string
              let userQuery = target.queryText || '';
              
              // Check if user already included time range in their query
              const hasTimeFilter = userQuery.includes('_time:') || userQuery.includes('_time ');
              
              let finalQuery = userQuery;
              if (!hasTimeFilter) {
                // Convert Grafana time range to Lucene time range format
                const fromTime = new Date(from).toISOString();
                const toTime = new Date(to).toISOString();
                const timeFilter = `_time:[${fromTime} TO ${toTime}]`;
                
                if (userQuery.trim()) {
                  finalQuery = `${timeFilter} AND (${userQuery})`;
                } else {
                  finalQuery = timeFilter;
                }
              }
              
              const logsQuery = {
                query: finalQuery,
                // Still include start/end as fallback, but query time filter takes precedence
                start: from,
                end: to,
                limit: 1000,
                search_engine: target.queryEngine || 'bleve',
                query_language: target.queryLanguage || 'lucene'
              };
              
              console.log('🔍 Logs Query Debug:', {
                originalQuery: target.queryText,
                timeRange: { 
                  from: new Date(from).toISOString(), 
                  to: new Date(to).toISOString(),
                  fromMs: from,
                  toMs: to
                },
                hasTimeFilter,
                finalQuery,
                fullQuery: logsQuery
              });
              
              const logsResponse = await this.client.logs(logsQuery);
              
              console.log('📋 Logs Response Debug:', {
                status: logsResponse?.status,
                dataStructure: {
                  hasData: !!logsResponse?.data,
                  hasLogs: !!logsResponse?.data?.logs,
                  logsCount: logsResponse?.data?.logs?.length || 0,
                  fields: logsResponse?.data?.fields || []
                },
                sample: logsResponse?.data?.logs?.[0] || null
              });
              
              return this.parseLogsResponse(logsResponse, target.refId);
            case 'metrics':
              let metricsResponse;
              const queryType = target.metricsQueryType || 'range';

              switch (queryType) {
                case 'instant':
                  metricsResponse = await this.client.metricsQuery({
                    query: target.queryText || '',
                    time: Math.floor(to / 1000).toString(),
                    include_definitions: target.includeDefinitions ?? true,
                    label_keys: target.labelKeys
                  });
                  break;
                case 'aggregate':
                  metricsResponse = await this.client.metricsAggregate(
                    target.functionName || 'sum',
                    { query: target.queryText || '' }
                  );
                  break;
                case 'rollup':
                  metricsResponse = await this.client.metricsRollup(
                    target.functionName || 'rate',
                    { query: target.queryText || '' }
                  );
                  break;
                case 'transform':
                  metricsResponse = await this.client.metricsTransform(
                    target.functionName || 'abs',
                    { query: target.queryText || '' }
                  );
                  break;
                case 'label':
                  metricsResponse = await this.client.metricsLabel(
                    target.functionName || 'label_replace',
                    { query: target.queryText || '' }
                  );
                  break;
                case 'range':
                default:
                  metricsResponse = await this.client.metricsQueryRange({
                    query: target.queryText || '',
                    start: (from / 1000).toString(),
                    end: (to / 1000).toString(),
                    step: target.step || '15s',
                    include_definitions: target.includeDefinitions ?? true,
                    label_keys: target.labelKeys
                  });
                  break;
              }

              return this.parseMetricsResponse(metricsResponse, target.refId);
            case 'traces':
              const tracesResponse = await this.client.traces({ 
                query: target.queryText || '', 
                start: from, 
                end: to,
                query_language: 'lucene', // Only lucene supported for traces
                search_engine: target.queryEngine || 'bleve'
              });
              return this.parseTracesResponse(tracesResponse, target.refId);
            default:
              return createDataFrame({
                refId: target.refId,
                fields: [
                  { name: 'Time', values: [from, to], type: FieldType.time },
                  { name: 'value', values: [0, 0], type: FieldType.number },
                ],
              });
          }
        } catch (error) {
          console.error('Query error:', error);
          return createDataFrame({
            refId: target.refId,
            fields: [
              { name: 'Time', values: [from, to], type: FieldType.time },
              { name: 'value', values: [0, 0], type: FieldType.number },
            ],
          });
        }
      })
    );

    return { data };
  }

  private parseLogsResponse(response: any, refId: string) {
    // Handle Grafana's backend proxy wrapping
    const apiResponse = response?.data || response;

    // Extract log entries from the response
    let logEntries: LogEntry[] = [];

    if (apiResponse.data?.logs && Array.isArray(apiResponse.data.logs)) {
      // Mirador Core format with data.logs
      logEntries = apiResponse.data.logs;
    } else if (apiResponse.logs && Array.isArray(apiResponse.logs)) {
      // Alternative: logs directly under response
      logEntries = apiResponse.logs;
    } else if (Array.isArray(apiResponse.data)) {
      // Direct array format
      logEntries = apiResponse.data;
    } else if (apiResponse.data?.result && Array.isArray(apiResponse.data.result)) {
      // VictoriaLogs format with data.result
      logEntries = apiResponse.data.result;
    } else if (apiResponse.result && Array.isArray(apiResponse.result)) {
      // Alternative format
      logEntries = apiResponse.result;
    }

    if (logEntries.length === 0) {
      // Return empty DataFrame if no logs
      return createDataFrame({
        refId,
        fields: [
          { name: 'timestamp', type: FieldType.time, values: [] },
          { name: 'body', type: FieldType.string, values: [] },
          { name: 'severity', type: FieldType.string, values: [] },
        ],
      });
    }

    // Transform log entries to Grafana format
    const times: number[] = [];
    const messages: string[] = [];
    const levels: string[] = [];
    const labels: Record<string, string[]> = {};

    logEntries.forEach((entry) => {
      // Parse timestamp - Mirador Core uses _time field
      const timestamp = entry._time ? new Date(entry._time).getTime() : Date.now();
      times.push(timestamp);

      // Message field - Mirador Core uses _msg
      const message = entry._msg || entry.message || JSON.stringify(entry);
      messages.push(message);

      // Level field - Mirador Core uses severity
      const level = entry.severity || entry.level || 'unknown';
      levels.push(level);

      // Collect additional fields as labels
      Object.keys(entry).forEach((key) => {
        if (!['_time', '_msg', 'message', 'level', 'severity', '_stream', '_stream_id'].includes(key)) {
          if (!labels[key]) {
            labels[key] = [];
          }
          labels[key].push(String(entry[key]));
        }
      });
    });

    // Create fields array with Grafana-expected names
    const fields = [
      { name: 'timestamp', type: FieldType.time, values: times },
      { name: 'body', type: FieldType.string, values: messages },
      { name: 'severity', type: FieldType.string, values: levels },
    ];

    // Add label fields
    Object.keys(labels).forEach((labelKey) => {
      fields.push({
        name: labelKey,
        type: FieldType.string,
        values: labels[labelKey],
      });
    });

    return createDataFrame({
      refId,
      fields,
    });
  }

  private parseMetricsResponse(response: any, refId: string) {
    // Handle Grafana's backend proxy wrapping
    const apiResponse = response?.data || response;

    // Extract metrics data from VictoriaMetrics/Prometheus format
    const results = apiResponse?.data?.result || apiResponse?.result || [];

    if (!Array.isArray(results) || results.length === 0) {
      // Return empty DataFrame if no metrics data
      return createDataFrame({
        refId,
        fields: [
          { name: 'Time', type: FieldType.time, values: [] },
          { name: 'value', type: FieldType.number, values: [] },
        ],
      });
    }

    // For now, handle the first result (we can expand this for multiple series)
    const firstResult = results[0];
    const metricLabels = firstResult.metric || {};
    
    // Create metric name from labels
    const metricName = metricLabels.__name__ || firstResult.query || 'value';
    
    // Handle both instant query (value: [timestamp, value]) and range query (values: [[timestamp, value], ...])
    let times: number[] = [];
    let metricValues: number[] = [];

    if (firstResult.values && Array.isArray(firstResult.values)) {
      // Range query: values is array of [timestamp, value] pairs
      firstResult.values.forEach(([timestamp, value]: [string | number, string | number]) => {
        times.push(parseFloat(String(timestamp)) * 1000); // Convert to milliseconds
        metricValues.push(parseFloat(String(value)));
      });
    } else if (firstResult.value && Array.isArray(firstResult.value)) {
      // Instant query: value is [timestamp, value] pair
      const [timestamp, value] = firstResult.value as [string | number, string | number];
      times.push(parseFloat(String(timestamp)) * 1000); // Convert to milliseconds
      metricValues.push(parseFloat(String(value)));
    } else {
      // No valid data
      return createDataFrame({
        refId,
        fields: [
          { name: 'Time', type: FieldType.time, values: [] },
          { name: 'value', type: FieldType.number, values: [] },
        ],
      });
    }

    // Create fields
    const fields = [
      { name: 'Time', type: FieldType.time, values: times },
      { name: metricName, type: FieldType.number, values: metricValues, labels: metricLabels },
    ];

    return createDataFrame({
      refId,
      fields,
    });
  }

  private parseTracesResponse(response: any, refId: string) {
    // Handle Grafana's backend proxy wrapping
    const apiResponse = response?.data || response;

    // Extract traces data from the response
    const traces = apiResponse?.traces || apiResponse?.data?.traces || [];

    if (!Array.isArray(traces) || traces.length === 0) {
      // Return empty DataFrame if no traces data
      return createDataFrame({
        refId,
        fields: [
          { name: 'traceID', type: FieldType.string, values: [] },
          { name: 'startTime', type: FieldType.time, values: [] },
          { name: 'duration', type: FieldType.number, values: [] },
          { name: 'serviceName', type: FieldType.string, values: [] },
          { name: 'operationName', type: FieldType.string, values: [] },
        ],
      });
    }

    // Parse traces data
    const traceIDs: string[] = [];
    const startTimes: number[] = [];
    const durations: number[] = [];
    const serviceNames: string[] = [];
    const operationNames: string[] = [];

    traces.forEach((trace: any) => {
      traceIDs.push(trace.traceID || trace.trace_id || '');
      startTimes.push(new Date(trace.startTime || trace.start_time || 0).getTime());
      durations.push(trace.duration || 0);
      serviceNames.push(trace.serviceName || trace.service_name || '');
      operationNames.push(trace.operationName || trace.operation_name || '');
    });

    return createDataFrame({
      refId,
      fields: [
        { name: 'traceID', type: FieldType.string, values: traceIDs },
        { name: 'startTime', type: FieldType.time, values: startTimes },
        { name: 'duration', type: FieldType.number, values: durations },
        { name: 'serviceName', type: FieldType.string, values: serviceNames },
        { name: 'operationName', type: FieldType.string, values: operationNames },
      ],
    });
  }

  async testDatasource() {
    const defaultErrorMessage = 'Cannot connect to API';

    try {
      const healthResponse = await this.client.health();

      // The response from getBackendSrv().fetch() includes status, data, etc.
      // Check if we have a successful response and the data indicates healthy status
      if (healthResponse.status === 200) {
        const data = healthResponse.data;
        // Check if the response data has the expected health structure
        if (data && (data.status === 'healthy' || data.status === 'ok')) {
          return {
            status: 'success',
            message: `Successfully connected to ${data.service || 'Mirador Core'} v${data.version || 'unknown'}`,
          };
        } else if (data) {
          // If we have data but status is not healthy, show the actual status
          return {
            status: 'error',
            message: `Service status: ${data.status || 'unknown'}`,
          };
        } else {
          // If no data, assume success since we got 200
          return {
            status: 'success',
            message: 'Successfully connected to Mirador Core API',
          };
        }
      } else {
        return {
          status: 'error',
          message: `HTTP ${healthResponse.status}: ${healthResponse.statusText || 'Connection failed'}`,
        };
      }
    } catch (err: any) {
      return {
        status: 'error',
        message: err.message || defaultErrorMessage,
      };
    }
  }

  // Query hints for the visual query builder
  getQueryHints(query: MyQuery, results: unknown[]): Array<import('@grafana/data').QueryHint> {
    // Use the Prometheus getQueryHints function for metrics queries
    if (query.queryType === 'metrics' && query.queryText) {
      return getQueryHints(query.queryText, results, this as any);
    }
    return [];
  }

  // Tag/label methods for visual query builder
  async getTagKeys(options: DataSourceGetTagKeysOptions<MyQuery>): Promise<MetricFindValue[]> {
    // For now, return some common label keys
    // In a real implementation, this would query the Mirador API for available label keys
    const commonLabels = [
      'job',
      'instance',
      'hostname',
      'service',
      'namespace',
      'pod',
      'container'
    ];

    return commonLabels.map(label => ({ text: label, value: label }));
  }

  async getTagValues(options: DataSourceGetTagValuesOptions<MyQuery>): Promise<MetricFindValue[]> {
    // For now, return some sample values for the requested key
    // In a real implementation, this would query the Mirador API for label values
    const sampleValues = [
      'value1',
      'value2',
      'value3',
      'web-server',
      'api-gateway',
      'database'
    ];

    return sampleValues.map(value => ({ text: value, value }));
  }

  // Variable interpolation
  interpolateVariablesInQueries(queries: MyQuery[], scopedVars: ScopedVars, filters?: AdHocVariableFilter[]): MyQuery[] {
    // Basic implementation - in a real datasource this would interpolate variables
    return queries;
  }

  // Query modification for hints
  modifyQuery(query: MyQuery, action: QueryFixAction): MyQuery {
    // Basic implementation - apply the suggested fix to the query
    if (action.type === 'ADD_FILTER' && action.options?.label && action.options?.value) {
      // For metrics queries, add a label filter
      if (query.queryType === 'metrics' && query.metricsVisualQuery) {
        const newLabels = [...(query.metricsVisualQuery.labels || []), {
          label: action.options.label,
          op: '=',
          value: action.options.value
        }];
        return {
          ...query,
          metricsVisualQuery: {
            ...query.metricsVisualQuery,
            labels: newLabels
          }
        };
      }
    }
    return query;
  }

  // Adjusted interval for queries
  getAdjustedInterval(timeRange: TimeRange): { start: string; end: string } {
    // Basic implementation - return the time range as strings
    return {
      start: timeRange.from.toISOString(),
      end: timeRange.to.toISOString()
    };
  }

  // Get available variables for templating
  getVariables(): string[] {
    // Return common variable names that might be used in queries
    return ['$__interval', '$__interval_ms', '$__range', '$__range_ms', '$__rate_interval'];
  }

  // Get log fields for query editor
  async getLogFields(): Promise<string[]> {
    try {
      const response = await this.client.logFields();
      // API returns: {data: {fields: [...]}, status: "success"}
      // Extract the fields array from the nested response
      if (response?.data?.fields && Array.isArray(response.data.fields)) {
        return response.data.fields;
      }
      // Fallback for different response formats
      if (Array.isArray(response)) {
        return response;
      }
      console.warn('Unexpected logFields response format:', response);
      return [];
    } catch (error) {
      console.error('Failed to get log fields:', error);
      return [];
    }
  }

  // Metric finding for query builder suggestions
  async metricFindQuery(query: string): Promise<MetricFindValue[]> {
    try {
      // Fetch available metric names from Mirador API
      const metricsResponse = await this.client.metricsNames();
      let metrics: string[] = [];
      
      // Handle both nested format {data: {names: [...]}} and direct array format
      if (Array.isArray(metricsResponse)) {
        metrics = metricsResponse;
      } else if ((metricsResponse as any)?.data && Array.isArray((metricsResponse as any).data)) {
        metrics = (metricsResponse as any).data;
      } else {
        // Fallback if response format is unexpected
        metrics = [];
      }

      // Ensure metrics is an array
      if (!Array.isArray(metrics)) {
        metrics = [];
      }

      // Filter metrics based on the query string
      const filteredMetrics = metrics.filter((metric: string) =>
        typeof metric === 'string' && (metric.toLowerCase().includes(query.toLowerCase()) || query === '')
      );

      return filteredMetrics.map((metric: string) => ({ text: metric, value: metric }));
    } catch (error) {
      console.error('Failed to find metrics:', error);
      // Fallback to some common metrics if API fails
      const commonMetrics = [
        'cpu_usage',
        'memory_usage',
        'disk_usage',
        'network_traffic',
        'http_requests_total',
        'response_time',
        'error_rate'
      ];

      return commonMetrics
        .filter(metric => typeof metric === 'string' && (metric.includes(query) || query === ''))
        .map(metric => ({ text: metric, value: metric }));
    }
  }
}
