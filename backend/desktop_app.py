#!/usr/bin/env python3
"""
Community Highlighter - Desktop App
===================================

Run this script to launch Community Highlighter as a desktop application.
All features including video clip downloads work in desktop mode.

Usage:
    python desktop_app.py

Requirements:
    pip install pywebview  (optional, for native window)
    
If pywebview is not installed, the app opens in your default browser.
"""

import os
import sys
import time
import threading
import webbrowser
import socket

# Configuration
APP_NAME = "Community Highlighter"
APP_VERSION = "6.0"
DEFAULT_PORT = 8000
WINDOW_WIDTH = 1400
WINDOW_HEIGHT = 900

def setup_environment():
    """Configure environment for desktop mode"""
    script_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(script_dir)
    
    # Ensure desktop mode (enables all features)
    os.environ["CLOUD_MODE"] = "false"
    
    # Add directories to Python path
    if script_dir not in sys.path:
        sys.path.insert(0, script_dir)
    
    backend_dir = os.path.join(script_dir, "backend")
    if os.path.exists(backend_dir) and backend_dir not in sys.path:
        sys.path.insert(0, backend_dir)
    
    return script_dir

def find_app_module(script_dir):
    """Find and import the FastAPI app"""
    locations = [
        ("backend.app", "app"),
        ("app", "app"),
    ]
    
    for module_name, app_var in locations:
        try:
            module = __import__(module_name, fromlist=[app_var])
            app = getattr(module, app_var)
            print(f"[OK] Loaded app from {module_name}")
            return app
        except (ImportError, AttributeError):
            continue
    
    print("\n[ERROR] Could not find the FastAPI app!")
    print("\nExpected structure:")
    print("  community-highlighter/")
    print("  +-- desktop_app.py")
    print("  +-- backend/")
    print("  |   +-- app.py")
    print("  +-- dist/")
    sys.exit(1)

def check_prerequisites(script_dir):
    """Check for required files"""
    issues = []
    
    env_found = os.path.exists(os.path.join(script_dir, ".env")) or \
                os.path.exists(os.path.join(script_dir, "backend", ".env"))
    if not env_found:
        issues.append("No .env file - API keys may not be configured")
    
    dist_found = os.path.exists(os.path.join(script_dir, "dist")) or \
                 os.path.exists(os.path.join(script_dir, "backend", "dist"))
    if not dist_found:
        issues.append("No 'dist' folder - run 'npm run build'")
    
    return issues

def start_server(app, port):
    """Start the FastAPI server"""
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="info")

def wait_for_server(port, timeout=30):
    """Wait for server to be available"""
    start_time = time.time()
    while time.time() - start_time < timeout:
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(1)
            result = sock.connect_ex(('127.0.0.1', port))
            sock.close()
            if result == 0:
                return True
        except:
            pass
        time.sleep(0.5)
    return False

def open_native_window(url):
    """Try to open a native window"""
    try:
        import webview
        webview.create_window(
            APP_NAME, url,
            width=WINDOW_WIDTH, height=WINDOW_HEIGHT,
            resizable=True, min_size=(800, 600)
        )
        webview.start()
        return True
    except ImportError:
        return False
    except Exception as e:
        print(f"[!] Native window error: {e}")
        return False

def open_in_browser(url):
    """Open in browser and keep running"""
    print(f"\n[OK] Opening: {url}")
    webbrowser.open(url)
    
    print("\n" + "=" * 50)
    print("  Server running! Press Ctrl+C to stop")
    print("=" * 50 + "\n")
    
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n[*] Shutting down...")

def main():
    print("\n" + "=" * 50)
    print(f"  {APP_NAME} v{APP_VERSION} - Desktop Mode")
    print("=" * 50 + "\n")
    
    script_dir = setup_environment()
    print(f"[*] Directory: {script_dir}")
    
    for issue in check_prerequisites(script_dir):
        print(f"[!] {issue}")
    
    try:
        import uvicorn
    except ImportError:
        print("\n[ERROR] uvicorn not installed! Run: pip install uvicorn")
        sys.exit(1)
    
    print("[*] Loading application...")
    app = find_app_module(script_dir)
    
    print(f"[*] Starting server on port {DEFAULT_PORT}...")
    threading.Thread(target=start_server, args=(app, DEFAULT_PORT), daemon=True).start()
    
    print("[*] Waiting for server...")
    if not wait_for_server(DEFAULT_PORT):
        print("[ERROR] Server failed to start")
        sys.exit(1)
    
    url = f"http://127.0.0.1:{DEFAULT_PORT}"
    print(f"[OK] Server ready: {url}")
    
    if not open_native_window(url):
        print("[!] pywebview not available - using browser")
        print("    Install for native window: pip install pywebview")
        open_in_browser(url)

if __name__ == "__main__":
    main()
