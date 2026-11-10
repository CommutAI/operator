# ✅ CORRECTED Architecture - Final Understanding

After reviewing the actual Pi code, here's the **correct** architecture:

## The Real Setup

### Raspberry Pi: ONE FastAPI Server

❌ **WRONG**: "Pi has separate services on ports 5000 and 8001"

✅ **CORRECT**: Pi runs a **single FastAPI server** on **port 5000** that provides ALL services:
- Video streaming (WebSocket)
- AI passenger detection (YOLOv8n)  
- GPS tracking (hardware integration)
- SMS handling (GSM module integration)
- IP auto-registration (Supabase)

**File**: `~/raspberry-pi-server/video_server_fastapi.py`
**Port**: 5000 (only one port!)
**Auto-start**: `./start_server.sh` via systemd

### Windows Backend: Separate FastAPI Server

**File**: `Usersjoshusys-admin/backend/main.py`
**Port**: 8000
**Purpose**: Central API for analytics, reports, transactions
**Access**: Via ngrok tunnel for development

### Architecture Diagram (CORRECT)

```
Windows PC (192.168.1.35)                 Raspberry Pi (192.168.1.54)
┌─────────────────────┐                   ┌──────────────────────────┐
│                     │                   │                          │
│  Backend (8000)     │◄──────discovers───┤  Pi Server (5000)        │
│  • Analytics        │                   │                          │
│  • Reports          │                   │  • Video streaming (/ws) │
│  • Transactions     │                   │  • AI detection          │
│                     │                   │  • GPS tracking          │
│  Frontend (5173)    │                   │  • SMS via GSM           │
│  • Dashboard        ├──────connects─────┤  • IP registration       │
│  • Video monitor    │    (via WS)       │                          │
│                     │                   │  ALL in ONE FastAPI app! │
└──────────┬──────────┘                   └──────────────────────────┘
           │                                         │
           │                                         │
           └─────────────Supabase───────────────────┘
                    (pi_devices table)
```

## What Actually Happens

### On Pi Startup:

1. **systemd starts**: `video-server.service`
2. **Runs script**: `./start_server.sh`
3. **Script does**:
   - Creates Python venv
   - Installs dependencies (FastAPI, OpenCV, YOLO, etc.)
   - Creates `.env` with configuration
   - Starts: `uvicorn video_server_fastapi:app --host 0.0.0.0 --port 5000`

4. **Server starts**:
   - Discovers Windows backend (scans for port 8000 on network)
   - Registers own IP in Supabase `pi_devices` table
   - Starts camera and GPS hardware
   - Initializes GSM module for SMS
   - Opens WebSocket endpoint `/ws`

5. **Periodic updates**: Updates IP/status every 30 seconds

### On Frontend Connection:

1. **Frontend queries Supabase**: `SELECT * FROM pi_devices WHERE bus_number = 1`
2. **Gets Pi IP**: `192.168.1.54`
3. **Connects WebSocket**: `ws://192.168.1.54:5000/ws`
4. **Receives**:
   - Video frames (base64 encoded JPEG)
   - Passenger count from AI
   - GPS coordinates

## Port Summary

| Component | Port | What Runs | Where |
|-----------|------|-----------|-------|
| **Pi Server** | 5000 | Single FastAPI (video + GPS + SMS + AI) | Raspberry Pi |
| **Windows Backend** | 8000 | FastAPI (analytics, reports) | Windows PC |
| **Frontend Dev** | 5173 | Vite React app | Windows PC |

## Key Corrections Made

### In Documentation:
- ✅ Updated to show Pi runs single server on port 5000
- ✅ Removed references to separate SMS API on port 8001
- ✅ Clarified GPS and SMS are integrated in main Pi server
- ✅ Added details about `start_server.sh` auto-configuration

### In Scripts:
- ✅ Updated comments to reflect correct architecture
- ✅ Clarified that Pi services are ONE server, not multiple
- ✅ Updated test scripts to check port 5000 only

### Environment Variables:
- ✅ `VITE_BACKEND_URL` → Windows backend (8000)
- ✅ `VITE_RASPBERRY_PI_URL` → Pi server (5000) - auto-discovered
- ❌ No `VITE_SMS_SERVER_URL` needed (SMS is part of Pi server)

## Communication Flow (CORRECT)

### Video Streaming:
```
Pi Camera → OpenCV Capture → YOLOv8n Detection
    ↓
Base64 Encode → WebSocket (/ws:5000) → Frontend
    ↓
Passenger Count → Supabase → Dashboard
```

### GPS Tracking:
```
GPS Hardware → Serial Port → Pi Server (5000)
    ↓
Parse NMEA → Supabase gps_locations → Live Map
```

### SMS Handling:
```
GSM Module (SIM800L) → Serial Port → Pi Server (5000)
    ↓
Parse SMS → Validate Fare → Supabase transactions
```

### IP Registration:
```
Pi Startup → Discover own IP → Register in Supabase
    ↓
Frontend → Query pi_devices → Connect to Pi
```

## Files on Raspberry Pi

```
~/raspberry-pi-server/
├── video_server_fastapi.py    # Main FastAPI server (ALL services)
├── start_server.sh             # Auto-setup and start script
├── start_server_venv.sh        # Simple venv start
├── hardware_integration.py     # GPS + GSM + GPIO classes
├── .env                        # Auto-created configuration
├── venv/                       # Python virtual environment
└── yolov8n.pt                  # AI model weights
```

## Why This Matters

### For Development:
- You only need to check **one Pi port** (5000)
- Video, GPS, and SMS all come from **same endpoint**
- Simpler troubleshooting (one service to debug)

### For Deployment:
- Pi is **truly autonomous** (one service to manage)
- systemd manages **one service** (video-server)
- Logs are in **one place** (journalctl -u video-server)

### For Scaling:
- Add more buses = add more Pis (each runs same single server)
- Each Pi auto-registers independently
- No need to configure multiple services per Pi

## Troubleshooting (CORRECTED)

### Check Pi Server Status:
```bash
# On the Pi
sudo systemctl status video-server
curl http://localhost:5000

# From Windows
curl http://192.168.1.54:5000
```

### View Pi Logs:
```bash
# All logs from single service
sudo journalctl -u video-server -f
```

### Restart Pi Server:
```bash
# Restart single service
sudo systemctl restart video-server
```

### Test WebSocket:
```bash
# Connect to single WebSocket endpoint
wscat -c ws://192.168.1.54:5000/ws
```

## Summary

🎯 **Key Takeaway**: The Raspberry Pi is much simpler than initially documented. It's just **one FastAPI application** that integrates all hardware (camera, GPS, GSM) and provides all services through a **single port** (5000).

This makes it:
- ✅ Easier to deploy (one systemd service)
- ✅ Easier to debug (one set of logs)
- ✅ Easier to scale (replicate one server per bus)
- ✅ More reliable (fewer moving parts)

All previous documentation has been updated to reflect this correct architecture. See:
- [PI_ARCHITECTURE.md](./PI_ARCHITECTURE.md) - Detailed Pi server architecture
- [ARCHITECTURE.md](./ARCHITECTURE.md) - Full system architecture
- [QUICK_REFERENCE.md](./QUICK_REFERENCE.md) - Updated quick reference
