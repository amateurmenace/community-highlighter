#!/bin/bash
# =============================================================================
# Create Portable Community Highlighter Package
# =============================================================================
# Creates a zip file that can be distributed without compiling
# Users just need Python installed to run it
# 
# Usage:
#   chmod +x create_portable_package.sh
#   ./create_portable_package.sh
# =============================================================================

set -e

VERSION="5.6"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_NAME="CommunityHighlighter-v$VERSION-portable"

echo "=================================================="
echo "  Creating Portable Package"
echo "=================================================="
echo ""

# Create package directory
PACKAGE_DIR="$SCRIPT_DIR/$PACKAGE_NAME"
rm -rf "$PACKAGE_DIR"
mkdir -p "$PACKAGE_DIR"

# Copy essential files
echo "[*] Copying files..."

# Backend
if [ -d "$SCRIPT_DIR/backend" ]; then
    mkdir -p "$PACKAGE_DIR/backend"
    cp "$SCRIPT_DIR/backend/app.py" "$PACKAGE_DIR/backend/"
    echo "    ✓ backend/app.py"
fi

# Frontend build
if [ -d "$SCRIPT_DIR/dist" ]; then
    cp -r "$SCRIPT_DIR/dist" "$PACKAGE_DIR/"
    echo "    ✓ dist/"
fi

# Desktop launcher
cp "$SCRIPT_DIR/desktop_app.py" "$PACKAGE_DIR/"
echo "    ✓ desktop_app.py"

# Requirements
cat > "$PACKAGE_DIR/requirements.txt" << 'REQS'
# Core web framework
fastapi==0.104.1
uvicorn==0.24.0
python-multipart==0.0.6
python-dotenv==1.0.0
pydantic==2.5.0

# HTTP clients
httpx==0.24.1
requests==2.31.0
aiohttp==3.9.1
websockets==12.0

# YouTube
youtube-transcript-api>=1.0.0
yt-dlp

# AI
openai==1.12.0

# Text processing
nltk==3.8.1
textblob==0.18.0

# Data processing
pandas==2.2.3
numpy==1.26.4
dateparser==1.2.0

# Optional: Native window (recommended)
pywebview>=4.0
REQS
echo "    ✓ requirements.txt"

# Create .env template
cat > "$PACKAGE_DIR/.env.example" << 'ENVFILE'
# Community Highlighter Configuration
# Copy this file to .env and add your API keys

# Required: OpenAI API key for AI features
OPENAI_API_KEY=sk-your-key-here

# Optional: YouTube API key (not required for basic features)
YOUTUBE_API_KEY=

# Don't change these unless you know what you're doing
CLOUD_MODE=false
ENVFILE
echo "    ✓ .env.example"

# Create setup script for Mac/Linux
cat > "$PACKAGE_DIR/setup.sh" << 'SETUP'
#!/bin/bash
# First-time setup script

echo "Setting up Community Highlighter..."
echo ""

# Check Python
if ! command -v python3 &> /dev/null; then
    echo "[ERROR] Python 3 is required"
    echo "Download from: https://www.python.org/downloads/"
    exit 1
fi

echo "[*] Installing dependencies..."
pip3 install -r requirements.txt

echo ""
echo "[*] Creating .env file..."
if [ ! -f ".env" ]; then
    cp .env.example .env
    echo "    Created .env from template"
    echo ""
    echo "[!] IMPORTANT: Edit .env and add your OpenAI API key"
    echo "    Open .env in a text editor and replace 'sk-your-key-here'"
else
    echo "    .env already exists"
fi

echo ""
echo "Setup complete! Run with: python3 desktop_app.py"
SETUP
chmod +x "$PACKAGE_DIR/setup.sh"
echo "    ✓ setup.sh"

# Create setup script for Windows
cat > "$PACKAGE_DIR/setup.bat" << 'SETUPWIN'
@echo off
echo Setting up Community Highlighter...
echo.

echo [*] Installing dependencies...
pip install -r requirements.txt

echo.
echo [*] Creating .env file...
if not exist ".env" (
    copy .env.example .env
    echo     Created .env from template
    echo.
    echo [!] IMPORTANT: Edit .env and add your OpenAI API key
) else (
    echo     .env already exists
)

echo.
echo Setup complete! Run with: python desktop_app.py
pause
SETUPWIN
echo "    ✓ setup.bat"

# Create run script for Mac/Linux
cat > "$PACKAGE_DIR/run.sh" << 'RUNSH'
#!/bin/bash
cd "$(dirname "$0")"
python3 desktop_app.py
RUNSH
chmod +x "$PACKAGE_DIR/run.sh"
echo "    ✓ run.sh"

# Create run script for Windows
cat > "$PACKAGE_DIR/run.bat" << 'RUNBAT'
@echo off
cd /d "%~dp0"
python desktop_app.py
RUNBAT
echo "    ✓ run.bat"

# Create README
cat > "$PACKAGE_DIR/README.md" << 'README'
# Community Highlighter - Desktop App

Analyze YouTube meeting transcripts with AI-powered insights.

## Quick Start

### First Time Setup

**Mac/Linux:**
```bash
./setup.sh
```

**Windows:**
```
Double-click setup.bat
```

Then edit `.env` and add your OpenAI API key.

### Running the App

**Mac/Linux:**
```bash
./run.sh
# or
python3 desktop_app.py
```

**Windows:**
```
Double-click run.bat
# or
python desktop_app.py
```

## Features

- ✅ Fetch YouTube transcripts
- ✅ AI-powered summaries
- ✅ Entity extraction (people, places, organizations)
- ✅ Word frequency analysis
- ✅ Sentiment analysis
- ✅ Action items extraction
- ✅ Video clip downloads (desktop only)
- ✅ Highlight reels (desktop only)

## Requirements

- Python 3.9 or later
- OpenAI API key

## Troubleshooting

### "No module named X"
Run the setup script again to install missing dependencies.

### "API key not configured"
Make sure your `.env` file has a valid `OPENAI_API_KEY`.

### "Could not find dist folder"
The frontend wasn't included. Contact the developer.

## Support

Report issues: https://github.com/amateurmenace/community-highlighter/issues
README
echo "    ✓ README.md"

# Create the zip
echo ""
echo "[*] Creating zip archive..."
cd "$SCRIPT_DIR"
zip -r "$PACKAGE_NAME.zip" "$PACKAGE_NAME"

# Cleanup
rm -rf "$PACKAGE_DIR"

echo ""
echo "=================================================="
echo "  Package Created!"
echo "=================================================="
echo ""
echo "  File: $SCRIPT_DIR/$PACKAGE_NAME.zip"
echo ""
echo "  Distribution instructions:"
echo "  1. Upload to GitHub Releases"
echo "  2. Users download and extract"
echo "  3. Users run setup.sh or setup.bat"
echo "  4. Users run run.sh or run.bat"
echo ""
