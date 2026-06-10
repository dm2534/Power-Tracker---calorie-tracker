###############################################################################
# Terraform outputs for the one-service deployment
###############################################################################

output "cloud_run_url" {
  value       = google_cloud_run_v2_service.app.uri
  description = "HTTPS URL of the one-service Cloud Run deployment."
}

output "artifact_registry_image" {
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.app_repo.repository_id}/backend:${var.image_tag}"
  description = "Container image path to build and push before applying Terraform."
}

output "service_account_email" {
  value       = google_service_account.app_sa.email
  description = "Service account used by the one-service Cloud Run deployment."
}

output "gemini_api_key_secret_id" {
  value       = google_secret_manager_secret.gemini_api_key.secret_id
  description = "Secret Manager secret ID containing the Gemini API key."
}
