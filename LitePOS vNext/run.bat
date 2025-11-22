@echo off
REM Lightweight local server + open index.html

REM === Settings ===
set PORT=5500

REM Go to the directory where this .bat file lives
cd /d "%~dp0"

REM Start Python HTTP server in a new window
start "LitePOS Server" python -m http.server %PORT%

REM Give the server a moment to start
timeout /t 2 /nobreak >nul

REM Open index.html in default browser
start "" "http://localhost:%PORT%/index.html"
