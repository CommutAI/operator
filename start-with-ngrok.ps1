# CommutAI Operator - Start with ngrok
# PowerShell script to launch Windows backend and frontend
# Note: Raspberry Pi services run automatically on the Pi

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  CommutAI Operator - Start with ngrok" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "NOTE: Raspberry Pi services run automatically on the Pi" -ForegroundColor Yellow
Write-Host "This script starts only the Windows backend and frontend" -ForegroundColor Yellow
Write-Host ""

# Check if ngrok is installed
$ngrokInstalled = Get-Command ngrok -ErrorAction SilentlyContinue
if (-not $ngrokInstalled) {
    Write-Host "ERROR: ngrok is not installed or not in PATH" -ForegroundColor Red
    Write-Host "Download from: https://ngrok.com/download" -ForegroundColor Yellow
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}

# Check if Python is installed
$pythonInstalled = Get-Command python -ErrorAction SilentlyContinue
if (-not $pythonInstalled) {
    Write-Host "ERROR: Python is not installed or not in PATH" -ForegroundColor Red
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}

# Check if Node.js is installed
$nodeInstalled = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeInstalled) {
    Write-Host "ERROR: Node.js is not installed or not in PATH" -ForegroundColor Red
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "Step 1: Starting Backend Server..." -ForegroundColor Green
Write-Host ""
$backendPath = Join-Path $PSScriptRoot "Usersjoshusys-admin\backend"
if (Test-Path $backendPath) {
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$backendPath'; python main.py"
    Start-Sleep -Seconds 5
} else {
    Write-Host "ERROR: Backend directory not found at: $backendPath" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "Step 2: Starting ngrok Tunnel..." -ForegroundColor Green
Write-Host ""
Start-Process powershell -ArgumentList "-NoExit", "-Command", "ngrok http http://localhost:8000 --url https://hertz-osmosis-squiggly.ngrok-free.dev"
Start-Sleep -Seconds 3

Write-Host "Step 3: Starting Frontend Dev Server..." -ForegroundColor Green
Write-Host ""
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot'; npm run dev"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  All services started!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Backend:  " -NoNewline
Write-Host "http://localhost:8000" -ForegroundColor Yellow
Write-Host "ngrok:    " -NoNewline
Write-Host "https://hertz-osmosis-squiggly.ngrok-free.dev" -ForegroundColor Yellow
Write-Host "Frontend: " -NoNewline
Write-Host "http://localhost:5173" -ForegroundColor Yellow
Write-Host ""
Write-Host "Raspberry Pi: " -NoNewline
Write-Host "Services running automatically on Pi" -ForegroundColor Green
Write-Host ""
Write-Host "Press any key to exit this window..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
