#!/bin/bash
# ============================================================================
# Deploy Community Highlighter to Google Cloud Run
# Builds container via Cloud Build, then deploys to Cloud Run
# ============================================================================
set -e

# Configuration
PROJECT_ID="gen-lang-client-0968954810"
REGION="us-east1"
SERVICE_NAME="community-highlighter"
IMAGE="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"

echo "=============================================="
echo "  Deploying Community Highlighter to Cloud Run"
echo "  Project: ${PROJECT_ID}"
echo "  Region:  ${REGION}"
echo "=============================================="

# Verify gcloud is authenticated
GCLOUD=$(which gcloud || echo "/opt/homebrew/bin/gcloud")
if ! $GCLOUD auth print-access-token &>/dev/null; then
    echo "ERROR: Not authenticated. Run: gcloud auth login"
    exit 1
fi

# Set project
$GCLOUD config set project "$PROJECT_ID" 2>/dev/null

# Step 1: Build container image via Cloud Build
echo ""
echo "Step 1/3: Building container image (this takes 3-5 minutes)..."
echo "  Image: ${IMAGE}"
$GCLOUD builds submit --tag "$IMAGE" --timeout=900 --machine-type=e2-highcpu-8

# Step 2: Deploy to Cloud Run
echo ""
echo "Step 2/3: Deploying to Cloud Run..."
$GCLOUD run deploy "$SERVICE_NAME" \
    --image "$IMAGE" \
    --region "$REGION" \
    --platform managed \
    --allow-unauthenticated \
    --memory 2Gi \
    --cpu 2 \
    --timeout 900 \
    --min-instances 0 \
    --max-instances 3 \
    --concurrency 80 \
    --set-env-vars "CLOUD_MODE=true" \
    --port 8080

# Step 3: Set API keys (if not already set)
echo ""
echo "Step 3/3: Configuring API keys..."

# Check if keys are already set
EXISTING_VARS=$($GCLOUD run services describe "$SERVICE_NAME" --region "$REGION" --format="value(spec.template.spec.containers[0].env)" 2>/dev/null || echo "")

set_key_if_missing() {
    local key_name=$1
    local env_var=$2
    local env_value="${!env_var}"

    if echo "$EXISTING_VARS" | grep -q "$key_name"; then
        echo "  $key_name: already configured"
    elif [ -n "$env_value" ]; then
        echo "  $key_name: setting from local env..."
        $GCLOUD run services update "$SERVICE_NAME" --region "$REGION" \
            --update-env-vars "${key_name}=${env_value}" --quiet
    else
        echo "  $key_name: NOT SET (set locally or in Cloud Console)"
    fi
}

set_key_if_missing "OPENAI_API_KEY" "OPENAI_API_KEY"
set_key_if_missing "GOOGLE_API_KEY" "GOOGLE_API_KEY"
set_key_if_missing "YOUTUBE_API_KEY" "YOUTUBE_API_KEY"
set_key_if_missing "YOUTUBE_API_KEY_SECONDARY" "YOUTUBE_API_KEY_SECONDARY"

# Get the service URL
echo ""
echo "=============================================="
SERVICE_URL=$($GCLOUD run services describe "$SERVICE_NAME" --region "$REGION" --format="value(status.url)")
echo "  DEPLOYED: ${SERVICE_URL}"
echo ""
echo "  Health check: ${SERVICE_URL}/api/health"
echo "=============================================="

# Quick health check
echo ""
echo "Running health check..."
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${SERVICE_URL}/api/health" 2>/dev/null || echo "000")
if [ "$HTTP_STATUS" = "200" ]; then
    echo "  Health check passed (HTTP 200)"
else
    echo "  Health check returned HTTP ${HTTP_STATUS} (may need a moment to start)"
    echo "  Try again in 30 seconds: curl ${SERVICE_URL}/api/health"
fi
