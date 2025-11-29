#!/usr/bin/env python3
"""
Community Highlighter - Desktop App Launcher
============================================

This script runs the Community Highlighter as a desktop application.
All features work including video clip downloads (no YouTube blocking).

Usage:
    python desktop_app.py

Requirements:
    pip install pywebview

First-time setup:
    1. Make sure you have a .env file with your API keys
    2. Run: npm run build (to build the frontend)
    3. Run: python desktop_app.py
"""

import os
import sys
import time
import threading
import webbrowser

# Ensure we're in the right directory
script_dir = os.path.dirname(os.path.abspath(__file__))
os.chdir(script_dir)

# Set environment to disable cloud mode (enable all features)
os.environ["CLOUD_MODE"] = "false"

# Check for required packages
try:
    import uvicorn
except ImportError:
    print("Missing uvicorn. Install with: pip install uvicorn")
    sys.exit(1)

# Try to use pywebview for native window, fall back to browser
USE_NATIVE_WINDOW = False
try:
    import webview
    USE_NATIVE_WINDOW = True
except ImportError:
    print("[!] pywebview not installed - will open in browser instead")
    print("    For a native desktop window, install: pip install pywebview")

def start_server():
    """Start the FastAPI server"""
    # Import app from backend
    sys.path.insert(0, script_dir)
    
    try:
        from backend.app import app
    except ImportError:
        # Try importing directly if in same folder
        try:
            from app import app
        except ImportError:
            print("ERROR: Could not import app. Make sure app.py is in ./backend/ folder")
            sys.exit(1)
    
    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="info")

def main():
    print("=" * 60)
    print("  Community Highlighter - Desktop App")
    print("=" * 60)
    print()
    
    # Check for .env file
    if not os.path.exists(".env") and not os.path.exists("backend/.env"):
        print("[!] Warning: No .env file found. Make sure API keys are set.")
        print("    Create a .env file with:")
        print("    OPENAI_API_KEY=sk-your-key")
        print()
    
    # Check if frontend is built
    if not os.path.exists("dist"):
        print("[!] Warning: Frontend not built. Run 'npm run build' first.")
        print("    The app will still work but may load slower.")
        print()
    
    # Start server in background thread
    print("[*] Starting server...")
    server_thread = threading.Thread(target=start_server, daemon=True)
    server_thread.start()
    
    # Wait for server to be ready
    print("[*] Waiting for server to start...")
    time.sleep(3)
    
    url = "http://127.0.0.1:8000"
    
    if USE_NATIVE_WINDOW:
        print(f"[OK] Opening native window...")
        print()
        print("Close the window to exit.")
        print()
        
        # Create native desktop window
        webview.create_window(
            "Community Highlighter",
            url,
            width=1400,
            height=900,
            resizable=True,
            min_size=(800, 600)
        )
        webview.start()
    else:
        print(f"[OK] Opening in browser: {url}")
        print()
        print("Press Ctrl+C to stop the server.")
        print()
        
        # Open in default browser
        webbrowser.open(url)
        
        # Keep running until interrupted
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            print("\n[*] Shutting down...")

if __name__ == "__main__":
    main()
