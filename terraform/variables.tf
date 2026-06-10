###############################################################################
# Terraform variables for the one-service Cloud Run deployment
###############################################################################

variable "project_id" {
  type        = string
  description = "GCP project ID where the one-service app will be deployed."
}

variable "region" {
  type        = string
  default     = "us-central1"
  description = "Region for Artifact Registry and Cloud Run."
}

variable "firestore_location" {
  type        = string
  default     = "nam5"
  description = "Firestore location ID."
}

variable "proxy_header_value" {
  type        = string
  sensitive   = true
  description = "Shared secret used by the Go API to validate proxy requests."
}

variable "gemini_api_key" {
  type        = string
  sensitive   = true
  description = "Gemini API key stored in Secret Manager and injected into the backend at runtime."
}

variable "image_tag" {
  type        = string
  default     = "latest"
  description = "Image tag for the one-service container image that you build and push to Artifact Registry."
}

variable "max_instances" {
  type        = number
  default     = 5
  description = "Maximum Cloud Run instances for the combined service."
}
