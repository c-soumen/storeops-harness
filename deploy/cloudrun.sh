#!/usr/bin/env sh
# Deploy StoreOps to Google Cloud Run from source (Cloud Build builds the Dockerfile remotely,
# so no local Docker is needed). Prerequisites: `gcloud auth login`, a project with billing,
# and the Run + Cloud Build + Artifact Registry APIs enabled.
#
#   PROJECT_ID=my-project REGION=europe-west2 sh deploy/cloudrun.sh
#
# The service is deployed --allow-unauthenticated at the HTTP layer only; every /api route still
# requires one of the seeded bearer tokens (app-context §5). Seed tokens are demo credentials —
# do not expose this service beyond a review window.
set -eu

: "${PROJECT_ID:?set PROJECT_ID}"
REGION="${REGION:-europe-west2}"
SERVICE="${SERVICE:-storeops-harness}"

gcloud config set project "$PROJECT_ID"
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com

gcloud run deploy "$SERVICE" \
  --source . \
  --region "$REGION" \
  --allow-unauthenticated \
  --port 3000 \
  --max-instances 1 \
  --memory 256Mi

URL="$(gcloud run services describe "$SERVICE" --region "$REGION" --format 'value(status.url)')"
echo "Deployed: $URL"

# Acceptance check — expect HTTP 207 with mixed per-item outcomes.
curl -s -i -X PATCH \
  -H "Authorization: Bearer token-manager" \
  -H "Content-Type: application/json" \
  -d '{"ids":["act_restock_aisle4","act_missing"],"status":"DONE"}' \
  "$URL/api/activities/bulk-status"
