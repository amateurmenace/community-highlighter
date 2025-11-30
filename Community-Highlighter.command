#!/bin/bash
# Community Highlighter v6.0 - Mac Launcher
# Double-click this file to start the app!

cd "$(dirname "$0")"

echo "======================================"
echo "  Community Highlighter v6.0"
echo "======================================"
echo ""

# Check for Python
if ! command -v python3 &> /dev/null; then
    echo "ERROR: Python 3 is not installed!"
    echo ""
    echo "Please install Python from: https://www.python.org/downloads/"
    echo ""
    read -p "Press Enter to close..."
    exit 1
fi

# Check for .env file
if [ ! -f "backend/.env" ] && [ ! -f ".env" ]; then
    echo "First time setup detected!"
    echo ""
    echo "You need an OpenAI API key to use this app."
    echo "Get one at: https://platform.openai.com/api-keys"
    echo ""
    read -p "Enter your OpenAI API key: " api_key
    
    if [ -n "$api_key" ]; then
        echo "OPENAI_API_KEY=$api_key" > backend/.env
        echo ""
        echo "API key saved!"
    else
        echo "No API key entered. Some features may not work."
    fi
    echo ""
fi

# Install dependencies if needed
if [ ! -d "venv" ]; then
    echo "Setting up virtual environment (first time only)..."
    python3 -m venv venv
    source venv/bin/activate
    pip install -r requirements.txt --quiet
    echo "Setup complete!"
    echo ""
else
    source venv/bin/activate
fi

# Start the app
echo "Starting Community Highlighter..."
echo "Opening in your browser at: http://127.0.0.1:8000"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

python3 desktop_app.py
