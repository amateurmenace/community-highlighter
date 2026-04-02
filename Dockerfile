# ============================================================================
# Community Highlighter — Cloud Run Dockerfile
# Multi-stage build: Node.js frontend → Python backend with ffmpeg
# ============================================================================

# --- Stage 1: Build frontend ---
FROM node:20-slim AS frontend-build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --production=false
COPY src/ src/
COPY public/ public/
COPY index.html vite.config.js ./
RUN npm run build

# --- Stage 2: Production image ---
FROM python:3.11-slim

# Install system dependencies: ffmpeg + build tools for native Python packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    git \
    curl \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Download NLTK data at build time (not runtime)
RUN python -c "import nltk; nltk.download('punkt', download_dir='/usr/local/nltk_data'); nltk.download('stopwords', download_dir='/usr/local/nltk_data'); nltk.download('punkt_tab', download_dir='/usr/local/nltk_data')"

# Copy backend
COPY backend/ backend/

# Copy built frontend from stage 1
COPY --from=frontend-build /app/dist/ dist/

# Note: public/ assets are copied to dist/ by Vite during build

# Create cache directories
RUN mkdir -p backend/cache backend/ai_cache

# Copy fonts for video text overlays
COPY backend/fonts/ backend/fonts/

# Environment
ENV CLOUD_MODE=true
ENV PYTHONUNBUFFERED=1
ENV NLTK_DATA=/usr/local/nltk_data

# Cloud Run sets PORT automatically (default 8080)
ENV PORT=8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD curl -f http://localhost:${PORT}/api/health || exit 1

# Run the server
CMD ["python", "backend/app.py"]
