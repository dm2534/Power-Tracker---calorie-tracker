###############################################################################
# Power Tracker — Variable Definitions
###############################################################################

# ── REQUIRED — you MUST supply these ─────────────────────────────────────────

variable "project_id" {
  type        = string
  description = <<-EOT
    Your GCP Project ID (not the project name or number).
    Find it at: https://console.cloud.google.com → Project selector.
    Example: "my-power-tracker-prod"
  EOT
}

variable "proxy_header_value" {
  type        = string
  sensitive   = true
  description = <<-EOT
    A long random string used as a shared secret between the Firebase Hosting
    proxy and the Cloud Run backend. The backend rejects any /api-proxy request
    that does not include this value in the X-App-Proxy header.

    Generate a secure value with:
      openssl rand -hex 32
    or:
      python3 -c "import secrets; print(secrets.token_hex(32))"

    This is stored in GCP Secret Manager — never commit it to git.
  EOT
}

# ── OPTIONAL — sensible defaults are provided ─────────────────────────────────

variable "region" {
  type        = string
  default     = "us-central1"
  description = <<-EOT
    GCP region for Cloud Run and Artifact Registry.
    Must be a Vertex AI supported region that also supports Cloud Run.
    Recommended choices: us-central1 | us-east1 | europe-west1
  EOT
}

variable "firestore_location" {
  type        = string
  default     = "nam5"
  description = <<-EOT
    Firestore multi-region or single-region location ID.
    Must match or be close to your Cloud Run region.
    Options:
      nam5  — US multi-region (recommended for US deployments)
      eur3  — Europe multi-region
      us-central1, europe-west1, etc. — single region
    NOTE: Cannot be changed after database creation.
  EOT
}

variable "firebase_site_id" {
  type        = string
  default     = ""
  description = <<-EOT
    The Firebase Hosting site ID — this becomes part of your default URL:
      https://<site_id>.web.app
    Must be globally unique across all Firebase projects.
    Leave empty to auto-generate from project_id.
    Example: "power-tracker-prod"
  EOT
}

variable "image_tag" {
  type        = string
  default     = "latest"
  description = <<-EOT
    Docker image tag to deploy to Cloud Run.
    In production, pin this to a specific SHA or semantic version tag
    rather than "latest" to ensure reproducible deployments.
    Example: "v1.0.0" or "sha-a1b2c3d"
  EOT
}

variable "max_instances" {
  type        = number
  default     = 5
  description = <<-EOT
    Maximum number of Cloud Run instances that can be scaled up simultaneously.
    min_instances is always 0 (scale to zero) to minimise costs.
    Increase this if you expect high concurrent traffic.
  EOT
}
