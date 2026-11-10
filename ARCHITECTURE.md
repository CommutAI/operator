# CommutAI Operator - System Architecture

## System Overview

CommutAI Operator is a distributed system with three main components:

1. **Windows Backend** - Central API server (FastAPI)
2. **Raspberry Pi** - Edge device on bus (video, GPS, SMS)
3. **React Frontend** - Web dashboard (operator interface)

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         INTERNET                                 │
│                                                                  │
│  ┌────────────────┐              ┌────────────────┐            │
│  │   Supabase     │              │  Cloudflare    │            │
│  │   Database     │              │    Worker      │            │
│  │                │              │  (Production)  │            │
│  │ • PostgreSQL   │              └────────┬───────┘            │
│  │ • Auth         │                       │                     │
│  │ • RLS          │                       │                     │
│  └────────┬───────┘                       │                     │
│           │                               │                     │
└───────────┼───────────────────────────────┼─────────────────────┘
            │                               │
            │                               │
┌───────────┼───────────────────────────────┼─────────────────────┐
│  LOCAL NETWORK (192.168.x.x)              │                     │
│           │                               │                     │
│           │         ┌─────────────────────▼──────┐              │
│           │         │     ngrok Tunnel           │              │
│           │         │ (Development/Testing)      │              │
│           │         │                            │              │
│           │         │ hertz-osmosis-squiggly    │              │
│           │         │ .ngrok-free.dev           │              │
│           │         └─────────────┬──────────────┘              │
│           │                       │                             │
│  ┌────────▼───────────────────────▼────────────────┐            │
│  │          Windows Machine                        │            │
│  │                                                  │            │
│  │  ┌────────────────────────────────────────┐    │            │
│  │  │  FastAPI Backend (Port 8000)           │    │            │
│  │  │                                         │    │            │
│  │  │  • Analytics API                        │    │            │
│  │  │  • Reports Generation                   │    │            │
│  │  │  • Card Management                      │    │            │
│  │  │  • Trip Aggregation                     │    │            │
│  │  │  • Emergency Alerts                     │    │            │
│  │  │  • SMS Coordination                     │    │            │
│  │  └────────────────────────────────────────┘    │            │
│  │                                                  │            │
│  │  ┌────────────────────────────────────────┐    │            │
│  │  │  React Frontend (Port 5173)            │    │            │
│  │  │  Vite Dev Server                       │    │            │
│  │  │                                         │    │            │
│  │  │  • Dashboard                            │    │            │
│  │  │  • Live Map                             │    │            │
│  │  │  • Video Monitoring                     │    │            │
│  │  │  • Trip Management                      │    │            │
│  │  │  • Reports                              │    │            │
│  │  │  • Transactions                         │    │            │
│  │  └────────────────────────────────────────┘    │            │
│  └──────────────────────────────────────────────────┘            │
│                                                                  │
│  ┌──────────────────────────────────────────────────┐            │
│  │          Raspberry Pi (On Bus)                   │            │
│  │          IP: 192.168.1.54 (auto-discovered)      │            │
│  │                                                   │            │
│  │  ┌────────────────────────────────────────┐     │            │
│  │  │  Video Server (Port 5000)              │     │            │
│  │  │  • Camera streaming                     │     │            │
│  │  │  • YOLOv8n detection                    │     │            │
│  │  │  • Passenger counting                   │     │            │
│  │  │  • WebSocket streaming                  │     │            │
│  │  └────────────────────────────────────────┘     │            │
│  │                                                   │            │
│  │  ┌────────────────────────────────────────┐     │            │
│  │  │  SMS API Server (Port 8001)            │     │            │
│  │  │  • GSM module integration               │     │            │
│  │  │  • Send/receive SMS                     │     │            │
│  │  │  • SMS validation                       │     │            │
│  │  └────────────────────────────────────────┘     │            │
│  │                                                   │            │
│  │  ┌────────────────────────────────────────┐     │            │
│  │  │  GPS Tracker                            │     │            │
│  │  │  • Real-time location                   │     │            │
│  │  │  • Route tracking                       │     │            │
│  │  │  • Speed monitoring                     │     │            │
│  │  └────────────────────────────────────────┘     │            │
│  │                                                   │            │
│  │  Services run automatically via systemd          │            │
│  │  Auto-registers IP in Supabase on startup        │            │
│  └──────────────────────────────────────────────────┘            │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

## Component Details

### 1. Windows Backend (FastAPI - Port 8000)

**Purpose**: Central API server for business logic and data processing

**Responsibilities**:
- Analytics and reporting
- Card transaction management
- Trip data aggregation
- Emergency alert handling
- SMS coordination
- User authentication coordination

**Access**:
- Development: `http://localhost:8000`
- Via ngrok: `https://hertz-osmosis-squiggly.ngrok-free.dev`
- Production: `https://sys-admin.lopezkristine749.workers.dev`

**Key Endpoints**:
- `/api/analytics/*` - Dashboard statistics
- `/api/reports/*` - Report generation
- `/api/transactions/*` - Card transactions
- `/api/trips/*` - Trip management
- `/api/emergency-alerts/*` - Alert handling

### 2. Raspberry Pi (Single FastAPI Server - Port 5000)

**Purpose**: Edge computing on the bus - all real-time monitoring

⚠️ **Important**: The Pi runs a **single FastAPI server** that provides ALL services, not separate services on different ports.

**Single Server Endpoints** (all on port 5000):
- `ws://[pi-ip]:5000/ws` - WebSocket video streaming
- `GET /` - Server status
- `GET /health` - Health check
- `GET /stream` - MJPEG video stream
- `GET /snapshot` - Camera snapshot
- `GET /hardware-status` - Hardware info

