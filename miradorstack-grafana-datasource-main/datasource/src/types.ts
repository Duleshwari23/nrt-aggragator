import { DataQuery, DataSourceJsonData } from '@grafana/data';
import { PromVisualQuery } from '@grafana/prometheus/dist/types/querybuilder/types';

export interface MyQuery extends DataQuery {
  queryType: 'logs' | 'metrics' | 'traces';
  queryText: string;
  // Editor mode for logs (builder or code)
  editorMode?: 'builder' | 'code';
  // Visual query builder fields for logs (when editorMode is 'builder')
  visualQuery?: VisualQueryCondition[];
  // Query engine for logs and traces (lucene or bleve)
  queryEngine?: 'lucene' | 'bleve';
  // Query language for logs and traces (lucene or logsql for logs, lucene for traces)
  queryLanguage?: 'lucene' | 'logsql';
  // Metrics query type
  metricsQueryType?: 'instant' | 'range' | 'aggregate' | 'rollup' | 'transform' | 'label';
  // Function name for function-based queries
  functionName?: string;
  // Step for range queries
  step?: string;
  // Visual query builder for metrics
  metricsVisualQuery?: PromVisualQuery;
  // Editor mode for metrics (builder or code)
  metricsEditorMode?: 'builder' | 'code';
  // Include definitions in metrics response (default true)
  includeDefinitions?: boolean;
  // Label keys to restrict definitions to
  labelKeys?: string[];
}

export interface VisualQueryCondition {
  field: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'not_contains' | 'starts_with' | 'ends_with' | 'regex' | 'gt' | 'gte' | 'lt' | 'lte';
  value: string;
  logicalOperator?: 'AND' | 'OR';
}

export interface MyDataSourceOptions extends DataSourceJsonData {
  tenantId: string;
  authEnabled?: boolean;
}

export interface MySecureJsonData {
  token: string;
}

// API response types - simplified for now
export interface LogEntry {
  _time: string;
  _msg: string;
  level?: string;
  [key: string]: any;
}

export interface LogsResponse {
  data: {
    fields: string[];
    logs: LogEntry[];
    stats?: any;
  };
  metadata?: any;
  status: string;
}

export interface LogFieldsResponse {
  status: string;
  data: {
    fields: string[];
  };
}
