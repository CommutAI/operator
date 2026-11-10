@echo off
echo ========================================
echo   CommutAI Operator - Start with ngrok
echo ========================================
echo.
echo NOTE: Raspberry Pi services run automatically on the Pi
echo This script starts only the Windows backend and frontend
echo.

echo Step 1: Starting Backend Server...
echo.
start "Backend Server" cmd /k "cd Usersjoshusys-admin\backend && python main.py"
timeout /t 5 /nobreak

echo Step 2: Starting ngrok Tunnel...
echo.
start "ngrok Tunnel" cmd /k "ngrok http http://localhost:8000 --url https://hertz-osmosis-squiggly.ngrok-free.dev"
timeout /t 3 /nobreak

echo Step 3: Starting Frontend Dev Server...
echo.
start "Frontend Dev" cmd /k "npm run dev"

echo.
echo ========================================
echo   All services started!
echo ========================================
echo.
echo Backend:  http://localhost:8000
echo ngrok:    https://hertz-osmosis-squiggly.ngrok-free.dev
echo Frontend: http://localhost:5173
echo.
echo Raspberry Pi services should be running automatically on the Pi
echo.
echo Press any key to exit this window...
pause > nul
