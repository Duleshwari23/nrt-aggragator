{{- define "mirador-rca.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "mirador-rca.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}

{{- define "mirador-rca.labels" -}}
app.kubernetes.io/name: {{ include "mirador-rca.name" . }}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version | replace "+" "_" }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- if .Values.commonLabels }}
{{ toYaml .Values.commonLabels | nindent 0 }}
{{- end -}}
{{- end -}}

{{- define "mirador-rca.selectorLabels" -}}
app.kubernetes.io/name: {{ include "mirador-rca.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{- define "mirador-rca.renderConfig" -}}
{{- toYaml .Values.config -}}
{{- end -}}

{{- define "mirador-rca.serviceAccountName" -}}
{{- if .Values.serviceAccount.create -}}
{{- default (include "mirador-rca.fullname" .) .Values.serviceAccount.name -}}
{{- else -}}
{{- default "default" .Values.serviceAccount.name -}}
{{- end -}}
{{- end -}}
