variable "kubeconfig_path" {
  description = "Path to the kubeconfig file used for deploying resources."
  type        = string
  default     = "~/.kube/config"
}

variable "kubeconfig_context" {
  description = "Optional kubeconfig context; leave empty to use the current context."
  type        = string
  default     = ""
}

variable "namespace" {
  description = "Kubernetes namespace where mirador dependencies will be created."
  type        = string
  default     = "mirador-rca"
}

variable "storage_class" {
  description = "StorageClass used for stateful dependencies."
  type        = string
  default     = "standard"
}

variable "valkey_chart_version" {
  description = "Bitnami Valkey Helm chart version."
  type        = string
  default     = "1.0.1"
}

variable "valkey_replica_count" {
  description = "Number of Valkey replicas (master is always deployed)."
  type        = number
  default     = 1
}

variable "valkey_persistence_enabled" {
  description = "Enable persistent volumes for Valkey."
  type        = bool
  default     = true
}

variable "valkey_storage_size" {
  description = "Valkey PVC size."
  type        = string
  default     = "10Gi"
}

variable "valkey_username" {
  description = "Optional Valkey ACL username."
  type        = string
  default     = ""
}

variable "valkey_password" {
  description = "Valkey password (set via TF_VAR_valkey_password)."
  type        = string
  sensitive   = true
  default     = ""
}

variable "valkey_auth_enabled" {
  description = "Toggle Valkey authentication."
  type        = bool
  default     = true
}

variable "valkey_resources" {
  description = "CPU/memory requests and limits for Valkey pods."
  type = object({
    limits = optional(map(string), {})
    requests = optional(map(string), {})
  })
  default = {
    limits = {
      cpu    = "500m"
      memory = "512Mi"
    }
    requests = {
      cpu    = "250m"
      memory = "256Mi"
    }
  }
}

variable "weaviate_chart_version" {
  description = "Weaviate Helm chart version."
  type        = string
  default     = "16.1.2"
}

variable "weaviate_image" {
  description = "Weaviate container image repository."
  type        = string
  default     = "semitechnologies/weaviate"
}

variable "weaviate_image_tag" {
  description = "Weaviate container image tag."
  type        = string
  default     = "1.25.7"
}

variable "weaviate_replica_count" {
  description = "Number of Weaviate replicas."
  type        = number
  default     = 1
}

variable "weaviate_storage_size" {
  description = "Weaviate PVC size."
  type        = string
  default     = "20Gi"
}

variable "weaviate_anonymous_access" {
  description = "Allow anonymous access (disable in production)."
  type        = bool
  default     = false
}

variable "weaviate_disable_telemetry" {
  description = "Disable outbound telemetry for air-gapped clusters."
  type        = bool
  default     = true
}

variable "weaviate_resources" {
  description = "CPU/memory requests and limits for Weaviate pods."
  type = object({
    limits = optional(map(string), {})
    requests = optional(map(string), {})
  })
  default = {
    limits = {
      cpu    = "1"
      memory = "2Gi"
    }
    requests = {
      cpu    = "500m"
      memory = "1Gi"
    }
  }
}
