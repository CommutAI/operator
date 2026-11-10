# Raspberry Pi Server Architecture

## What Runs on the Pi

The Raspberry Pi runs a **single FastAPI server** (`video_server_fastapi.py`) that provides multiple services:

### Single Server, Multiple Functions

**Port 5000** - FastAPI Server provides:
1. **Video Streaming** (WebSocket at `/ws`)
2. **Passenger Counting** (YOLOv8n AI detection)
3. **GPS Tracking** (via hardware integration)
4. **SMS Integration** (via GSM module)
5. **IP Auto-Registration** (registers itself in Supabase)

## Auto-Start Configuration

### Script: `start_server.sh`

Located at: `~/raspberry-pi-server/start_server.sh`

**What it does:**
1. Creates Python virtual environment if not exists
2. Installs all dependencies automatically
3. Creates `.env` file with configuration
4. Starts FastAPI server on port 5000

**How to use:**
```bash
cd ~/raspberry-pi-server
./start_server.sh
```

### Auto-Start on Boot (systemd)

The Pi likely has a systemd service that runs `start_server.sh` on boot:

```bash
# Check service status
sudo systemctl status video-server

# View logs
sudo journalctl -u video-server -f
```

## Server Configuration (from start_server.sh)

### Supabase Connection
```env
SUPABASE_URL=https://iyacktzzktwrpeibcena.supabase.co
SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Bus Configuration
```env
BUS_NUMBER=1
PORT=5000
```

### Camera Settings
```env
ENABLE_CAMERA=true
CAMERA_ID=0
CAMERA_WIDTH=640
CAMERA_HEIGHT=480
FPS=10
```

### AI Detection
```env
DISABLE_AI=false
COUNT_METHOD=yolo
MODEL_PATH=yolov8n.pt
CONFIDENCE_THRESHOLD=0.25
YOLO_CONFIDENCE_THRESHOLD=0.60
```

### Performance
```env
ENABLE_REALTIME_MODE=false
SKIP_DETECTION_FRAMES=2
FRAME_QUEUE_SIZE=5
DISABLE_DRAWING=false
DISABLE_DB_WRITES=false
```

## IP Auto-Discovery System

### How It Works

The Pi server has a built-in discovery system (`discover_backend_ip()` function):

1. **On Startup**: Pi gets its own local IP address
2. **Network Scan**: Scans local network (192.168.x.x) for Windows backend on port 8000
3. **Auto-Register**: Registers its own IP in Supabase `pi_devices` table
4. **Periodic Update**: Updates IP every 30 seconds

### Registration in Supabase

The Pi registers itself in the `pi_devices` table:
```sql
{
  "bus_number": 1,
  "ip_address": "192.168.1.54",
  "backend_url": "http://192.168.1.35:8000",  -- Auto-discovered Windows backend
  "last_seen": "2024-01-15T10:30:00Z",
  "status": "online"
}
```

### Frontend Discovery

The frontend (operator dashboard) discovers the Pi by:
1. **Database Lookup**: Queries `pi_devices` table in Supabase
2. **Gets Pi IP**: Retrieves the registered IP address
3. **Direct Connection**: Connects directly to Pi WebSocket at `ws://[pi_ip]:5000/ws`

## Communication Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    LOCAL NETWORK                             │
│                                                              │
│  ┌──────────────────┐         ┌─────────────────┐          │
│  │  Raspberry Pi    │         │  Windows PC     │          │
│  │  (Pi Server)     │         │                 │          │
│  │                  │         │  ┌───────────┐  │          │
│  │  Port 5000:      │◄────────┼──┤ Backend   │  │          │
│  │  • Video WS      │ Discover│  │ (8000)    │  │          │
│  │  • Passenger AI  │         │  └───────────┘  │          │
│  │  • GPS           │         │                 │          │
│  │  • SMS           │         │  ┌───────────┐  │          │
│  └────────┬─────────┘         │  │ Frontend  │  │          │
│           │                   │  │ (5173)    │  │          │
│           │                   │  └─────┬─────┘  │          │
│           │                   └────────┼────────┘          │
│           │                            │                    │
│           │                            │                    │
│           ├────────Register IP─────────┤                    │
│           │                            │                    │
│           ▼                            ▼                    │
│  ┌─────────────────────────────────────────────┐           │
│  │           Supabase Cloud                     │           │
│  │                                              │           │
│  │  pi_devices table:                          │           │
│  │  - bus_number: 1                            │           │
│  │  - ip_address: 192.168.1.54                 │           │
│  │  - backend_url: http://192.168.1.35:8000   │           │
│  │  - status: online                           │           │
│  └─────────────────────────────────────────────┘           │
│                                                              │
└─────────────────────────────────────────────────────────────┘

