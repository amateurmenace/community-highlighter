# -*- mode: python ; coding: utf-8 -*-
"""
Community Highlighter - PyInstaller Spec File
==============================================

This file configures PyInstaller to build a standalone executable.

Usage:
    pyinstaller community_highlighter.spec

Or use the build script:
    python build_executable.py
"""

import os
import sys
from PyInstaller.utils.hooks import collect_data_files, collect_submodules

block_cipher = None

# Get the directory containing this spec file
SPEC_DIR = os.path.dirname(os.path.abspath(SPECPATH))

# Collect all necessary data files
datas = [
    # Frontend build
    (os.path.join(SPEC_DIR, 'dist'), 'dist'),
    # Backend templates/static if any
    (os.path.join(SPEC_DIR, 'backend'), 'backend'),
]

# Hidden imports that PyInstaller might miss
hidden_imports = [
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
    'pydantic',
    'httpx',
    'openai',
    'chromadb',
    'youtube_transcript_api',
    'yt_dlp',
    'tiktoken',
    'tiktoken_ext',
    'tiktoken_ext.openai_public',
    'dotenv',
    'aiofiles',
    'anyio',
    'httptools',
    'websockets',
    'watchfiles',
    'email_validator',
]

# Collect submodules
hidden_imports += collect_submodules('uvicorn')
hidden_imports += collect_submodules('fastapi')
hidden_imports += collect_submodules('starlette')

a = Analysis(
    ['app_launcher.py'],  # Main entry point
    pathex=[SPEC_DIR],
    binaries=[],
    datas=datas,
    hiddenimports=hidden_imports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        'tkinter',  # Exclude if not needed (saves space)
        'matplotlib',
        'numpy.testing',
        'scipy',
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='CommunityHighlighter',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,  # Set to False for windowed app (no terminal)
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=None,  # Add path to .ico file for Windows icon
)

# For macOS, create an app bundle
app = BUNDLE(
    exe,
    name='Community Highlighter.app',
    icon=None,  # Add path to .icns file for macOS icon
    bundle_identifier='org.weirdmachine.communityhighlighter',
    info_plist={
        'CFBundleName': 'Community Highlighter',
        'CFBundleDisplayName': 'Community Highlighter',
        'CFBundleVersion': '6.0',
        'CFBundleShortVersionString': '6.0',
        'NSHighResolutionCapable': True,
    },
)
