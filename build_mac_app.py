#!/usr/bin/env python3
"""
Build macOS .app Bundle
========================

This script creates a proper macOS application bundle that:
- Looks like a real app (icon in Finder)
- Double-click to launch
- Includes all necessary files
- Creates app icon from logo.png

Usage:
    python build_mac_app.py

Output:
    Community Highlighter.app (in current directory)
"""

import os
import sys
import shutil
import stat
import subprocess

APP_NAME = "Community Highlighter"
APP_VERSION = "6.0"
BUNDLE_ID = "org.weirdmachine.communityhighlighter"


def create_icns_from_png(png_path, icns_path):
    """Create macOS .icns icon from PNG file"""
    print(f"[*] Creating app icon from {png_path}...")
    
    try:
        from PIL import Image
    except ImportError:
        print("    [!] Pillow not installed. Installing...")
        subprocess.run([sys.executable, '-m', 'pip', 'install', 'Pillow', '-q'])
        from PIL import Image
    
    # Create iconset directory
    iconset_dir = icns_path.replace('.icns', '.iconset')
    os.makedirs(iconset_dir, exist_ok=True)
    
    # Required icon sizes for macOS
    sizes = [16, 32, 64, 128, 256, 512, 1024]
    
    try:
        img = Image.open(png_path)
        
        # Ensure image is RGBA
        if img.mode != 'RGBA':
            img = img.convert('RGBA')
        
        # Create each size
        for size in sizes:
            # Standard resolution
            resized = img.resize((size, size), Image.Resampling.LANCZOS)
            if size <= 512:
                resized.save(os.path.join(iconset_dir, f'icon_{size}x{size}.png'))
            
            # High resolution (@2x) - only for sizes up to 512
            if size <= 512:
                resized_2x = img.resize((size * 2, size * 2), Image.Resampling.LANCZOS)
                resized_2x.save(os.path.join(iconset_dir, f'icon_{size}x{size}@2x.png'))
        
        # Use iconutil to create .icns (macOS only)
        result = subprocess.run(
            ['iconutil', '-c', 'icns', iconset_dir, '-o', icns_path],
            capture_output=True, text=True
        )
        
        if result.returncode == 0:
            print(f"    [OK] Created {icns_path}")
            # Clean up iconset
            shutil.rmtree(iconset_dir)
            return True
        else:
            print(f"    [!] iconutil failed: {result.stderr}")
            # Keep PNG as fallback
            shutil.copy(png_path, icns_path.replace('.icns', '.png'))
            shutil.rmtree(iconset_dir)
            return False
            
    except Exception as e:
        print(f"    [!] Icon creation failed: {e}")
        if os.path.exists(iconset_dir):
            shutil.rmtree(iconset_dir)
        return False


