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

def update_ytdlp():
    """Update yt-dlp to the latest nightly version from GitHub.
    YouTube frequently blocks older versions, so this is critical for video downloads."""
    import subprocess
    import shutil
    
    print("[*] Checking yt-dlp version...")
    
    # Check if yt-dlp exists
    if not shutil.which('yt-dlp'):
        print("[!] yt-dlp not found - installing nightly version...")
    else:
        # Show current version
        try:
            result = subprocess.run(['yt-dlp', '--version'], capture_output=True, text=True, timeout=10)
            current_version = result.stdout.strip()
            print(f"[*] Current yt-dlp version: {current_version}")
        except:
            pass
    
    # Install/update to latest nightly from GitHub
    print("[*] Updating yt-dlp to latest nightly (YouTube blocks old versions)...")
    try:
        result = subprocess.run(
            [sys.executable, '-m', 'pip', 'install', '-U', 
             'https://github.com/yt-dlp/yt-dlp/archive/master.tar.gz'],
            capture_output=True, text=True, timeout=120
        )
        if result.returncode == 0:
            print("[OK] yt-dlp updated successfully!")
            # Show new version
            try:
                result = subprocess.run(['yt-dlp', '--version'], capture_output=True, text=True, timeout=10)
                print(f"[OK] New version: {result.stdout.strip()}")
            except:
                pass
            return True
        else:
            print(f"[!] yt-dlp update failed: {result.stderr[:200]}")
            return False
    except subprocess.TimeoutExpired:
        print("[!] yt-dlp update timed out")
        return False
    except Exception as e:
        print(f"[!] yt-dlp update error: {e}")
        return False

def setup_environment():
    """Configure environment for desktop mode"""
    script_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(script_dir)
    
    # CRITICAL: Ensure desktop mode (enables video download features)
    # This must be set BEFORE importing the FastAPI app
    os.environ["CLOUD_MODE"] = "false"
    print("[*] CLOUD_MODE=false (video downloads enabled)")
    
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
    """Check for required files and tools"""
    issues = []
    
    env_found = os.path.exists(os.path.join(script_dir, ".env")) or \
                os.path.exists(os.path.join(script_dir, "backend", ".env"))
    if not env_found:
        issues.append("No .env file - API keys may not be configured")
    
    dist_found = os.path.exists(os.path.join(script_dir, "dist")) or \
                 os.path.exists(os.path.join(script_dir, "backend", "dist"))
    if not dist_found:
        issues.append("No 'dist' folder - run 'npm run build'")
    
    # Check for yt-dlp (required for video downloads)
    # IMPORTANT: Must use nightly version - YouTube blocks stable releases quickly!
    import shutil
    import subprocess
    
    if not shutil.which('yt-dlp'):
        issues.append("yt-dlp not found - VIDEO DOWNLOADS WILL NOT WORK!")
        issues.append("  Install NIGHTLY version (stable gets blocked by YouTube):")
        issues.append("  pip install --upgrade https://github.com/yt-dlp/yt-dlp/archive/master.tar.gz")
    else:
        # Check if yt-dlp needs updating (it usually does!)
        issues.append("TIP: Update yt-dlp regularly - YouTube blocks old versions quickly!")
        issues.append("  Update: pip install -U https://github.com/yt-dlp/yt-dlp/archive/master.tar.gz")
    
    # Check for ffmpeg (required for video processing)
    if not shutil.which('ffmpeg'):
        issues.append("ffmpeg not found - VIDEO PROCESSING WILL NOT WORK!")
        issues.append("  Install with: brew install ffmpeg (macOS)")
        issues.append("  Or download from: https://ffmpeg.org/download.html")
    
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
    
    # Auto-update yt-dlp (critical - YouTube blocks old versions!)
    print("\n" + "-" * 50)
    update_ytdlp()
    print("-" * 50 + "\n")
    
    # Check prerequisites and show any issues
    issues = check_prerequisites(script_dir)
    has_critical = False
    for issue in issues:
        if "VIDEO" in issue and "WILL NOT WORK" in issue:
            print(f"[!] {issue}")
            has_critical = True
        elif "TIP:" in issue or "Update:" in issue:
            # Skip update tips since we just auto-updated
            pass
        else:
            print(f"[!] {issue}")
    
    if has_critical:
        print("\n" + "-" * 50)
        print("  WARNING: Video download tools are missing!")
        print("  Install yt-dlp and ffmpeg to enable video exports.")
        print("-" * 50 + "\n")
    
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
    print(f"[OK] Video downloads: {'ENABLED' if not has_critical else 'DISABLED (missing tools)'}")
    
    if not open_native_window(url):
        print("[!] pywebview not available - using browser")
        print("    Install for native window: pip install pywebview")
        open_in_browser(url)

if __name__ == "__main__":
    main()
