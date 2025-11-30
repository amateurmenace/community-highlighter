#!/usr/bin/env python3
"""
Community Highlighter - App Launcher
====================================

This is the main entry point for the PyInstaller executable.
It handles:
1. Environment setup
2. First-run API key configuration
3. Starting the FastAPI server
4. Opening the browser
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

def get_app_dir():
    """Get the application directory (works for both dev and frozen)"""
    if getattr(sys, 'frozen', False):
        # Running as compiled executable
        return os.path.dirname(sys.executable)
    else:
        # Running as script
        return os.path.dirname(os.path.abspath(__file__))

def get_resource_path(relative_path):
    """Get path to resource, works for dev and for PyInstaller"""
    if getattr(sys, 'frozen', False):
        # Running as compiled executable
        base_path = sys._MEIPASS
    else:
        base_path = get_app_dir()
    return os.path.join(base_path, relative_path)

def setup_environment():
    """Configure environment for the app"""
    app_dir = get_app_dir()
    os.chdir(app_dir)
    
    # Set environment variables
    os.environ["CLOUD_MODE"] = "false"
    
    # Add paths
    if app_dir not in sys.path:
        sys.path.insert(0, app_dir)
    
    backend_dir = get_resource_path('backend')
    if os.path.exists(backend_dir) and backend_dir not in sys.path:
        sys.path.insert(0, backend_dir)
    
    # Load .env file
    env_paths = [
        os.path.join(app_dir, 'backend', '.env'),
        os.path.join(app_dir, '.env'),
        os.path.join(get_resource_path('backend'), '.env'),
    ]
    
    for env_path in env_paths:
        if os.path.exists(env_path):
            load_env_file(env_path)
            break
    
    return app_dir

def load_env_file(path):
    """Load environment variables from .env file"""
    try:
        with open(path, 'r') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, value = line.split('=', 1)
                    os.environ[key.strip()] = value.strip()
        print(f"[OK] Loaded environment from {path}")
    except Exception as e:
        print(f"[!] Failed to load .env: {e}")

def check_api_key():
    """Check if OpenAI API key is configured"""
    key = os.environ.get('OPENAI_API_KEY', '')
    if key and key != 'your-openai-key-here' and key.startswith('sk-'):
        return True
    return False

def prompt_for_api_key():
    """Prompt user for API key via GUI or terminal"""
    print("\n" + "=" * 50)
    print("  First-Time Setup")
    print("=" * 50)
    print("\nYou need an OpenAI API key to use this app.")
    print("Get one at: https://platform.openai.com/api-keys")
    print("")
    
    # Try GUI first
    try:
        import tkinter as tk
        from tkinter import simpledialog, messagebox
        
        root = tk.Tk()
        root.withdraw()
        
        api_key = simpledialog.askstring(
            "Community Highlighter Setup",
            "Enter your OpenAI API key:\n(Get one at platform.openai.com/api-keys)",
            show='*'
        )
        
        root.destroy()
        
        if api_key:
            return api_key.strip()
        return None
        
    except:
        # Fall back to terminal
        try:
            api_key = input("Enter your OpenAI API key: ").strip()
            return api_key if api_key else None
        except:
            return None

def save_api_key(api_key):
    """Save API key to .env file"""
    app_dir = get_app_dir()
    
    # Try backend folder first, then root
    env_paths = [
        os.path.join(app_dir, 'backend', '.env'),
        os.path.join(app_dir, '.env'),
    ]
    
    for env_path in env_paths:
        env_dir = os.path.dirname(env_path)
        if os.path.exists(env_dir):
            try:
                with open(env_path, 'w') as f:
                    f.write(f"OPENAI_API_KEY={api_key}\n")
                os.environ['OPENAI_API_KEY'] = api_key
                print(f"[OK] API key saved to {env_path}")
                return True
            except Exception as e:
                print(f"[!] Failed to save to {env_path}: {e}")
    
    return False

def find_and_import_app():
    """Find and import the FastAPI app"""
    # Try different import paths
    try:
        from backend.app import app
        print("[OK] Loaded app from backend.app")
        return app
    except ImportError:
        pass
    
    try:
        from app import app
        print("[OK] Loaded app from app")
        return app
    except ImportError:
        pass
    
    # Try direct import from resource path
    backend_path = get_resource_path('backend')
    if backend_path not in sys.path:
        sys.path.insert(0, backend_path)
    
    try:
        import app as app_module
        print("[OK] Loaded app from resource path")
        return app_module.app
    except ImportError as e:
        print(f"[ERROR] Could not import app: {e}")
        return None

def start_server(app, port):
    """Start the FastAPI server"""
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="info")

def wait_for_server(port, timeout=30):
    """Wait for server to be ready"""
    start = time.time()
    while time.time() - start < timeout:
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

def main():
    print("\n" + "=" * 50)
    print(f"  {APP_NAME} v{APP_VERSION}")
    print("=" * 50 + "\n")
    
    # Setup environment
    app_dir = setup_environment()
    print(f"[*] App directory: {app_dir}")
    
    # Check for API key
    if not check_api_key():
        print("[!] OpenAI API key not configured")
        api_key = prompt_for_api_key()
        
        if api_key:
            if not api_key.startswith('sk-'):
                print("[!] Warning: OpenAI keys usually start with 'sk-'")
            save_api_key(api_key)
        else:
            print("[!] No API key provided. AI features will not work.")
    else:
        print("[OK] API key found")
    
    # Import and start the app
    print("[*] Loading application...")
    app = find_and_import_app()
    
    if not app:
        print("\n[ERROR] Failed to load the application!")
        print("Please check that all files are present.")
        input("\nPress Enter to exit...")
        sys.exit(1)
    
    # Start server in background thread
    print(f"[*] Starting server on port {DEFAULT_PORT}...")
    server_thread = threading.Thread(
        target=start_server, 
        args=(app, DEFAULT_PORT),
        daemon=True
    )
    server_thread.start()
    
    # Wait for server
    print("[*] Waiting for server to start...")
    if not wait_for_server(DEFAULT_PORT):
        print("[ERROR] Server failed to start!")
        input("\nPress Enter to exit...")
        sys.exit(1)
    
    # Open browser
    url = f"http://127.0.0.1:{DEFAULT_PORT}"
    print(f"\n[OK] Server ready!")
    print(f"[OK] Opening browser: {url}")
    webbrowser.open(url)
    
    # Keep running
    print("\n" + "=" * 50)
    print("  Server running! Close this window to stop.")
    print("=" * 50 + "\n")
    
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n[*] Shutting down...")

if __name__ == "__main__":
    main()