def create_app_bundle():
    """Create the .app bundle structure"""
    
    script_dir = os.path.dirname(os.path.abspath(__file__))
    app_path = os.path.join(script_dir, f"{APP_NAME}.app")
    
    print(f"\n{'=' * 50}")
    print(f"  Building {APP_NAME}.app")
    print(f"{'=' * 50}\n")
    
    # Remove existing bundle
    if os.path.exists(app_path):
        print(f"[*] Removing existing {APP_NAME}.app...")
        shutil.rmtree(app_path)
    
    # Create directory structure
    print("[*] Creating app bundle structure...")
    contents_dir = os.path.join(app_path, "Contents")
    macos_dir = os.path.join(contents_dir, "MacOS")
    resources_dir = os.path.join(contents_dir, "Resources")
    
    os.makedirs(macos_dir)
    os.makedirs(resources_dir)
    
    # Create app icon
    icon_name = "AppIcon"
    logo_path = os.path.join(script_dir, 'logo.png')
    icns_path = os.path.join(resources_dir, f'{icon_name}.icns')
    
    if os.path.exists(logo_path):
        create_icns_from_png(logo_path, icns_path)
    else:
        print(f"    [!] logo.png not found at {logo_path}")
    
    # Create Info.plist
    print("[*] Creating Info.plist...")
    info_plist = f'''<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleName</key>
    <string>{APP_NAME}</string>
    <key>CFBundleDisplayName</key>
    <string>{APP_NAME}</string>
    <key>CFBundleIdentifier</key>
    <string>{BUNDLE_ID}</string>
    <key>CFBundleVersion</key>
    <string>{APP_VERSION}</string>
    <key>CFBundleShortVersionString</key>
    <string>{APP_VERSION}</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleExecutable</key>
    <string>launcher</string>
    <key>CFBundleIconFile</key>
    <string>{icon_name}</string>
    <key>LSMinimumSystemVersion</key>
    <string>10.13</string>
    <key>NSHighResolutionCapable</key>
    <true/>
    <key>NSSupportsAutomaticGraphicsSwitching</key>
    <true/>
    <key>LSApplicationCategoryType</key>
    <string>public.app-category.productivity</string>
</dict>
</plist>
'''
    
    with open(os.path.join(contents_dir, "Info.plist"), 'w') as f:
        f.write(info_plist)
    
    # Create the launcher script
    print("[*] Creating launcher script...")
    launcher_script = '''#!/bin/bash

# Community Highlighter Launcher
# This script runs the Python GUI launcher

# Set up PATH to include common Python locations (GUI apps have minimal PATH)
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

# Get the directory where this script is located
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
RESOURCES="$DIR/../Resources"

# Log file for debugging
LOGFILE="$RESOURCES/launcher.log"
echo "=== Launcher started at $(date) ===" > "$LOGFILE"
echo "PATH: $PATH" >> "$LOGFILE"

cd "$RESOURCES"

# Find Python - check specific locations first
PYTHON=""

# Check common Python 3 locations
for p in /opt/homebrew/bin/python3 /usr/local/bin/python3 /usr/bin/python3 /Library/Frameworks/Python.framework/Versions/*/bin/python3; do
    if [ -x "$p" ]; then
        PYTHON="$p"
        echo "Found Python at: $p" >> "$LOGFILE"
        break
    fi
done

# Fallback to PATH search
if [ -z "$PYTHON" ]; then
    if command -v python3 &> /dev/null; then
        PYTHON=$(command -v python3)
        echo "Found Python via PATH: $PYTHON" >> "$LOGFILE"
    elif command -v python &> /dev/null; then
        PYTHON=$(command -v python)
        echo "Found Python via PATH: $PYTHON" >> "$LOGFILE"
    fi
fi

# If still no Python, show error
if [ -z "$PYTHON" ]; then
    echo "ERROR: Python not found!" >> "$LOGFILE"
    osascript -e 'display dialog "Python 3 is required but not installed.\\n\\nPlease install Python from:\\nhttps://www.python.org/downloads/" buttons {"OK"} default button "OK" with icon stop with title "Community Highlighter"'
    exit 1
fi

echo "Using Python: $PYTHON" >> "$LOGFILE"
echo "Python version: $($PYTHON --version 2>&1)" >> "$LOGFILE"

# Check/create virtual environment
if [ ! -d "$RESOURCES/venv" ]; then
    osascript -e 'display notification "Setting up for first run... This may take a minute." with title "Community Highlighter"'
    echo "Creating virtual environment..." >> "$LOGFILE"
    $PYTHON -m venv "$RESOURCES/venv" 2>> "$LOGFILE"
    if [ -d "$RESOURCES/venv" ]; then
        source "$RESOURCES/venv/bin/activate"
        echo "Installing dependencies..." >> "$LOGFILE"
        pip install --upgrade pip --quiet 2>> "$LOGFILE"
        pip install -r "$RESOURCES/requirements.txt" --quiet 2>> "$LOGFILE"
    else
        echo "venv creation failed, using system Python" >> "$LOGFILE"
        # Fallback: use system Python if venv fails
        $PYTHON -m pip install -r "$RESOURCES/requirements.txt" --user --quiet 2>> "$LOGFILE"
    fi
else
    source "$RESOURCES/venv/bin/activate" 2>/dev/null
fi

# Run the launcher
echo "Starting launcher.py..." >> "$LOGFILE"
exec $PYTHON "$RESOURCES/launcher.py" 2>> "$LOGFILE"
'''
    
    launcher_path = os.path.join(macos_dir, "launcher")
    with open(launcher_path, 'w') as f:
        f.write(launcher_script)
    
    # Make launcher executable
    os.chmod(launcher_path, os.stat(launcher_path).st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
    
    # Copy application files to Resources
    print("[*] Copying application files...")
    
    files_to_copy = [
        'launcher.py',
        'desktop_app.py',
        'requirements.txt',
        'README.md',
        'logo.png',
    ]
    
    dirs_to_copy = [
        'backend',
        'dist',
    ]
    
    for f in files_to_copy:
        src = os.path.join(script_dir, f)
        if os.path.exists(src):
            shutil.copy2(src, resources_dir)
            print(f"    Copied: {f}")
        else:
            print(f"    [!] Not found: {f}")
    
    for d in dirs_to_copy:
        src = os.path.join(script_dir, d)
        dst = os.path.join(resources_dir, d)
        if os.path.exists(src):
            shutil.copytree(src, dst)
            print(f"    Copied: {d}/")
        else:
            print(f"    [!] Not found: {d}/")
    
    # Remove any .env file with real keys
    env_path = os.path.join(resources_dir, 'backend', '.env')
    if os.path.exists(env_path):
        os.remove(env_path)
        print("    Removed: backend/.env (for security)")
    
    # Create .env.example
    env_example = os.path.join(resources_dir, 'backend', '.env.example')
    os.makedirs(os.path.dirname(env_example), exist_ok=True)
    with open(env_example, 'w') as f:
        f.write("# Your API keys will be saved here automatically\n")
        f.write("OPENAI_API_KEY=\n")
        f.write("YOUTUBE_API_KEY=\n")
    
    print(f"\n[OK] Created: {app_path}")
    print(f"    Size: {get_dir_size(app_path):.1f} MB")
    
    # Try to remove quarantine attribute
    print("\n[*] Removing quarantine attribute...")
    try:
        subprocess.run(['xattr', '-cr', app_path], check=True, capture_output=True)
        print("[OK] Quarantine removed - app should open without security warnings")
    except:
        print("[!] Could not remove quarantine. Users may need to right-click > Open")
    
    print(f"\n{'=' * 50}")
    print(f"  Build Complete!")
    print(f"{'=' * 50}")
    print(f"\nTo install:")
    print(f"  1. Drag '{APP_NAME}.app' to your Applications folder")
    print(f"  2. Double-click to launch")
    print(f"\nIf you see a security warning:")
    print(f"  1. Right-click the app")
    print(f"  2. Select 'Open' from the menu")
    print(f"  3. Click 'Open' in the dialog")
    print(f"  (This is only needed once)")
    
    return app_path


def get_dir_size(path):
    """Get directory size in MB"""
    total = 0
    for dirpath, dirnames, filenames in os.walk(path):
        for f in filenames:
            fp = os.path.join(dirpath, f)
            total += os.path.getsize(fp)
    return total / (1024 * 1024)


def main():
    # Check we're on macOS
    if sys.platform != 'darwin':
        print("[!] This script is for macOS only.")
        print("    For Windows, use build_executable.py instead.")
        return
    
    create_app_bundle()


if __name__ == "__main__":
    main()
