# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec file for Community Highlighter Windows build.
Run on a Windows machine: pyinstaller CommunityHighlighter-Windows.spec --clean --noconfirm
"""

import os
import sys

block_cipher = None

project_root = os.path.dirname(os.path.abspath(SPEC))

def add_if_exists(path, dest='.'):
    full_path = os.path.join(project_root, path) if not os.path.isabs(path) else path
    if os.path.exists(full_path):
        print(f"  + Found: {path}")
        return [(full_path, dest)]
    else:
        print(f"  - Missing (skipped): {path}")
        return []

print("\n=== Collecting data files ===")

datas = []

# Frontend build (required)
dist_path = os.path.join(project_root, 'dist')
if os.path.exists(dist_path):
    datas.append((dist_path, 'dist'))
else:
    print("ERROR: dist/ not found! Run 'npm run build' first")
    sys.exit(1)

# Backend code (required) - selectively include, excluding venv/dist/build/cache
backend_path = os.path.join(project_root, 'backend')
if os.path.exists(backend_path):
    backend_excludes = {'venv', '.venv', 'dist', 'build', 'cache', '__pycache__', '.git', 'node_modules'}
    for item in os.listdir(backend_path):
        if item in backend_excludes:
            print(f"  - Excluding: backend/{item}/")
            continue
        item_path = os.path.join(backend_path, item)
        if os.path.isfile(item_path):
            datas.append((item_path, 'backend'))
            print(f"  + Found: backend/{item}")
        elif os.path.isdir(item_path):
            datas.append((item_path, os.path.join('backend', item)))
            print(f"  + Found: backend/{item}/")
else:
    print("ERROR: backend/ not found!")
    sys.exit(1)

# Optional assets
datas += add_if_exists('logo.png')
datas += add_if_exists('secondary.png')
datas += add_if_exists('favicon.png')
datas += add_if_exists('favicon.ico')

for alt_path in ['src/assets', 'public', 'static']:
    alt_full = os.path.join(project_root, alt_path)
    if os.path.exists(alt_full):
        datas.append((alt_full, alt_path))

print(f"\n=== Total data entries: {len(datas)} ===\n")

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
    excludes=[
        'torch', 'torch._C', 'torch.cuda', 'torchvision', 'torchaudio',
        'scipy', 'scipy.optimize', 'scipy.linalg',
        'sklearn', 'sklearn.utils',
        'matplotlib', 'matplotlib.pyplot',
        'PIL.ImageTk', 'tkinter',
        'IPython', 'notebook', 'jupyter',
        'pytest', 'unittest',
        'numpy.testing',
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
    [],
    exclude_binaries=True,
    name='CommunityHighlighter',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,  # No console window
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    icon='favicon.ico' if os.path.exists(os.path.join(project_root, 'favicon.ico')) else None,
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
