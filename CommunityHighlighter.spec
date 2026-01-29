# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec file for Community Highlighter macOS app
"""

import os
import sys

block_cipher = None

# Get the project root
project_root = os.path.dirname(os.path.abspath(SPEC))

# Helper function to add file only if it exists
def add_if_exists(path, dest='.'):
    full_path = os.path.join(project_root, path) if not os.path.isabs(path) else path
    if os.path.exists(full_path):
        print(f"  ✓ Found: {path}")
        return [(full_path, dest)]
    else:
        print(f"  ✗ Missing (skipped): {path}")
        return []

print("\n📦 Collecting data files...")

# Collect all data files - only include what exists
datas = []

# Frontend build (required)
dist_path = os.path.join(project_root, 'dist')
if os.path.exists(dist_path):
    datas.append((dist_path, 'dist'))
    print(f"  ✓ Found: dist/")
else:
    print(f"  ✗ ERROR: dist/ not found! Run 'npm run build' first")
    sys.exit(1)

# Backend code (required)
backend_path = os.path.join(project_root, 'backend')
if os.path.exists(backend_path):
    datas.append((backend_path, 'backend'))
    print(f"  ✓ Found: backend/")
else:
    print(f"  ✗ ERROR: backend/ not found!")
    sys.exit(1)

# Optional static assets - add only if they exist
datas += add_if_exists('logo.png')
datas += add_if_exists('secondary.png')
datas += add_if_exists('favicon.png')
datas += add_if_exists('favicon.ico')
datas += add_if_exists('.env.example')

# Check for images in other locations
for alt_path in ['src/assets', 'public', 'static']:
    alt_full = os.path.join(project_root, alt_path)
    if os.path.exists(alt_full):
        datas.append((alt_full, alt_path))
        print(f"  ✓ Found: {alt_path}/")

print(f"\n📦 Total data entries: {len(datas)}\n")

# Hidden imports that PyInstaller might miss
hiddenimports = [
    'uvicorn',
    'uvicorn.logging',
    'uvicorn.loops',
    'uvicorn.loops.auto',
    'uvicorn.protocols',
    'uvicorn.protocols.http',
    'uvicorn.protocols.http.auto',
    'uvicorn.protocols.websockets',
    'uvicorn.protocols.websockets.auto',
    'uvicorn.lifespan',
    'uvicorn.lifespan.on',
    'fastapi',
    'starlette',
    'starlette.responses',
    'starlette.routing',
    'starlette.middleware',
    'starlette.middleware.cors',
    'pydantic',
    'pydantic_core',
    'httpx',
    'httpcore',
    'openai',
    'yt_dlp',
    'youtube_transcript_api',
    'chromadb',
    'tiktoken',
    'tiktoken_ext',
    'tiktoken_ext.openai_public',
    'numpy',
    'pandas',
    'aiofiles',
    'python_multipart',
    'email_validator',
    'anyio',
    'sniffio',
    'h11',
    'dotenv',
    'python-dotenv',
]

a = Analysis(
    ['app_launcher.py'],
    pathex=[project_root],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='CommunityHighlighter',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,  # No terminal window
    disable_windowed_traceback=False,
    argv_emulation=True,  # Important for macOS
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='CommunityHighlighter',
)

# Determine icon path
icon_path = None
for icon_candidate in ['AppIcon.icns', 'logo.png', 'favicon.png']:
    if os.path.exists(os.path.join(project_root, icon_candidate)):
        icon_path = icon_candidate
        break

app = BUNDLE(
    coll,
    name='Community Highlighter.app',
    icon=icon_path,
    bundle_identifier='com.communityhighlighter.app',
    info_plist={
        'CFBundleName': 'Community Highlighter',
        'CFBundleDisplayName': 'Community Highlighter',
        'CFBundleShortVersionString': '7.0.0',
        'CFBundleVersion': '7.0.0',
        'CFBundleIdentifier': 'com.communityhighlighter.app',
        'NSHighResolutionCapable': True,
        'LSMinimumSystemVersion': '10.15',
        'NSRequiresAquaSystemAppearance': False,  # Support dark mode
        'CFBundleDocumentTypes': [],
        'LSApplicationCategoryType': 'public.app-category.productivity',
    },
)
