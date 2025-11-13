import React, { ChangeEvent } from 'react';
import { InlineField, Input, Switch } from '@grafana/ui';
import { DataSourcePluginOptionsEditorProps } from '@grafana/data';
import { MyDataSourceOptions, MySecureJsonData } from '../types';

interface Props extends DataSourcePluginOptionsEditorProps<MyDataSourceOptions, MySecureJsonData> {}

export function ConfigEditor(props: Props) {
  const { onOptionsChange, options } = props;
  const { jsonData, secureJsonData } = options;

  const onUrlChange = (event: ChangeEvent<HTMLInputElement>) => {
    onOptionsChange({
      ...options,
      url: event.target.value,
    });
  };

  const onTenantIdChange = (event: ChangeEvent<HTMLInputElement>) => {
    onOptionsChange({
      ...options,
      jsonData: {
        ...jsonData,
        tenantId: event.target.value,
      },
    });
  };

  const onTokenChange = (event: ChangeEvent<HTMLInputElement>) => {
    onOptionsChange({
      ...options,
      secureJsonData: {
        token: event.target.value,
      },
    });
  };

  const onAuthEnabledChange = (event: ChangeEvent<HTMLInputElement>) => {
    const authEnabled = event.target.checked;
    onOptionsChange({
      ...options,
      jsonData: {
        ...jsonData,
        authEnabled,
      },
    });
  };

  return (
    <>
      <InlineField label="Mirador Core URL" labelWidth={14} interactive tooltip={'Base URL for Mirador Core API (e.g., http://localhost:8081/api/v1)'}>
        <Input
          id="config-editor-url"
          onChange={onUrlChange}
          value={options.url || ''}
          placeholder="http://localhost:8081/api/v1"
          width={40}
        />
      </InlineField>
      <InlineField label="Tenant ID" labelWidth={14} interactive tooltip={'Tenant ID for Mirador Core'}>
        <Input
          id="config-editor-tenant-id"
          onChange={onTenantIdChange}
          value={jsonData.tenantId}
          placeholder="Enter tenant ID"
          width={40}
        />
      </InlineField>
      <InlineField label="Enable Authentication" labelWidth={14} interactive tooltip={'Enable bearer token authentication for Mirador Core'}>
        <Switch
          value={jsonData.authEnabled ?? true}
          onChange={onAuthEnabledChange}
        />
      </InlineField>
      {(jsonData.authEnabled ?? true) && (
        <InlineField label="Bearer Token" labelWidth={14} interactive tooltip={'Bearer token for authentication'}>
          <Input
            id="config-editor-token"
            type="password"
            value={secureJsonData?.token || ''}
            placeholder="Enter bearer token"
            width={40}
            onChange={onTokenChange}
          />
        </InlineField>
      )}
    </>
  );
}
