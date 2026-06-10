###############################################################################
# Power Tracker — one-service Cloud Run deployment
###############################################################################

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 5.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

provider "google-beta" {
  project = var.project_id
  region  = var.region
}

resource "google_project_service" "services" {
  for_each = toset([
    "run.googleapis.com",
    "artifactregistry.googleapis.com",
    "firestore.googleapis.com",
    "secretmanager.googleapis.com",
    "aiplatform.googleapis.com",
    "iam.googleapis.com",
    "cloudbuild.googleapis.com",
  ])

  service            = each.key
  disable_on_destroy = false
}

resource "google_artifact_registry_repository" "app_repo" {
  provider      = google-beta
  repository_id = "power-tracker-one-service"
  location      = var.region
  description   = "Container images for the Power Tracker one-service deployment"
  format        = "DOCKER"

  depends_on = [google_project_service.services]
}

resource "google_firestore_database" "database" {
  provider    = google-beta
  name        = "(default)"
  location_id = var.firestore_location
  type        = "FIRESTORE_NATIVE"

  depends_on = [google_project_service.services]
}

resource "google_secret_manager_secret" "proxy_header" {
  secret_id = "power-tracker-proxy-header"

  replication {
    auto {}
  }

  depends_on = [google_project_service.services]
}

resource "google_secret_manager_secret_version" "proxy_header_value" {
  secret      = google_secret_manager_secret.proxy_header.id
  secret_data = var.proxy_header_value
}

resource "google_secret_manager_secret" "gemini_api_key" {
  secret_id = "power-tracker-gemini-api-key"

  replication {
    auto {}
  }

  depends_on = [google_project_service.services]
}

resource "google_secret_manager_secret_version" "gemini_api_key_value" {
  secret      = google_secret_manager_secret.gemini_api_key.id
  secret_data = var.gemini_api_key
}

resource "google_service_account" "app_sa" {
  account_id   = "power-tracker-one-service-sa"
  display_name = "Power Tracker one-service Cloud Run account"
  description  = "Runs the combined frontend + backend service on Cloud Run"
}

resource "google_project_iam_member" "firestore_user" {
  project = var.project_id
  role    = "roles/datastore.user"
  member  = "serviceAccount:${google_service_account.app_sa.email}"
}

resource "google_project_iam_member" "vertex_user" {
  project = var.project_id
  role    = "roles/aiplatform.user"
  member  = "serviceAccount:${google_service_account.app_sa.email}"
}

resource "google_secret_manager_secret_iam_member" "proxy_header_accessor" {
  secret_id = google_secret_manager_secret.proxy_header.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.app_sa.email}"
}

resource "google_secret_manager_secret_iam_member" "gemini_api_key_accessor" {
  secret_id = google_secret_manager_secret.gemini_api_key.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.app_sa.email}"
}

resource "google_cloud_run_v2_service" "app" {
  name     = "power-tracker-one-service"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    service_account = google_service_account.app_sa.email

    scaling {
      min_instance_count = 0
      max_instance_count = var.max_instances
    }

    containers {
      image = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.app_repo.repository_id}/backend:${var.image_tag}"

      ports {
        container_port = 8080
      }

      env {
        name  = "GOOGLE_CLOUD_PROJECT"
        value = var.project_id
      }

      env {
        name  = "GOOGLE_CLOUD_LOCATION"
        value = var.region
      }

      env {
        name = "PROXY_HEADER"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.proxy_header.secret_id
            version = "latest"
          }
        }
      }

      env {
        name = "GEMINI_API_KEY"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.gemini_api_key.secret_id
            version = "latest"
          }
        }
      }

      env {
        name  = "PORT"
        value = "8080"
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }
    }
  }

  depends_on = [
    google_project_service.services,
    google_artifact_registry_repository.app_repo,
    google_secret_manager_secret_version.proxy_header_value,
    google_secret_manager_secret_version.gemini_api_key_value,
    google_service_account.app_sa,
    google_project_iam_member.firestore_user,
    google_project_iam_member.vertex_user,
    google_secret_manager_secret_iam_member.proxy_header_accessor,
    google_secret_manager_secret_iam_member.gemini_api_key_accessor,
  ]
}

resource "google_cloud_run_v2_service_iam_member" "public_invoker" {
  name     = google_cloud_run_v2_service.app.name
  location = google_cloud_run_v2_service.app.location
  role     = "roles/run.invoker"
  member   = "allUsers"
}
