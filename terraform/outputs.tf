###############################################################################
# Power Tracker — Outputs (printed after terraform apply)
###############################################################################

output "backend_cloud_run_url" {
  value       = google_cloud_run_v2_service.backend.uri
  description = "The HTTPS URL of the deployed Cloud Run backend service."
}

output "artifact_registry_image_base" {
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.docker_repo.repository_id}/backend"
  description = "Base image path for the backend. Append :<tag> when building and pushing."
}

output "firebase_hosting_url" {
  value       = "https://${google_firebase_hosting_site.default.site_id}.web.app"
  description = "The default Firebase Hosting URL where the frontend is served."
}

output "firestore_database_name" {
  value       = google_firestore_database.database.name
  description = "The Firestore database ID (always '(default)' in this config)."
}

output "cloud_run_service_account_email" {
  value       = google_service_account.cloud_run_sa.email
  description = "Email of the Cloud Run service account — use this for CI/CD permissions."
}

output "proxy_header_secret_id" {
  value       = google_secret_manager_secret.proxy_header.secret_id
  description = "GCP Secret Manager secret ID storing the X-App-Proxy header value."
}
