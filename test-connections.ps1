# Test all service connections
# Run this to verify your configuration is working

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  CommutAI Connection Test" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$backendUrl = ""
$supabaseUrl = "https://iyacktzzktwrpeibcena.supabase.co"
$supabaseKey = ""
$piUrl = ""

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

    if ($envContent -match 'VITE_SUPABASE_URL=(.+)') {
        $supabaseUrl = $matches[1].Trim()
    }
    if ($envContent -match 'VITE_SUPABASE_ANON_KEY=(.+)') {
        $supabaseKey = $matches[1].Trim()
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
Write-Host "1. Testing Supabase Auth & API..." -NoNewline
try {
    $headers = @{}
    if ($supabaseKey) { $headers["apikey"] = $supabaseKey }
    $response = Invoke-WebRequest -Uri "$supabaseUrl/auth/v1/health" -Headers $headers -Method GET -TimeoutSec 10 -UseBasicParsing
    if ($response.StatusCode -eq 200) {
        Write-Host " [✓] Connected" -ForegroundColor Green
    } else {
        Write-Host " [!] Response status: $($response.StatusCode)" -ForegroundColor Yellow
    }
} catch {
    Write-Host " [✗] Failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 2: Backend API (Render deployment or configured URL)
Write-Host "2. Testing Backend API ($backendUrl)..." -NoNewline
if ($backendUrl) {
    try {
        $response = Invoke-WebRequest -Uri "$backendUrl/" -Method GET -TimeoutSec 15 -UseBasicParsing
        if ($response.StatusCode -eq 200) {
            Write-Host " [✓] Connected (HTTP 200)" -ForegroundColor Green
        } else {
            Write-Host " [!] Status: $($response.StatusCode)" -ForegroundColor Yellow
        }
    } catch {
        Write-Host " [✗] Failed: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host "    Note: Render free instances may take 30-50s to wake up if sleeping." -ForegroundColor Yellow
    }
} else {
    Write-Host " [!] Not configured in .env" -ForegroundColor Yellow
}

# Test 3: Backend Video WebSocket
Write-Host "3. Testing Backend WebSocket (/ws/video-feed)..." -NoNewline
if ($backendUrl) {
    $wsUrl = $backendUrl.Replace("http://", "ws://").Replace("https://", "wss://") + "/ws/video-feed"
    $wsCheck = node -e "
const ws = new WebSocket('$wsUrl');
const t = setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 8000);
ws.onopen = () => { ws.send(JSON.stringify({ type: 'ping' })); };
ws.onmessage = () => { clearTimeout(t); console.log('OK'); ws.close(); process.exit(0); };
ws.onerror = (e) => { clearTimeout(t); console.log('ERROR'); process.exit(1); };
" 2>$null
    if ($wsCheck -match "OK") {
        Write-Host " [✓] Connected & Ping/Pong Verified" -ForegroundColor Green
    } else {
        Write-Host " [!] WebSocket check returned: $wsCheck" -ForegroundColor Yellow
    }
} else {
    Write-Host " [!] Skipped (no backend URL)" -ForegroundColor Gray
}

# Test 4: Cloudflare Worker (alternative/fallback)
Write-Host "4. Testing Cloudflare Worker Tunnel..." -NoNewline
try {
    $response = Invoke-WebRequest -Uri "https://sys-admin.lopezkristine749.workers.dev" -Method GET -TimeoutSec 10 -UseBasicParsing
    if ($response.StatusCode -eq 200) {
        Write-Host " [✓] Connected" -ForegroundColor Green
    } else {
        Write-Host " [!] Unexpected response: $($response.StatusCode)" -ForegroundColor Yellow
    }
} catch {
    Write-Host " [✗] Offline / Unreachable" -ForegroundColor Gray
}

# Test 5: Local Windows Backend (if running locally)
Write-Host "5. Testing Local Windows Backend (localhost:8000)..." -NoNewline
try {
    $response = Invoke-WebRequest -Uri "http://localhost:8000" -Method GET -TimeoutSec 3 -UseBasicParsing
    if ($response.StatusCode -eq 200) {
        Write-Host " [✓] Running" -ForegroundColor Green
    } else {
        Write-Host " [!] Unexpected response" -ForegroundColor Yellow
    }
} catch {
    Write-Host " [-] Not running locally (using cloud Render backend)" -ForegroundColor Gray
}

# Test 6: Raspberry Pi Camera Stream & Cloudflare Tunnel
Write-Host "6. Testing Raspberry Pi Camera Stream..." -NoNewline
$piTest = node -e @"
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('$supabaseUrl', '$supabaseKey');
async function test() {
  const envUrl = '$piUrl'.trim();
  let liveUrl = null;
  if (envUrl) {
    try {
      const r = await fetch(envUrl + '/health', { signal: AbortSignal.timeout(2500) });
      if (r.ok) liveUrl = envUrl;
    } catch {}
  }
  if (!liveUrl) {
    try {
      const { data } = await supabase.from('pi_devices').select('backend_url').eq('bus_number', 1).maybeSingle();
      if (data?.backend_url) {
        const r = await fetch(data.backend_url + '/health', { signal: AbortSignal.timeout(3000) });
        if (r.ok) liveUrl = data.backend_url;
      }
    } catch {}
  }
  if (liveUrl) {
    console.log('OK ' + liveUrl);
  } else {
    console.log('FAIL');
  }
}
test();
"@ 2>$null

if ($piTest -match "OK (.+)") {
    $foundUrl = $matches[1].Trim()
    Write-Host " [✓] Live Camera Stream Found ($foundUrl)" -ForegroundColor Green
} else {
    Write-Host " [!] Pi offline or tunnel unreachable" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Test Complete!" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Frontend is configured to connect to:" -ForegroundColor Cyan
Write-Host "  Backend API:  $backendUrl" -ForegroundColor White
Write-Host "  Database:     $supabaseUrl" -ForegroundColor White
Write-Host ""
