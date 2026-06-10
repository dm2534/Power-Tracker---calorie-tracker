# Power Tracker — Frontend + Go Backend

This repository now contains:

* `frontend/` — a Vite + React SPA designed for GitHub Pages deployment
* `backend/` — a Go backend API server designed for Cloud Run / GCP deployment

The frontend is configured with `HashRouter` and a relative Vite build base so it can run on GitHub Pages. The backend is containerized for Cloud Run, and deployment workflows are included.

## Local development

### Install dependencies

```bash
npm install
cd frontend
npm install
```

### Run locally

```bash
npm run dev
```

This launches the frontend and backend together from the root workspace. The frontend proxies `/api` to the backend in development.

## Deployment targets

### GitHub Pages (frontend)

A GitHub Actions workflow is included at `.github/workflows/deploy-frontend.yml`.
Push to `main` and the workflow will build `frontend/dist` and deploy the static app to GitHub Pages.

### Cloud Run (single service)

The app can now be deployed as one Cloud Run service that serves both the React frontend and the Go API.

1. Build and push the combined container image:
   ```bash
   docker build -f backend/Dockerfile -t us-central1-docker.pkg.dev/<PROJECT_ID>/power-tracker-one-service/backend:latest .
   docker push us-central1-docker.pkg.dev/<PROJECT_ID>/power-tracker-one-service/backend:latest
   ```
2. Apply the Terraform package in `terraform/`:
   ```bash
   cd terraform
   terraform init
   terraform apply \
     -var="project_id=<PROJECT_ID>" \
     -var="proxy_header_value=<RANDOM_SECRET>" \
     -var="gemini_api_key=<GEMINI_API_KEY>"
   ```

Secrets required for backend deployment:

* `GCP_SA_KEY` — service account key JSON
* `GCP_PROJECT`
* `GCP_REGION`
* `GCP_LOCATION`
* `PROXY_HEADER`

## Backend deployment artifacts

* `backend/Dockerfile`
* `backend/.dockerignore`
* `cloudbuild.yaml`

## Security review and cleanup

* Added root `.gitignore`
  * ignores local `backend/.env.local`
  * ignores backend runtime `data/`
  * ignores build artifacts and `node_modules`
* The backend now reads `PORT` for Cloud Run compatibility and falls back to `API_BACKEND_PORT` for local development.
* The frontend base path is set to `./` for GitHub Pages compatibility.
* The legacy Node proxy backend is no longer required for deployment.

## Environment variables

For local development use `backend/.env.local` but do not commit sensitive values.
For production deployment, set env vars directly in Cloud Run or GitHub Actions secrets:

* `GOOGLE_CLOUD_PROJECT`
* `GOOGLE_CLOUD_LOCATION`
* `PROXY_HEADER`
* `PORT` (Cloud Run should use `8080`)

## Notes

* GitHub Pages hosts only the frontend static app.
* The Go backend must be hosted separately (Cloud Run or another managed container service).
