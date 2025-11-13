terraform {
  required_version = ">= 1.5.0"
  required_providers {
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = ">= 2.20.0"
    }
    helm = {
      source  = "hashicorp/helm"
      version = ">= 2.12.0"
    }
  }
}

provider "kubernetes" {
  config_path    = var.kubeconfig_path
  config_context = var.kubeconfig_context
}

provider "helm" {
  kubernetes {
    config_path    = var.kubeconfig_path
    config_context = var.kubeconfig_context
  }
}

resource "kubernetes_namespace" "mirador" {
  metadata {
    name = var.namespace
    labels = {
      "app.kubernetes.io/managed-by" = "terraform"
    }
  }
}

resource "helm_release" "valkey" {
  name       = "valkey"
  repository = "oci://registry-1.docker.io/bitnamicharts"
  chart      = "valkey"
  version    = var.valkey_chart_version
  namespace  = kubernetes_namespace.mirador.metadata[0].name

  create_namespace = false

  values = [
    yamlencode({
      fullnameOverride = "valkey"
      auth = {
        enabled  = var.valkey_auth_enabled
        password = var.valkey_password
        username = var.valkey_username
      }
      master = {
        persistence = {
          enabled      = var.valkey_persistence_enabled
          storageClass = var.storage_class
          size         = var.valkey_storage_size
        }
        resources = var.valkey_resources
      }
      replica = {
        replicaCount = var.valkey_replica_count
        persistence = {
          enabled      = var.valkey_persistence_enabled
          storageClass = var.storage_class
          size         = var.valkey_storage_size
        }
        resources = var.valkey_resources
      }
    })
  ]
}

resource "helm_release" "weaviate" {
  name       = "weaviate"
  repository = "https://weaviate.github.io/weaviate-helm"
  chart      = "weaviate"
  version    = var.weaviate_chart_version
  namespace  = kubernetes_namespace.mirador.metadata[0].name

  create_namespace = false

  values = [
    yamlencode({
      fullnameOverride = "weaviate"
      image = {
        repository = var.weaviate_image
        tag         = var.weaviate_image_tag
      }
      replicas        = var.weaviate_replica_count
      serviceType     = "ClusterIP"
      persistence = {
        enabled      = true
        size         = var.weaviate_storage_size
        storageClass = var.storage_class
      }
      env = {
        QUERY_DEFAULTS_LIMIT                    = "25"
        AUTHENTICATION_ANONYMOUS_ACCESS_ENABLED = tostring(var.weaviate_anonymous_access)
        DISABLE_TELEMETRY                       = tostring(var.weaviate_disable_telemetry)
        DEFAULT_VECTORIZER_MODULE               = "none"
        ENABLE_MODULES                          = "none"
      }
      resources = var.weaviate_resources
    })
  ]

  depends_on = [helm_release.valkey]
}

output "namespace" {
  value = kubernetes_namespace.mirador.metadata[0].name
}

output "valkey_service" {
  value = "valkey.${kubernetes_namespace.mirador.metadata[0].name}.svc.cluster.local:6379"
}

output "weaviate_service" {
  value = "weaviate.${kubernetes_namespace.mirador.metadata[0].name}.svc.cluster.local:8080"
}
