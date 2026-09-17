@echo off
REM Start the local EaglerXServer for LAN multiplayer with no internet.
setlocal
cd /d "%~dp0"

set JAR=EaglerXServer.jar

if not exist "%JAR%" (
    echo %JAR% not found. Run fetch-server.bat first (needs internet once),
    echo or build it from eaglerxserver-1.1.1-src.zip.
    pause
    exit /b 1
)

where java >nul 2>nul
if not %errorlevel%==0 (
    echo java not found on PATH. Install Java 8 or newer.
    pause
    exit /b 1
)

echo Starting EaglerXServer on port 25565 (LAN)...
java -Xmx2G -jar %JAR%
pause
