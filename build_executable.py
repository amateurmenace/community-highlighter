#!/usr/bin/env python3
"""
Community Highlighter - Build Script
=====================================

This script builds standalone executables for Windows and macOS.

Requirements:
    pip install pyinstaller

Usage:
    python build_executable.py

Output:
    - Windows: dist/CommunityHighlighter.exe
    - macOS: dist/Community Highlighter.app
"""

import os
import sys
import shutil
import subprocess
import platform

# Configuration
APP_NAME = "CommunityHighlighter"
APP_VERSION = "6.0"

def check_requirements():
    """Check that all requirements are met"""
    print("[*] Checking requirements...")
    
    # Check PyInstaller
    try:
        import PyInstaller
        print(f"    PyInstaller: {PyInstaller.__version__}")
    except ImportError:
        print("[!] PyInstaller not found. Installing...")
        subprocess.run([sys.executable, "-m", "pip", "install", "pyinstaller"])
    
    # Check for dist folder (frontend build)
    if not os.path.exists("dist"):
        print("[!] Frontend build not found. Run 'npm run build' first.")
        return False
    
    # Check for backend
    if not os.path.exists("backend/app.py"):
        print("[!] Backend not found. Make sure backend/app.py exists.")
        return False
    
    print("[OK] All requirements met")
    return True

def clean_build():
    """Clean previous build artifacts"""
    print("[*] Cleaning previous builds...")
    
    dirs_to_clean = ["build", "dist/CommunityHighlighter", "__pycache__"]
    files_to_clean = [f"{APP_NAME}.spec"]
    
    for d in dirs_to_clean:
        if os.path.exists(d):
            shutil.rmtree(d)
            print(f"    Removed: {d}")
    
    for f in files_to_clean:
        if os.path.exists(f):
            os.remove(f)
            print(f"    Removed: {f}")

def build_executable():
    """Build the executable using PyInstaller"""
    print("\n[*] Building executable...")
    print(f"    Platform: {platform.system()}")
    print(f"    Python: {sys.version}")
    
    # Determine icon file
    icon_arg = []
    if platform.system() == "Windows" and os.path.exists("icon.ico"):
        icon_arg = ["--icon=icon.ico"]
    elif platform.system() == "Darwin" and os.path.exists("icon.icns"):
        icon_arg = ["--icon=icon.icns"]
    
    # Build command
    cmd = [
        sys.executable, "-m", "PyInstaller",
        "--name", APP_NAME,
        "--onefile",  # Single executable
        "--console",  # Show console (change to --windowed for no console)
        
        # Add data files
        "--add-data", f"dist{os.pathsep}dist",
        "--add-data", f"backend{os.pathsep}backend",
        
        # Hidden imports
        "--hidden-import", "uvicorn",
        "--hidden-import", "uvicorn.logging",
        "--hidden-import", "uvicorn.loops",
        "--hidden-import", "uvicorn.loops.auto",
        "--hidden-import", "uvicorn.protocols",
        "--hidden-import", "uvicorn.protocols.http",
        "--hidden-import", "uvicorn.protocols.http.auto",
        "--hidden-import", "uvicorn.protocols.websockets",
        "--hidden-import", "uvicorn.protocols.websockets.auto",
        "--hidden-import", "uvicorn.lifespan",
        "--hidden-import", "uvicorn.lifespan.on",
        "--hidden-import", "fastapi",
        "--hidden-import", "starlette",
        "--hidden-import", "pydantic",
        "--hidden-import", "httpx",
        "--hidden-import", "openai",
        "--hidden-import", "tiktoken",
        "--hidden-import", "tiktoken_ext",
        "--hidden-import", "tiktoken_ext.openai_public",
        "--hidden-import", "dotenv",
        "--hidden-import", "aiofiles",
        "--hidden-import", "anyio",
        "--hidden-import", "httptools",
        "--hidden-import", "websockets",
        "--hidden-import", "youtube_transcript_api",
        
        # Exclude unnecessary modules to reduce size
        "--exclude-module", "matplotlib",
        "--exclude-module", "numpy.testing",
        "--exclude-module", "scipy",
        "--exclude-module", "PIL",
        "--exclude-module", "cv2",
        
        *icon_arg,
        
        # Entry point
        "app_launcher.py"
    ]
    
    print(f"\n    Running: {' '.join(cmd[:5])}...")
    
    result = subprocess.run(cmd)
    
    if result.returncode != 0:
        print("[ERROR] Build failed!")
        return False
    
    print("[OK] Build completed!")
    return True

def post_build():
    """Post-build tasks"""
    print("\n[*] Post-build tasks...")
    
    # Create .env.example in dist
    dist_dir = "dist"
    
    if platform.system() == "Darwin":
        # macOS - check for app bundle
        app_path = os.path.join(dist_dir, f"{APP_NAME}.app")
        if os.path.exists(app_path):
            print(f"    Created: {app_path}")
    
    exe_name = f"{APP_NAME}.exe" if platform.system() == "Windows" else APP_NAME
    exe_path = os.path.join(dist_dir, exe_name)
    
    if os.path.exists(exe_path):
        size_mb = os.path.getsize(exe_path) / (1024 * 1024)
        print(f"    Executable: {exe_path} ({size_mb:.1f} MB)")
    
    # Create README for distribution
    readme_path = os.path.join(dist_dir, "README.txt")
    with open(readme_path, 'w') as f:
        f.write(f"""Community Highlighter v{APP_VERSION}
================================

Quick Start:
1. Run CommunityHighlighter{'.exe' if platform.system() == 'Windows' else ''}
2. On first run, enter your OpenAI API key
3. The app will open in your browser

Get an API key at: https://platform.openai.com/api-keys

For help: https://github.com/amateurmenace/community-highlighter
""")
    print(f"    Created: {readme_path}")
    
    print("\n" + "=" * 50)
    print("  BUILD COMPLETE!")
    print("=" * 50)
    print(f"\nExecutable location: {exe_path}")
    print("\nTo distribute:")
    print(f"  1. Copy {exe_path} to users")
    print("  2. Users run it and enter their API key")
    print("  3. App opens in browser automatically")

def main():
    print("\n" + "=" * 50)
    print(f"  Community Highlighter Build Script v{APP_VERSION}")
    print("=" * 50 + "\n")
    
    # Change to script directory
    script_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(script_dir)
    print(f"[*] Working directory: {script_dir}")
    
    if not check_requirements():
        print("\n[!] Please fix the issues above and try again.")
        sys.exit(1)
    
    clean_build()
    
    if not build_executable():
        sys.exit(1)
    
    post_build()

if __name__ == "__main__":
    main()
