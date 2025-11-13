import React, { ChangeEvent, useState, useEffect, useCallback, Suspense } from 'react';
import { InlineField, Input, Select, Stack, Button, IconButton, RadioButtonGroup, Field, FieldSet, QueryField } from '@grafana/ui';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import i18n from 'i18next';

// Create and initialize an i18n instance for the PromQueryBuilder which
// uses react-i18next Trans internally. We initialize but don't await the
// promise; the provider accepts the instance immediately.
const i18nInstance = i18n.createInstance();
i18nInstance.use(initReactI18next);
// Initialize synchronously so calls to t() from imported modules or
// components used by PromQueryBuilder won't trigger the "t() was called
// before i18n was initialized" error. initImmediate:false forces init to
// complete synchronously when possible.
i18nInstance.init({
  lng: 'en',
  fallbackLng: 'en',
  resources: { en: { translation: {} } },
  interpolation: { escapeValue: false },
  initImmediate: false,
});
import { QueryEditorProps, SelectableValue } from '@grafana/data';
import { DataSource } from '../datasource';
import { MyDataSourceOptions, MyQuery, VisualQueryCondition } from '../types';
import { PromQueryModeller, buildVisualQueryFromString } from '@grafana/prometheus';
// Lazy-load PromQueryBuilder to avoid executing its module scope (which may call t())
const PromQueryBuilder = React.lazy(() => import('@grafana/prometheus').then(mod => ({ default: mod.PromQueryBuilder })));

type Props = QueryEditorProps<DataSource, MyQuery, MyDataSourceOptions>;

const queryTypeOptions: SelectableValue[] = [
  { label: 'Logs', value: 'logs' },
  { label: 'Metrics', value: 'metrics' },
  { label: 'Traces', value: 'traces' },
];

const queryEngineOptions: SelectableValue[] = [
  { label: 'Bleve (Recommended)', value: 'bleve' },
  { label: 'Lucene', value: 'lucene' },
];

const editorModeOptions = [
  { label: 'Builder', value: 'builder' },
  { label: 'Code', value: 'code' },
];

const operatorOptions: SelectableValue[] = [
  { label: '=', value: 'equals' },
  { label: '!=', value: 'not_equals' },
  { label: 'contains', value: 'contains' },
  { label: 'not contains', value: 'not_contains' },
  { label: 'starts with', value: 'starts_with' },
  { label: 'ends with', value: 'ends_with' },
  { label: 'regex', value: 'regex' },
  { label: '>', value: 'gt' },
  { label: '>=', value: 'gte' },
  { label: '<', value: 'lt' },
  { label: '<=', value: 'lte' },
];

const metricsQueryTypeOptions: SelectableValue[] = [
  { label: 'Instant Query', value: 'instant' },
  { label: 'Range Query', value: 'range' },
  { label: 'Aggregate Function', value: 'aggregate' },
  { label: 'Rollup Function', value: 'rollup' },
  { label: 'Transform Function', value: 'transform' },
  { label: 'Label Function', value: 'label' },
];

const aggregateFunctions: SelectableValue[] = [
  { label: 'sum', value: 'sum' },
  { label: 'avg', value: 'avg' },
  { label: 'count', value: 'count' },
  { label: 'min', value: 'min' },
  { label: 'max', value: 'max' },
  { label: 'median', value: 'median' },
  { label: 'quantile', value: 'quantile' },
  { label: 'topk', value: 'topk' },
  { label: 'bottomk', value: 'bottomk' },
  { label: 'distinct', value: 'distinct' },
  { label: 'histogram', value: 'histogram' },
  { label: 'stddev', value: 'stddev' },
  { label: 'stdvar', value: 'stdvar' },
  { label: 'mode', value: 'mode' },
  { label: 'skewness', value: 'skewness' },
  { label: 'kurtosis', value: 'kurtosis' },
];

const rollupFunctions: SelectableValue[] = [
  { label: 'increase', value: 'increase' },
  { label: 'rate', value: 'rate' },
  { label: 'delta', value: 'delta' },
  { label: 'irate', value: 'irate' },
  { label: 'idelta', value: 'idelta' },
];

const transformFunctions: SelectableValue[] = [
  { label: 'abs', value: 'abs' },
  { label: 'ceil', value: 'ceil' },
  { label: 'floor', value: 'floor' },
  { label: 'round', value: 'round' },
  { label: 'sqrt', value: 'sqrt' },
  { label: 'ln', value: 'ln' },
  { label: 'log2', value: 'log2' },
  { label: 'log10', value: 'log10' },
];