**Integrated Functions**:
1. **Video Streaming** - USB camera via OpenCV
2. **AI Detection** - YOLOv8n passenger counting
3. **GPS Tracking** - Hardware GPS module integration
4. **SMS Handling** - GSM module (SIM800L) integration
5. **IP Registration** - Auto-registers in Supabase

**Auto-Start Configuration**:
- Script: `~/raspberry-pi-server/start_server.sh`
- Service: systemd `video-server.service`
- Auto-discovers Windows backend
- Registers IP in Supabase `pi_devices` table
- Updates status every 30 seconds

**Network Discovery**:
- Pi scans local network for Windows backend (port 8000)
- Registers its own IP in Supabase on startup
- Frontend auto-discovers Pi via database lookup
- Fallback to network scanning if database lookup fails

### 3. React Frontend (Vite - Port 5173)

**Purpose**: Operator dashboard and monitoring interface

**Pages**:
- **Dashboard**: Overview statistics and alerts
- **Live Map**: Real-time bus tracking
- **Video Monitoring**: Live camera feeds
- **Trip Management**: View and manage trips
- **Transactions**: Card payment history
- **Reports**: Generate various reports
- **AI Monitoring**: Passenger counting analytics

**Data Sources**:
- Supabase: Database queries, real-time subscriptions
- Windows Backend: Analytics, reports, aggregated data
- Raspberry Pi: Direct video stream, real-time GPS

**Deployment**:
- Development: Vite dev server (localhost:5173)
- Production: Vercel static hosting

### 4. Supabase

**Purpose**: Cloud database and authentication

**Features**:
- PostgreSQL database
- Row Level Security (RLS)
- Real-time subscriptions
- Authentication (Auth)
- File storage

**Tables**:
- `buses` - Bus fleet information
- `trips` - Trip records
- `transactions` - Card transactions
- `gps_locations` - GPS tracking data
- `passenger_counts` - Passenger analytics
- `emergency_alerts` - Emergency notifications
- `fare_irregularities` - Fraud detection
- `qr_cards` - Card management
- `staff_users` - Operator accounts
- `pi_devices` - Raspberry Pi registry

## Data Flow

### 1. Trip Monitoring Flow

```
Raspberry Pi → Supabase → Frontend
    ↓
GPS Location → `gps_locations` table → Live Map
Video Stream → WebSocket → Video Monitoring
Passenger Count → `passenger_counts` → Dashboard
```

### 2. Card Transaction Flow

```
SMS to Pi → GSM Module → SMS API (8001)
    ↓
Parse SMS → Windows Backend (8000) → Supabase
    ↓
`transactions` table → Frontend → Transaction Page
```

### 3. Emergency Alert Flow

```
Driver Action → Pi → Supabase `emergency_alerts`
    ↓
Real-time Subscription → Frontend
    ↓
Dashboard Alert → Operator Acknowledgment
```

### 4. Video Analysis Flow

```
Camera → Pi Video Server → YOLOv8n Detection
    ↓
Passenger Count → Supabase `passenger_counts`
    ↓
WebSocket Stream → Frontend Video Monitoring
```

## Network Configuration

### Local Development

| Service | Host | Port | Protocol |
|---------|------|------|----------|
| Windows Backend | localhost | 8000 | HTTP |
| Frontend Dev | localhost | 5173 | HTTP |
| Pi Video Server | 192.168.1.54 | 5000 | HTTP/WS |
| Pi SMS API | 192.168.1.54 | 8001 | HTTP |
| ngrok Tunnel | - | - | HTTPS |

### Production

| Service | URL | Protocol |
|---------|-----|----------|
| Frontend | your-app.vercel.app | HTTPS |
| Backend | sys-admin.lopezkristine749.workers.dev | HTTPS |
| Supabase | iyacktzzktwrpeibcena.supabase.co | HTTPS |
| Pi Services | Auto-discovered on LAN | HTTP/WS |

## Security Considerations

### 1. Authentication
- Supabase Auth for user authentication
- JWT tokens for API authorization
- Row Level Security in database

### 2. Network Security
- Pi services only on local network
- Backend exposed via secure tunnel (ngrok/Cloudflare)
- CORS configured for frontend origins

### 3. Data Privacy
- Sensitive data encrypted in transit (HTTPS)
- Database connections use SSL
- Environment variables for secrets

## Scalability Notes

### Current Setup (Single Bus)
- 1 Raspberry Pi per bus
- 1 Windows backend server
- Supabase handles multiple concurrent users

### Multi-Bus Scaling
- Each bus has its own Pi
- Pi devices auto-register in `pi_devices` table
- Frontend selects bus from registered devices
- Backend scales horizontally as needed

## Deployment Checklist

### Windows Backend
- [ ] Python dependencies installed
- [ ] Environment variables configured
- [ ] Backend running on port 8000
- [ ] ngrok tunnel active (dev) or Cloudflare Worker configured (prod)

### Raspberry Pi
- [ ] Services configured via systemd
- [ ] Auto-start enabled
- [ ] Network connectivity verified
- [ ] IP registered in Supabase

### Frontend
- [ ] Dependencies installed (`npm install`)
- [ ] Environment variables set
- [ ] Development server runs (`npm run dev`)
- [ ] Production build works (`npm run build`)
- [ ] Vercel environment variables configured (prod)

### Database
- [ ] Supabase project created
- [ ] Tables migrated
- [ ] RLS policies configured
- [ ] Authentication enabled
