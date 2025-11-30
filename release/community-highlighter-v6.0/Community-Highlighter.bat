@echo off
REM Community Highlighter v6.0 - Windows Launcher
REM Double-click this file to start the app!

cd /d "%~dp0"

echo ======================================
echo   Community Highlighter v6.0
echo ======================================
echo.

REM Check for Python
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python is not installed!
    echo.
    echo Please install Python from: https://www.python.org/downloads/
    echo Make sure to check "Add Python to PATH" during installation!
    echo.
    pause
    exit /b 1
)

REM Check for .env file
if not exist "backend\.env" (
    if not exist ".env" (
        echo First time setup detected!
        echo.
        echo You need an OpenAI API key to use this app.
        echo Get one at: https://platform.openai.com/api-keys
        echo.
        set /p api_key="Enter your OpenAI API key: "
        
        if not "%api_key%"=="" (
            echo OPENAI_API_KEY=%api_key%> backend\.env
            echo.
            echo API key saved!
        ) else (
            echo No API key entered. Some features may not work.
        )
        echo.
    )
)

REM Install dependencies if needed
if not exist "venv" (
    echo Setting up virtual environment (first time only^)...
    python -m venv venv
    call venv\Scripts\activate.bat
    pip install -r requirements.txt --quiet
    echo Setup complete!
    echo.
) else (
    call venv\Scripts\activate.bat
)

REM Start the app
echo Starting Community Highlighter...
echo Opening in your browser at: http://127.0.0.1:8000
echo.
echo Press Ctrl+C to stop the server
echo.

python desktop_app.py

pause
