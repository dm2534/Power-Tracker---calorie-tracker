###############################################################################
# Power Tracker — Production Infrastructure
# Provisions: APIs, Artifact Registry, Secret Manager, Cloud Run, Firestore
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

###############################################################################
# 1. Enable Required GCP APIs
###############################################################################

resource "google_project_service" "services" {
  for_each = toset([
    "run.googleapis.com",
    "firestore.googleapis.com",
    "artifactregistry.googleapis.com",
    "cloudbuild.googleapis.com",
    "aiplatform.googleapis.com",
    "secretmanager.googleapis.com",
    "firebase.googleapis.com",
    "iam.googleapis.com",
  ])

  service            = each.key
  disable_on_destroy = false
}

###############################################################################
# 2. Firestore Database (Native Mode)
###############################################################################

resource "google_firestore_database" "database" {
  provider    = google-beta
  name        = "(default)"
  location_id = var.firestore_location
  type        = "FIRESTORE_NATIVE"

  depends_on = [google_project_service.services]
}

###############################################################################
# 3. Artifact Registry — Docker repository for the Go backend image
###############################################################################

resource "google_artifact_registry_repository" "docker_repo" {
  provider      = google-beta
  repository_id = "power-tracker"
  description   = "Docker images for Power Tracker backend"
  format        = "DOCKER"
  location      = var.region

  depends_on = [google_project_service.services]
}

###############################################################################
# 4. Secret Manager — Store the internal proxy header secret
###############################################################################

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

###############################################################################
# 5. Cloud Run Service Account with least-privilege roles
###############################################################################

resource "google_service_account" "cloud_run_sa" {
  account_id   = "power-tracker-backend-sa"
  display_name = "Power Tracker Cloud Run Service Account"
  description  = "Runs the Power Tracker Go backend on Cloud Run"
}

# Allow the SA to read from Firestore
resource "google_project_iam_member" "firestore_user" {
  project = var.project_id
  role    = "roles/datastore.user"
  member  = "serviceAccount:${google_service_account.cloud_run_sa.email}"
}

# Allow the SA to call Vertex AI (Gemini)
resource "google_project_iam_member" "vertex_user" {
  project = var.project_id
  role    = "roles/aiplatform.user"
  member  = "serviceAccount:${google_service_account.cloud_run_sa.email}"
}

# Allow the SA to read Secret Manager secrets
resource "google_secret_manager_secret_iam_member" "proxy_header_accessor" {
  secret_id = google_secret_manager_secret.proxy_header.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.cloud_run_sa.email}"
}

###############################################################################
# 6. Cloud Run Service — Go Backend
###############################################################################

resource "google_cloud_run_v2_service" "backend" {
  name     = "power-tracker-backend"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    service_account = google_service_account.cloud_run_sa.email

    scaling {
      min_instance_count = 0
      max_instance_count = var.max_instances
    }

    containers {
      # Image is built and pushed separately (see README / CI pipeline)
      image = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.docker_repo.repository_id}/backend:${var.image_tag}"

      ports {
        container_port = 8080
      }

      # Non-secret env vars injected directly
      env {
        name  = "GOOGLE_CLOUD_PROJECT"
        value = var.project_id
      }
      env {
        name  = "GOOGLE_CLOUD_LOCATION"
        value = var.region
      }

      # Proxy header pulled from Secret Manager at container startup
      env {
        name = "PROXY_HEADER"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.proxy_header.secret_id
            version = "latest"
          }
        }
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
    google_artifact_registry_repository.docker_repo,
    google_secret_manager_secret_version.proxy_header_value,
    google_service_account.cloud_run_sa,
    google_project_iam_member.firestore_user,
    google_project_iam_member.vertex_user,
    google_secret_manager_secret_iam_member.proxy_header_accessor,
  ]
}

# Allow unauthenticated requests to the Cloud Run service
# (Firebase Hosting rewrites act as the public gateway)
resource "google_cloud_run_v2_service_iam_member" "public_invoker" {
  name     = google_cloud_run_v2_service.backend.name
  location = google_cloud_run_v2_service.backend.location
  role     = "roles/run.invoker"
  member   = "allUsers"
}

###############################################################################
# 7. Firebase Hosting (frontend CDN + API proxy rewrites)
###############################################################################

resource "google_firebase_project" "default" {
  provider = google-beta
  project  = var.project_id

  depends_on = [google_project_service.services]
}

resource "google_firebase_hosting_site" "default" {
  provider = google-beta
  project  = var.project_id
  site_id  = var.firebase_site_id

  depends_on = [google_firebase_project.default]
}
