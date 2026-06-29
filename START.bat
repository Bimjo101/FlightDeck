@echo off
title FlightDeck — Starting...
cd /d "%~dp0"

echo Checking Node.js...
node --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo Node.js is not installed. Please download and install it from:
    echo     https://nodejs.org   (use the LTS version)
    echo.
    echo After installing Node.js, run this file again.
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo.
    echo First run — installing dependencies (takes 1-2 minutes)...
    call npm install
    if %ERRORLEVEL% NEQ 0 (
        echo.
        echo Installation failed. Check your internet connection and try again.
        pause
        exit /b 1
    )
)

echo.
echo Starting FlightDeck...
call npm run dev
