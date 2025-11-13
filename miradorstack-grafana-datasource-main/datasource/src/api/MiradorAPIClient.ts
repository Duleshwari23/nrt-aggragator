// Direct fetch API for frontend datasource - no Grafana backend service needed

export class MiradorAPIError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = 'MiradorAPIError';
  }
}

export class MiradorAPIClient {
  private apiBaseUrl: string;

  constructor(
    baseUrl: string,
    private token?: string,
    private tenantId?: string
  ) {
    // Ensure the base URL includes the API version path
    this.apiBaseUrl = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';
    if (!this.apiBaseUrl.includes('/api/v1')) {
      this.apiBaseUrl += 'api/v1';
    }
  }

  private async request(
    endpoint: string,
    method = 'get',
    params?: Record<string, any>,
    body?: any
  ): Promise<any> {
    const url = `${this.apiBaseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    if (this.tenantId) {
      headers['X-Tenant-ID'] = this.tenantId;
    }

    try {
      // Use fetch directly for frontend datasource instead of Grafana's backend service
      const fetchOptions: RequestInit = {
        method: method.toUpperCase(),
        headers,
        mode: 'cors', // Enable CORS for cross-origin requests
      };

      // Add query parameters to URL if provided
      let finalUrl = url;
      if (params && Object.keys(params).length > 0) {
        const searchParams = new URLSearchParams();
        Object.entries(params).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            if (Array.isArray(value)) {
              value.forEach(v => searchParams.append(key, String(v)));
            } else {
              searchParams.append(key, String(value));
            }
          }
        });
        finalUrl += `?${searchParams.toString()}`;
      }

      // Add body for POST/PUT requests
      if (body && (method.toLowerCase() === 'post' || method.toLowerCase() === 'put')) {
        fetchOptions.body = JSON.stringify(body);
      }

      const response = await fetch(finalUrl, fetchOptions);
      
      if (!response.ok) {
        throw new MiradorAPIError(
          `HTTP ${response.status}: ${response.statusText}`, 
          response.status
        );
      }

      // Handle both JSON and text responses
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        return await response.json();
      } else {
        const text = await response.text();
        try {
          return JSON.parse(text);
        } catch {
          return { data: text };
        }
      }
    } catch (error: any) {
      if (error instanceof MiradorAPIError) {
        throw error;
      }
      throw new MiradorAPIError(error.message || 'API request failed', error.status);
    }
  }

  async health(): Promise<{ status: number; data: { service: string; status: string; timestamp: string; version: string }; statusText?: string }> {
    return this.request('/health');
  }

  async logs(query: { 
    query: string; 
    start?: number; 
    end?: number; 
    limit?: number; 
    search_engine?: 'lucene' | 'bleve';
    query_language?: 'lucene' | 'logsql';
  }): Promise<any> {
    const body = {
      query: query.query,
      query_language: query.query_language || 'lucene',
      search_engine: query.search_engine || 'bleve', // Default to bleve as preferred
      start: query.start,
      end: query.end,
      limit: query.limit || 1000,
    };
    return this.request('/logs/query', 'post', undefined, body);
  }

  async metrics(query: { query: string; start?: number; end?: number }): Promise<any> {
    return this.request('/metrics', 'get', query);
  }

  async metricsQuery(query: { 
    query: string; 
    time?: string; 
    include_definitions?: boolean;
    label_keys?: string[];
  }): Promise<any> {
    const body = {
      query: query.query,
      ...(query.time && { time: query.time }),
      include_definitions: query.include_definitions ?? true,
      ...(query.label_keys && { label_keys: query.label_keys })
    };
    return this.request('/metrics/query', 'post', undefined, body);
  }

  async metricsQueryRange(query: { 
    query: string; 
    start: string; 
    end: string; 
    step?: string;
    include_definitions?: boolean;
    label_keys?: string[];
  }): Promise<any> {
    const body = {
      query: query.query,
      start: query.start,
      end: query.end,
      ...(query.step && { step: query.step }),
      include_definitions: query.include_definitions ?? true,
      ...(query.label_keys && { label_keys: query.label_keys })
    };
    return this.request('/metrics/query_range', 'post', undefined, body);
  }

  async metricsAggregate(functionName: string, query: { query: string; params?: Record<string, any> }): Promise<any> {
    const body = {
      query: query.query,
      ...(query.params && { params: query.params })
    };
    return this.request(`/metrics/query/aggregate/${functionName}`, 'post', undefined, body);
  }

  async metricsRollup(functionName: string, query: { query: string; params?: Record<string, any> }): Promise<any> {
    const body = {
      query: query.query,
      ...(query.params && { params: query.params })
    };
    return this.request(`/metrics/query/rollup/${functionName}`, 'post', undefined, body);
  }

  async metricsTransform(functionName: string, query: { query: string; params?: Record<string, any> }): Promise<any> {
    const body = {
      query: query.query,
      ...(query.params && { params: query.params })
    };
    return this.request(`/metrics/query/transform/${functionName}`, 'post', undefined, body);
  }

  async metricsLabel(functionName: string, query: { query: string; params?: Record<string, any> }): Promise<any> {
    const body = {
      query: query.query,
      ...(query.params && { params: query.params })
    };
    return this.request(`/metrics/query/label/${functionName}`, 'post', undefined, body);
  }

  async metricsNames(): Promise<{status: string, data: string[]}> {
    const response = await this.request('/metrics/names', 'get');
    // Handle response format: {"data": {"names": [...], "total": 10}, "status": "success"}
    // Transform to Prometheus format: {"status": "success", "data": [...]}
    if (response?.data?.names && Array.isArray(response.data.names)) {
      return {
        status: 'success',
        data: response.data.names
      };
    }
    return {
      status: 'success',
      data: []
    };
  }

  async metricsLabels(match?: string[], start?: string, end?: string): Promise<{status: string, data: string[]}> {
    const params: Record<string, any> = {};
    if (match && match.length > 0) {
      params['match[]'] = match;
    }
    if (start) {
      params.start = start;
    }
    if (end) {
      params.end = end;
    }
    const response = await this.request('/metrics/labels', 'get', params);
    // Handle response format: {"data": [...], "status": "success"}
    // Return in Prometheus format: {"status": "success", "data": [...]}
    if (response?.data && Array.isArray(response.data)) {
      return {
        status: 'success',
        data: response.data
      };
    }
    return {
      status: 'success',
      data: []
    };
  }

  async labelValues(name: string): Promise<{status: string, data: string[]}> {
    const response = await this.request(`/label/${name}/values`, 'get');
    // Handle response format: {"data": [...], "status": "success"}
    // Return in Prometheus format: {"status": "success", "data": [...]}
    if (response?.data && Array.isArray(response.data)) {
      return {
        status: 'success',
        data: response.data
      };
    }
    return {
      status: 'success',
      data: []
    };
  }

  async traces(query: { 
    query?: string; 
    start?: number; 
    end?: number; 
    query_language?: 'lucene';
    search_engine?: 'lucene' | 'bleve';
    limit?: number;
  }): Promise<any> {
    const body = {
      query: query.query || '',
      query_language: query.query_language || 'lucene',
      search_engine: query.search_engine || 'lucene',
      start: query.start,
      end: query.end,
      limit: query.limit || 1000,
    };
    return this.request('/traces/search', 'post', undefined, body);
  }

  async logFields(): Promise<any> {
    return this.request('/logs/fields', 'get');
  }

  // Additional metrics endpoints from mirador-core API
  async metricsSeries(match?: string[], start?: string, end?: string): Promise<any> {
    const params: Record<string, any> = {};
    if (match && match.length > 0) {
      params['match[]'] = match;
    }
    if (start) {
      params.start = start;
    }
    if (end) {
      params.end = end;
    }
    return this.request('/metrics/series', 'get', params);
  }

  // Additional logs endpoints
  async logsStreams(): Promise<any> {
    return this.request('/logs/streams', 'get');
  }

  async logsHistogram(query: { 
    query: string; 
    start?: number; 
    end?: number;
    query_language?: 'lucene' | 'logsql';
    search_engine?: 'lucene' | 'bleve';
  }): Promise<any> {
    const body = {
      query: query.query,
      query_language: query.query_language || 'lucene',
      search_engine: query.search_engine || 'bleve',
      start: query.start,
      end: query.end,
    };
    return this.request('/logs/histogram', 'post', undefined, body);
  }

  // Additional traces endpoints
  async tracesServices(): Promise<any> {
    return this.request('/traces/services', 'get');
  }

  async tracesServiceOperations(service: string): Promise<any> {
    return this.request(`/traces/services/${encodeURIComponent(service)}/operations`, 'get');
  }

  async tracesById(traceId: string): Promise<any> {
    return this.request(`/traces/${encodeURIComponent(traceId)}`, 'get');
  }

  async tracesFlamegraph(traceId: string): Promise<any> {
    return this.request(`/traces/${encodeURIComponent(traceId)}/flamegraph`, 'get');
  }

  // Add more methods as needed
}
