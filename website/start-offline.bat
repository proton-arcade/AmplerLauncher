@echo off
REM Ampler Launcher - offline start (Windows)
REM Needs Python 3 on PATH. No internet connection is used.
setlocal
cd /d "%~dp0"

where python >nul 2>nul
if %errorlevel%==0 (
    set PY=python
) else (
    where py >nul 2>nul
    if %errorlevel%==0 ( set PY=py -3 ) else (
        echo.
        echo  Python 3 was not found on PATH.
        echo  Install it from https://www.python.org/downloads/ and tick
        echo  "Add Python to PATH", then run this file again.
        echo.
        pause
        exit /b 1
    )
)

echo Starting the Ampler Launcher offline server...
echo Your browser will open http://localhost:8080/
echo Close this window to stop the server.
echo.
%PY% tools\serve.py --port 8080
pause
