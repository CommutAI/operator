# Test all service connections
# Run this to verify your configuration is working

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  CommutAI Connection Test" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Load .env file
if (Test-Path ".env") {
    Write-Host "[✓] Found .env file" -ForegroundColor Green
    
    $envContent = Get-Content ".env" -Raw
    if ($envContent -match 'VITE_BACKEND_URL=(.+)') {
        $backendUrl = $matches[1].Trim()
        Write-Host "    Backend URL: $backendUrl" -ForegroundColor Gray
    } else {
        Write-Host "    Backend URL: Not configured" -ForegroundColor Yellow
    }
    
    if ($envContent -match 'VITE_RASPBERRY_PI_URL=(.+)') {
        $piUrl = $matches[1].Trim()
        if ($piUrl) {
            Write-Host "    Pi URL: $piUrl" -ForegroundColor Gray
        } else {
            Write-Host "    Pi URL: Auto-discovery enabled" -ForegroundColor Gray
        }
    }
} else {
    Write-Host "[✗] .env file not found" -ForegroundColor Red
}

Write-Host ""
Write-Host "Testing Connections..." -ForegroundColor Cyan
Write-Host ""

# Test 1: Supabase
Write-Host "1. Testing Supabase..." -NoNewline
try {
    $response = Invoke-WebRequest -Uri "https://iyacktzzktwrpeibcena.supabase.co" -Method GET -TimeoutSec 5 -UseBasicParsing
    if ($response.StatusCode -eq 200) {
        Write-Host " [✓] Connected" -ForegroundColor Green
    } else {
        Write-Host " [!] Unexpected response" -ForegroundColor Yellow
    }
} catch {
    Write-Host " [✗] Failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 2: Backend (ngrok)
Write-Host "2. Testing ngrok Backend..." -NoNewline
try {
    $response = Invoke-WebRequest -Uri "https://hertz-osmosis-squiggly.ngrok-free.dev" -Method GET -TimeoutSec 10 -UseBasicParsing
    if ($response.StatusCode -eq 200) {
        Write-Host " [✓] Connected" -ForegroundColor Green
    } else {
        Write-Host " [!] Unexpected response" -ForegroundColor Yellow
    }
} catch {
    Write-Host " [✗] Failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "    Make sure ngrok is running!" -ForegroundColor Yellow
}

# Test 3: Cloudflare Worker
Write-Host "3. Testing Cloudflare Worker..." -NoNewline
try {
    $response = Invoke-WebRequest -Uri "https://sys-admin.lopezkristine749.workers.dev" -Method GET -TimeoutSec 10 -UseBasicParsing
    if ($response.StatusCode -eq 200) {
        Write-Host " [✓] Connected" -ForegroundColor Green
    } else {
        Write-Host " [!] Unexpected response" -ForegroundColor Yellow
    }
} catch {
    Write-Host " [✗] Failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 4: Local Backend (Windows)
Write-Host "4. Testing Local Windows Backend..." -NoNewline
try {
    $response = Invoke-WebRequest -Uri "http://localhost:8000" -Method GET -TimeoutSec 5 -UseBasicParsing
    if ($response.StatusCode -eq 200) {
        Write-Host " [✓] Running" -ForegroundColor Green
    } else {
        Write-Host " [!] Unexpected response" -ForegroundColor Yellow
    }
} catch {
    Write-Host " [✗] Not running" -ForegroundColor Red
    Write-Host "    Start backend with: python Usersjoshusys-admin/backend/main.py" -ForegroundColor Yellow
}

# Test 5: Raspberry Pi (if configured)
if ($piUrl -and $piUrl -ne "") {
    Write-Host "5. Testing Raspberry Pi..." -NoNewline
    try {
        $response = Invoke-WebRequest -Uri "$piUrl" -Method GET -TimeoutSec 5 -UseBasicParsing
        if ($response.StatusCode -eq 200) {
            Write-Host " [✓] Connected" -ForegroundColor Green
        } else {
            Write-Host " [!] Unexpected response" -ForegroundColor Yellow
        }
    } catch {
        Write-Host " [✗] Failed: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host "    Pi services should be running automatically" -ForegroundColor Yellow
    }
} else {
    Write-Host "5. Raspberry Pi: " -NoNewline
    Write-Host "Auto-discovery enabled (Pi services run automatically)" -ForegroundColor Green
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Test Complete!" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Yellow
Write-Host "  1. If ngrok test failed, run: .\start-with-ngrok.ps1" -ForegroundColor Gray
Write-Host "  2. Start frontend: npm run dev" -ForegroundColor Gray
Write-Host "  3. Open: http://localhost:5173" -ForegroundColor Gray
Write-Host ""

Read-Host "Press Enter to exit"