const labelFunctions: SelectableValue[] = [
  { label: 'label_replace', value: 'label_replace' },
  { label: 'label_join', value: 'label_join' },
  { label: 'label_drop', value: 'label_drop' },
  { label: 'label_keep', value: 'label_keep' },
];

const logicalOperatorOptions: SelectableValue[] = [
  { label: 'AND', value: 'AND' },
  { label: 'OR', value: 'OR' },
];

const metricsEditorModeOptions = [
  { label: 'Builder', value: 'builder' },
  { label: 'Code', value: 'code' },
];

export function QueryEditor({ query, onChange, onRunQuery, datasource }: Props) {
  const [logFields, setLogFields] = useState<string[]>([]);
  const [loadingFields, setLoadingFields] = useState(false);

  const modeller = new PromQueryModeller();

  const { queryType, queryText, editorMode, visualQuery, queryEngine, metricsQueryType, functionName, step, metricsVisualQuery, metricsEditorMode } = query;

  const loadLogFields = useCallback(async () => {
    if (!datasource) {return;}

    setLoadingFields(true);
    try {
      const fields = await datasource.getLogFields();
      setLogFields(fields);
    } catch (error) {
      console.error('Failed to load log fields:', error);
      setLogFields(['timestamp', 'body', 'severity']);
    } finally {
      setLoadingFields(false);
    }
  }, [datasource]);

  useEffect(() => {
    if (queryType === 'logs' && editorMode === 'builder') {
      loadLogFields();
    }
  }, [queryType, editorMode, loadLogFields]);

  const onQueryTypeChange = (value: SelectableValue) => {
    onChange({ ...query, queryType: value.value });
  };

  const onQueryEngineChange = (value: SelectableValue) => {
    onChange({ ...query, queryEngine: value.value });
  };

  const onEditorModeChange = (value: string) => {
    const newEditorMode = value as 'builder' | 'code';
    let newQuery = { ...query, editorMode: newEditorMode };

    // If switching to builder mode and no visual query exists, create initial condition
    if (newEditorMode === 'builder' && (!visualQuery || visualQuery.length === 0)) {
      newQuery.visualQuery = [{
        field: logFields.length > 0 ? logFields[0] : '',
        operator: 'equals',
        value: '',
        logicalOperator: 'AND'
      }];
      newQuery.queryText = '';
    }
    // If switching to code mode, generate query text from visual query
    else if (newEditorMode === 'code' && visualQuery && visualQuery.length > 0) {
      newQuery.queryText = buildLuceneQuery(visualQuery);
    }

    onChange(newQuery);
  };

  const onVisualQueryChange = (newVisualQuery: VisualQueryCondition[]) => {
    const luceneQuery = buildLuceneQuery(newVisualQuery);
    onChange({
      ...query,
      visualQuery: newVisualQuery,
      queryText: luceneQuery
    });
  };

  const onMetricsEditorModeChange = (value: string) => {
    const newMetricsEditorMode = value as 'builder' | 'code';
    let newQuery = { ...query, metricsEditorMode: newMetricsEditorMode };

    if (newMetricsEditorMode === 'builder' && (!metricsVisualQuery || metricsVisualQuery.metric === '')) {
      // Parse the current queryText into visual query
      try {
        const parsed = buildVisualQueryFromString(queryText || '');
        newQuery.metricsVisualQuery = parsed.query;
      } catch (error) {
        console.warn('Failed to parse query into visual format:', error);
        newQuery.metricsVisualQuery = { metric: '', labels: [], operations: [] };
      }
    } else if (newMetricsEditorMode === 'code' && metricsVisualQuery) {
      // Convert visual query to text
      try {
        newQuery.queryText = modeller.renderQuery(metricsVisualQuery);
      } catch (error) {
        console.warn('Failed to render visual query to text:', error);
        newQuery.queryText = '';
      }
    }

    onChange(newQuery);
  };

  const buildLuceneQuery = (conditions: VisualQueryCondition[]): string => {
    if (conditions.length === 0) {return '';}

    return conditions.map((condition, index) => {
      let query = '';

      switch (condition.operator) {
        case 'equals':
          query = `${condition.field}:"${condition.value}"`;
          break;
        case 'not_equals':
          query = `NOT ${condition.field}:"${condition.value}"`;
          break;
        case 'contains':
          query = `${condition.field}:*${condition.value}*`;
          break;
        case 'not_contains':
          query = `NOT ${condition.field}:*${condition.value}*`;
          break;
        case 'starts_with':
          query = `${condition.field}:${condition.value}*`;
          break;
        case 'ends_with':
          query = `${condition.field}:*${condition.value}`;
          break;
        case 'regex':
          query = `${condition.field}:/${condition.value}/`;
          break;
        case 'gt':
          query = `${condition.field}:{${condition.value} TO *}`;
          break;
        case 'gte':
          query = `${condition.field}:[${condition.value} TO *]`;
          break;
        case 'lt':
          query = `${condition.field}:{* TO ${condition.value}}`;
          break;
        case 'lte':
          query = `${condition.field}:[* TO ${condition.value}]`;
          break;
        default:
          query = `${condition.field}:"${condition.value}"`;
      }

      if (index > 0 && condition.logicalOperator) {
        query = ` ${condition.logicalOperator} ${query}`;
      }

      return query;
    }).join('');
  };

  const addCondition = () => {
    const newCondition: VisualQueryCondition = {
      field: logFields[0] || '',
      operator: 'equals',
      value: '',
      logicalOperator: 'AND'
    };
    const newVisualQuery = [...(visualQuery || []), newCondition];
    onVisualQueryChange(newVisualQuery);
  };

  const updateCondition = (index: number, updates: Partial<VisualQueryCondition>) => {
    const newVisualQuery = [...(visualQuery || [])];
    newVisualQuery[index] = { ...newVisualQuery[index], ...updates };
    onVisualQueryChange(newVisualQuery);
  };

  const removeCondition = (index: number) => {
    const newVisualQuery = (visualQuery || []).filter((_, i) => i !== index);
    onVisualQueryChange(newVisualQuery);
  };

  return (
    <Stack gap={2}>
      <InlineField label="Query Type" labelWidth={16}>
        <Select
          options={queryTypeOptions}
          value={queryType}
          onChange={onQueryTypeChange}
          width={16}
        />
      </InlineField>

      {queryType === 'logs' && (
        <>
          <InlineField label="Query Engine" labelWidth={16} tooltip="Search engine for log queries">
            <Select
              options={queryEngineOptions}
              value={queryEngine || 'bleve'}
              onChange={onQueryEngineChange}
              width={16}
            />
          </InlineField>

          <InlineField label="Editor Mode" labelWidth={16}>
            <RadioButtonGroup
              options={editorModeOptions}
              value={editorMode || 'code'}
              onChange={onEditorModeChange}
            />
          </InlineField>
        </>
      )}

      {queryType === 'logs' && editorMode === 'code' && (
        <Field label="Query" description="Enter Lucene query">
          <QueryField
            query={queryText || ''}
            onChange={(value: string) => onChange({ ...query, queryText: value })}
            onRunQuery={onRunQuery}
            placeholder='service.name:"otelgen"'
            portalOrigin="body"
          />
        </Field>
      )}

      {queryType === 'logs' && editorMode === 'builder' && (
        <FieldSet label="Visual Query Builder">
          <Stack gap={2} direction="column">
            {(visualQuery || []).map((condition, index) => (
              <Field key={index}>
                <Stack gap={1} direction="row" alignItems="center">
                  {index > 0 && (
                    <Select
                      options={logicalOperatorOptions}
                      value={condition.logicalOperator}
                      onChange={(value: SelectableValue) => updateCondition(index, { logicalOperator: value.value })}
                      width={6}
                    />
                  )}
                  <Select
                    options={logFields.map(field => ({ label: field, value: field }))}
                    value={condition.field}
                    onChange={(value: SelectableValue) => updateCondition(index, { field: value.value })}
                    placeholder={loadingFields ? 'Loading fields...' : 'Select field'}
                    width={16}
                    isLoading={loadingFields}
                  />
                  <Select
                    options={operatorOptions}
                    value={condition.operator}
                    onChange={(value: SelectableValue) => updateCondition(index, { operator: value.value })}
                    width={10}
                  />
                  <Input
                    value={condition.value}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => updateCondition(index, { value: e.target.value })}
                    placeholder="value"
                    width={16}
                  />
                  <IconButton
                    name="trash-alt"
                    onClick={() => removeCondition(index)}
                    tooltip="Remove condition"
                  />
                </Stack>
              </Field>
            ))}
            <Button onClick={addCondition} size="sm" icon="plus" variant="primary" style={{ width: '100%' }}>
              Add condition
            </Button>
            <Field label="Generated Query" description="Lucene query generated from visual conditions">
              <Input
                value={queryText || ''}
                readOnly
                placeholder="Generated query will appear here"
                width={40}
              />
            </Field>
          </Stack>
        </FieldSet>
      )}

      {queryType === 'metrics' && (
        <>
          <InlineField label="Editor Mode" labelWidth={16}>
            <RadioButtonGroup
              options={metricsEditorModeOptions}
              value={metricsEditorMode || 'code'}
              onChange={onMetricsEditorModeChange}
            />
          </InlineField>

          {metricsEditorMode === 'code' && (
            <>
              <InlineField label="Query Type" labelWidth={16}>
                <Select
                  options={metricsQueryTypeOptions}
                  value={metricsQueryType || 'range'}
                  onChange={(value: SelectableValue) => onChange({ ...query, metricsQueryType: value.value })}
                  width={16}
                />
              </InlineField>

              {(metricsQueryType === 'aggregate' || metricsQueryType === 'rollup' || metricsQueryType === 'transform' || metricsQueryType === 'label') && (
                <InlineField label="Function" labelWidth={16}>
                  <Select
                    options={
                      metricsQueryType === 'aggregate' ? aggregateFunctions :
                      metricsQueryType === 'rollup' ? rollupFunctions :
                      metricsQueryType === 'transform' ? transformFunctions :
                      labelFunctions
                    }
                    value={functionName || ''}
                    onChange={(value: SelectableValue) => onChange({ ...query, functionName: value.value })}
                    placeholder="Select function"
                    width={16}
                  />
                </InlineField>
              )}

              <Field label="Query" description="Enter MetricsQL query">
                <Input
                  value={queryText || ''}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => onChange({ ...query, queryText: e.target.value })}
                  placeholder={
                    metricsQueryType === 'instant' ? 'up' :
                    metricsQueryType === 'range' ? 'rate(http_requests_total[5m])' :
                    metricsQueryType === 'aggregate' ? 'sum(http_requests_total) by (job)' :
                    metricsQueryType === 'rollup' ? 'rate(http_requests_total[5m])' :
                    metricsQueryType === 'transform' ? 'abs(cpu_usage)' :
                    metricsQueryType === 'label' ? 'label_replace(up, "job", "$1", "job", "(.*)")' :
                    'Enter metrics query'
                  }
                />
              </Field>

              {metricsQueryType === 'range' && (
                <InlineField label="Step" labelWidth={16} tooltip="Query resolution step (e.g., 15s, 1m, 5m)">
                  <Input
                    value={step || '15s'}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => onChange({ ...query, step: e.target.value })}
                    placeholder="15s"
                    width={8}
                  />
                </InlineField>
              )}
            </>
          )}

          {metricsEditorMode === 'builder' && (
            <FieldSet label="Visual Query Builder">
              <I18nextProvider i18n={i18nInstance}>
                <Suspense fallback={<div>Loading query builder...</div>}>
                  <PromQueryBuilder
                    query={metricsVisualQuery || { metric: '', labels: [], operations: [] }}
                    datasource={datasource as any} // Type assertion needed since our datasource extends PrometheusDatasource
                    onChange={(visualQuery) => {
                      const queryText = modeller.renderQuery(visualQuery);
                      onChange({ ...query, metricsVisualQuery: visualQuery, queryText });
                    }}
                    onRunQuery={onRunQuery}
                    showExplain={false}
                  />
                </Suspense>
              </I18nextProvider>
            </FieldSet>
            )}

            {/* Debug panel: show last fetched metrics/labels from the datasource */}
            <FieldSet label="Debug: Language Provider State">
              <div style={{ fontSize: '12px', color: '#999' }}>
                <div><strong>lastMetrics:</strong> {(datasource as any).lastMetrics ? (datasource as any).lastMetrics.join(', ') : '[]'}</div>
                <div><strong>lastLabels:</strong> {(datasource as any).lastLabels ? (datasource as any).lastLabels.join(', ') : '[]'}</div>
                <div><strong>lastLabelValues (sample):</strong> {Object.keys((datasource as any).lastLabelValues || {}).length > 0 ? JSON.stringify((datasource as any).lastLabelValues) : '{}'}</div>
              </div>
            </FieldSet>
        </>
      )}

      {queryType === 'traces' && (
        <>
          <Field label="Query" description="Enter traces query">
            <Input
              value={queryText || ''}
              onChange={(e: ChangeEvent<HTMLInputElement>) => onChange({ ...query, queryText: e.target.value })}
              placeholder="Enter traces query"
            />
          </Field>
        </>
      )}
    </Stack>
  );
}