Connection Flow:
1. Pi discovers Windows backend (192.168.1.35:8000)
2. Pi registers its own IP (192.168.1.54) in Supabase
3. Frontend queries Supabase for Pi IP
4. Frontend connects directly to Pi WebSocket
```

## API Endpoints (Pi Server)

### WebSocket
- `ws://[pi-ip]:5000/ws` - Video streaming with passenger count

### HTTP Endpoints
- `GET /` - Server info and status
- `GET /health` - Health check
- `GET /hardware-status` - Hardware component status
- `GET /stream` - MJPEG video stream
- `GET /snapshot` - Single frame snapshot

## Hardware Integration

The Pi server integrates with:

1. **Camera** - USB camera (EMEET C60E 4K Webcam)
   - OpenCV capture
   - H.264 hardware encoding
   - Real-time streaming

2. **GPS Module** - Location tracking
   - Serial communication
   - NMEA protocol parsing
   - Continuous position updates

3. **GSM Module** - SMS functionality
   - SIM800L integration
   - Send/receive messages
   - Fare validation

4. **GPIO** - Hardware control
   - LED indicators
   - Button inputs
   - System status

## AI Detection Methods

The Pi supports multiple AI backends:

1. **YOLOv8n** (Default)
   - Local inference
   - CPU optimized
   - Good accuracy

2. **ONNX Runtime**
   - Optimized for ARM64
   - Faster inference

3. **TensorFlow Lite**
   - Mobile-optimized
   - Low power consumption

4. **Roboflow API**
   - Cloud-based detection
   - Requires internet

5. **OpenCV DNN**
   - Fallback option
   - No extra dependencies

## Performance Tuning

### Real-time Mode
```env
ENABLE_REALTIME_MODE=true
```
- Reduces latency
- Skips frames if needed
- Better for live monitoring

### Frame Skipping
```env
SKIP_DETECTION_FRAMES=2
```
- Run AI every N frames
- Saves CPU
- Good for slower Pi models

### Disable Features
```env
DISABLE_AI=true          # No passenger counting
DISABLE_DRAWING=true     # No bounding boxes
DISABLE_DB_WRITES=true   # No database updates
```

## Troubleshooting

### Check if Pi server is running
```bash
# On the Pi
curl http://localhost:5000

# From Windows
curl http://192.168.1.54:5000
```

### View Pi server logs
```bash
# If running as systemd service
sudo journalctl -u video-server -f

# If running manually
# Logs appear in terminal
```

### Restart Pi server
```bash
# If systemd service
sudo systemctl restart video-server

# If manual
# Press Ctrl+C to stop
./start_server.sh
```

### Check Pi IP registration
```sql
-- In Supabase SQL Editor
SELECT * FROM pi_devices WHERE bus_number = 1;
```

### Network connectivity
```bash
# Check if Pi can reach Windows backend
curl http://192.168.1.35:8000

# Check if Windows can reach Pi
ping 192.168.1.54
curl http://192.168.1.54:5000
```

## Key Differences from Windows Backend

| Feature | Raspberry Pi (5000) | Windows Backend (8000) |
|---------|---------------------|------------------------|
| **Purpose** | Edge computing on bus | Central API server |
| **Location** | On the bus | Office/cloud |
| **Services** | Video, GPS, SMS, AI | Analytics, reports |
| **Auto-start** | systemd service | Manual/scheduled |
| **Discovery** | Registers in DB | Scanned by Pi |
| **Access** | Local network | Via ngrok/Cloudflare |

## Summary

The Raspberry Pi is **self-contained** and **autonomous**:
- ✅ Starts automatically on boot
- ✅ Discovers and connects to backend
- ✅ Registers its IP in database
- ✅ Provides all edge services (video, GPS, SMS)
- ✅ No manual configuration needed
- ✅ Frontend auto-discovers it via database

**You only need to ensure:**
1. Pi is powered on
2. Pi is connected to same network as Windows PC
3. Pi server is running (automatic via systemd)
