@echo off
REM One-time setup: fetch the prebuilt EaglerXServer.jar (needs internet once).
REM The launcher and all five clients are already fully offline; this is only
REM for hosting multiplayer on your own machine/LAN.
setlocal
cd /d "%~dp0"

set VERSION=v1.1.1
set JAR=EaglerXServer.jar
set URL=https://github.com/lax1dude/eaglerxserver/releases/download/%VERSION%/%JAR%

if exist "%JAR%" (
    echo Already present: %JAR%
    pause
    exit /b 0
)

echo Downloading %JAR% (%VERSION%)...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '%URL%' -OutFile '%JAR%'"

if not exist "%JAR%" (
    echo Download failed. Get it manually from:
    echo   %URL%
    pause
    exit /b 1
)

echo.
echo Done. Now run:  start-server.bat
echo Requires Java 8+ (java -version).
pause
