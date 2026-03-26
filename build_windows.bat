@echo off
REM Build script for Community Highlighter Windows
REM Run from project root: build_windows.bat

echo ==============================================
echo    Building Community Highlighter for Windows
echo ==============================================

REM Check we're in the right directory
if not exist "package.json" (
    echo ERROR: Run this script from the project root directory
    exit /b 1
)

REM Step 1: Clean previous builds
echo.
echo Cleaning previous builds...
rmdir /s /q build 2>nul
rmdir /s /q dist\CommunityHighlighter 2>nul

REM Step 2: Create/activate virtual environment
echo.
echo Setting up Python environment...
if not exist "venv" (
    echo Creating virtual environment...
    python -m venv venv
)
call venv\Scripts\activate.bat
pip install -r requirements.txt --quiet
pip install pyinstaller --quiet

REM Step 3: Build frontend
echo.
echo Building React frontend...
call npm run build
if errorlevel 1 (
    echo ERROR: Frontend build failed!
    exit /b 1
)

REM Step 4: Run PyInstaller
echo.
echo Building application...
pyinstaller CommunityHighlighter-Windows.spec --clean --noconfirm
if errorlevel 1 (
    echo ERROR: PyInstaller build failed!
    exit /b 1
)

REM Step 5: Check for ffmpeg
echo.
echo Checking for ffmpeg...
where ffmpeg >nul 2>nul
if errorlevel 1 (
    echo WARNING: ffmpeg not found in PATH
    echo Install from: https://www.gyan.dev/ffmpeg/builds/
    echo Or: winget install ffmpeg
) else (
    echo Found ffmpeg
)

REM Step 6: Create portable ZIP
echo.
echo Creating portable ZIP...
powershell -Command "Compress-Archive -Path 'dist\CommunityHighlighter' -DestinationPath 'CommunityHighlighter-7.0.0-Windows.zip' -Force"

echo.
echo ==============================================
echo    BUILD COMPLETE!
echo ==============================================
echo.
echo Output:
echo   dist\CommunityHighlighter\CommunityHighlighter.exe
echo   CommunityHighlighter-7.0.0-Windows.zip
echo.
echo Prerequisites for users:
echo   - ffmpeg (winget install ffmpeg)
echo   - .env file with OPENAI_API_KEY
echo.
pause
