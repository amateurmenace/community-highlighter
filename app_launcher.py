#!/usr/bin/env python3
"""
Community Highlighter - macOS App Launcher
This script launches the desktop application as a proper macOS app.
Always updates yt-dlp to the latest version on startup.
"""

import os
import sys
import multiprocessing
import subprocess
import webbrowser
import time
import threading
import signal
import socket
import tempfile
import atexit

# Prevent fork-bomb on macOS when frozen
multiprocessing.freeze_support()

# Flag to track if browser was opened
_browser_opened = False

# Single-instance lock file
_lock_file_path = os.path.join(tempfile.gettempdir(), 'community-highlighter.lock')
_lock_file_handle = None


def acquire_instance_lock():
    """Prevent multiple instances from launching simultaneously."""
    global _lock_file_handle
    try:
        _lock_file_handle = open(_lock_file_path, 'w')
        if sys.platform == 'win32':
            import msvcrt
            msvcrt.locking(_lock_file_handle.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(_lock_file_handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        _lock_file_handle.write(str(os.getpid()))
        _lock_file_handle.flush()
        atexit.register(release_instance_lock)
        return True
    except (IOError, OSError):
        return False


def release_instance_lock():
    """Release the single-instance lock."""
    global _lock_file_handle
    if _lock_file_handle:
        try:
            if sys.platform == 'win32':
                import msvcrt
                msvcrt.locking(_lock_file_handle.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                import fcntl
                fcntl.flock(_lock_file_handle, fcntl.LOCK_UN)
            _lock_file_handle.close()
            os.unlink(_lock_file_path)
        except (IOError, OSError):
            pass
        _lock_file_handle = None

def get_app_path():
    """Get the path to the app bundle or development directory."""
    if getattr(sys, 'frozen', False):
        # Running as a bundled app
        return os.path.dirname(sys.executable)
    else:
        # Running in development
        return os.path.dirname(os.path.abspath(__file__))

def get_resource_path(relative_path):
    """Get the path to a resource, works for dev and PyInstaller."""
    if getattr(sys, 'frozen', False):
        # Running as bundled app - resources are in the app bundle
        base_path = sys._MEIPASS
    else:
        base_path = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(base_path, relative_path)

def is_port_in_use(port):
    """Check if a port is already in use."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(('127.0.0.1', port)) == 0

def find_ffmpeg():
    """Find ffmpeg, checking common locations."""
    # Check if bundled
    bundled_ffmpeg = get_resource_path('ffmpeg')
    if os.path.exists(bundled_ffmpeg):
        return bundled_ffmpeg
    
    # Check common Homebrew locations
    common_paths = [
        '/opt/homebrew/bin/ffmpeg',  # Apple Silicon
        '/usr/local/bin/ffmpeg',      # Intel Mac
        '/usr/bin/ffmpeg',            # System
    ]
    
    for path in common_paths:
        if os.path.exists(path):
            return path
    
    # Try to find in PATH
    try:
        result = subprocess.run(['which', 'ffmpeg'], capture_output=True, text=True)
        if result.returncode == 0:
            return result.stdout.strip()
    except:
        pass
    
    return None

def update_yt_dlp():
    """Update yt-dlp to the latest nightly version for best YouTube compatibility."""
    print("🔄 Updating yt-dlp to latest nightly build...")
    try:
        # First try the nightly/master version for latest fixes
        result = subprocess.run([
            sys.executable, '-m', 'pip', 'install', '-U', '--quiet',
            'https://github.com/yt-dlp/yt-dlp/archive/master.tar.gz'
        ], capture_output=True, text=True, timeout=120)
        
        if result.returncode == 0:
            print("✅ yt-dlp updated to latest nightly build")
        else:
            # Fallback to stable release
            print("⚠️ Nightly failed, trying stable release...")
            subprocess.run([
                sys.executable, '-m', 'pip', 'install', '-U', '--quiet', 'yt-dlp'
            ], capture_output=True, timeout=120)
            print("✅ yt-dlp updated to latest stable")
            
    except subprocess.TimeoutExpired:
        print("⚠️ yt-dlp update timed out, using existing version")
    except Exception as e:
        print(f"⚠️ Could not update yt-dlp: {e}")

def load_env_file():
    """Load environment variables from .env file."""
    env_locations = [
        os.path.join(get_app_path(), '.env'),
        os.path.join(os.path.expanduser('~'), '.community-highlighter', '.env'),
        os.path.join(get_resource_path(''), '.env'),
    ]
    
    for env_path in env_locations:
        if os.path.exists(env_path):
            print(f"📁 Loading environment from: {env_path}")
            with open(env_path, 'r') as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith('#') and '=' in line:
                        key, value = line.split('=', 1)
                        os.environ[key.strip()] = value.strip().strip('"').strip("'")
            return True
    
    print("⚠️ No .env file found. Create one at ~/.community-highlighter/.env")
    print("   Add: OPENAI_API_KEY=your-key-here")
    return False

def open_browser_once(url, delay=2):
    """Open browser only once after a delay."""
    global _browser_opened
    if _browser_opened:
        return
    _browser_opened = True
    
    def _open():
        time.sleep(delay)
        # Double-check server is ready before opening
        for _ in range(10):
            if is_port_in_use(8000):
                webbrowser.open(url)
                return
            time.sleep(0.5)
        # Open anyway after waiting
        webbrowser.open(url)
    
    thread = threading.Thread(target=_open)
    thread.daemon = True
    thread.start()

def main():
    global _browser_opened

    # Prevent multiple instances from spawning (fixes infinite relaunch)
    if not acquire_instance_lock():
        print("⚠️ Another instance is already starting. Exiting.")
        # If port is already up, just open browser
        if is_port_in_use(8000):
            webbrowser.open('http://127.0.0.1:8000')
        sys.exit(0)

    print("=" * 60)
    print("🏛️  Community Highlighter - Desktop App")
    print("    Full-featured version with video download")
    print("=" * 60)

    # Check if already running
    if is_port_in_use(8000):
        print("⚠️ App already running on port 8000")
        print("🌐 Opening browser...")
        webbrowser.open('http://127.0.0.1:8000')
        print("\nTo stop the existing server, run:")
        print("  pkill -f uvicorn")
        return
    
    # Set up paths
    app_path = get_app_path()
    os.chdir(app_path)
    
    # Load environment variables
    if not load_env_file():
        print("\n" + "=" * 60)
        print("⚠️  SETUP REQUIRED")
        print("=" * 60)
        print("\nTo use Community Highlighter, you need an OpenAI API key.")
        print("\n1. Create the config directory:")
        print("   mkdir -p ~/.community-highlighter")
        print("\n2. Create the .env file:")
        print("   echo 'OPENAI_API_KEY=your-key-here' > ~/.community-highlighter/.env")
        print("\n3. Restart the app")
        print("=" * 60 + "\n")
    
    # Check for ffmpeg
    ffmpeg_path = find_ffmpeg()
    if ffmpeg_path:
        print(f"✅ Found ffmpeg: {ffmpeg_path}")
        os.environ['FFMPEG_PATH'] = ffmpeg_path
    else:
        print("⚠️ ffmpeg not found. Video features may not work.")
        print("   Install with: brew install ffmpeg")
    
    # Update yt-dlp SYNCHRONOUSLY to ensure it's ready
    update_yt_dlp()
    
    # Set desktop mode - enables all video features
    os.environ['DESKTOP_MODE'] = 'true'
    
    # Import and run the app
    print("\n🚀 Starting server...")
    
    # Add backend to path
    backend_path = get_resource_path('backend')
    if os.path.exists(backend_path):
        sys.path.insert(0, backend_path)
    
    # Open browser ONCE after delay
    open_browser_once('http://127.0.0.1:8000', delay=3)
    
    # Import and run
    try:
        # Try to import the app module
        sys.path.insert(0, get_resource_path(''))
        from backend.app import app
        import uvicorn
        
        print("🌐 Browser will open to http://127.0.0.1:8000")
        print("\n" + "=" * 60)
        print("Desktop Features Enabled:")
        print("  ✅ Video Download (via yt-dlp)")
        print("  ✅ Highlight Reel Builder")
        print("  ✅ Clip Export")
        print("  ✅ Social Media Reel Generator")
        print("=" * 60)
        print("Press Ctrl+C to quit")
        print("=" * 60 + "\n")
        
        # Run WITHOUT reload to prevent multiple browser opens
        uvicorn.run(app, host="127.0.0.1", port=8000, log_level="info", reload=False)
        
    except KeyboardInterrupt:
        print("\n👋 Shutting down...")
        sys.exit(0)
    except Exception as e:
        print(f"❌ Error starting app: {e}")
        import traceback
        traceback.print_exc()
        input("\nPress Enter to exit...")
        sys.exit(1)

if __name__ == '__main__':
    main()
