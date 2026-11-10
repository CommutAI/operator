# CommutAI Operator - Deployment Configuration Guide

## Overview

Your operator frontend connects to three services:
1. **Supabase** - Database (already configured correctly)
2. **Backend API (FastAPI)** - Windows Python backend for analytics, SMS, etc. (port 8000)
3. **Raspberry Pi Server** - Runs independently on Pi (video streaming port 5000, SMS port 8001)

**Important**: The Raspberry Pi services run automatically on the Pi itself. You only need to start the Windows backend and expose it via ngrok.

## Current Tunnel Configuration

### ngrok Tunnel
- **URL**: `https://hertz-osmosis-squiggly.ngrok-free.dev`
- **Target**: `http://localhost:8000` (Windows FastAPI backend)
- **Auth Token**: `3LuKodl6DzfcNIvClQsWNQBI4KC_4pok55SE3nDUNHjxMhEx7`
- **Command**: 
  ```bash
  ngrok http http://localhost:8000 --url https://hertz-osmosis-squiggly.ngrok-free.dev
  ```

### Cloudflare Worker
- **URL**: `https://sys-admin.lopezkristine749.workers.dev`
- **Purpose**: Production-ready tunnel (alternative to ngrok)

## Configuration Steps

### 1. Update Environment Variables

Your `.env` file has been updated with:

```env
VITE_SUPABASE_URL=https://iyacktzzktwrpeibcena.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Backend API - Use ngrok tunnel or Cloudflare worker
VITE_BACKEND_URL=https://hertz-osmosis-squiggly.ngrok-free.dev

# Raspberry Pi URL (auto-discovered from database or manual)
VITE_RASPBERRY_PI_URL=

# SMS Server URL (if used separately)
VITE_SMS_SERVER_URL=http://localhost:3001
```

### 2. Start Your Backend with ngrok

**Option A: Using ngrok (for testing/development)**

1. Start your Windows FastAPI backend:
   ```bash
   cd Usersjoshusys-admin/backend
   python main.py
   ```
   This starts the backend on `http://localhost:8000`

2. In a separate terminal, start ngrok:
   ```bash
   ngrok http http://localhost:8000 --url https://hertz-osmosis-squiggly.ngrok-free.dev
   ```

**Note**: Raspberry Pi services run automatically on the Pi. You don't need to start them.

**Option B: Using Cloudflare Worker (for production)**

Update your `.env`:
```env
VITE_BACKEND_URL=https://sys-admin.lopezkristine749.workers.dev
```

### 3. Configure Backend to Accept External Connections

Update `Usersjoshusys-admin/backend/main.py` to allow CORS from your frontend:

```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",  # Local Vite dev server
        "https://your-vercel-app.vercel.app",  # Your Vercel deployment
        "*"  # For testing only - remove in production
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### 4. Deploy to Vercel

**Environment Variables to Add in Vercel:**

Go to your Vercel project settings → Environment Variables → Add:

```
VITE_SUPABASE_URL=https://iyacktzzktwrpeibcena.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml5YWNrdHp6a3R3cnBlaWJjZW5hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEwNzAxMzMsImV4cCI6MjEwNjY0NjEzM30.nnUW_wjKE9t6V_ZNNR1u_HqcqQletGEsJ4A2kcBLxl0

VITE_BACKEND_URL=https://sys-admin.lopezkristine749.workers.dev
# OR use ngrok URL (but ngrok URLs expire unless you have a paid plan)

VITE_RASPBERRY_PI_URL=
# Leave empty for auto-discovery

VITE_SMS_SERVER_URL=
# Leave empty unless using separate SMS server
```

**Important Notes for Vercel:**
- ✅ Use Cloudflare Worker URL for production (persistent)
- ❌ Avoid using ngrok URLs in Vercel (they expire when you restart ngrok)
- All environment variables MUST start with `VITE_` to be accessible in Vite builds

## Testing Your Configuration

### Test Backend Connection

1. Start your backend locally
2. Start ngrok tunnel
3. Test the tunnel:
   ```bash
   curl https://hertz-osmosis-squiggly.ngrok-free.dev/health
   ```

### Test Frontend Locally

```bash
# In the operator directory
npm run dev
```

Open http://localhost:5173 and check:
- Login should work (uses Supabase)
- Dashboard should load (uses Supabase)
- Video monitoring should connect to Pi (uses VITE_RASPBERRY_PI_URL or auto-discovery)

## Architecture Overview

```
┌─────────────────────┐
│   Operator Frontend │
│   (React + Vite)    │
│   localhost:5173    │
└──────────┬──────────┘
           │
           ├───────────────────────┬──────────────────────┐
           │                       │                      │
           ▼                       ▼                      ▼
┌──────────────────┐    ┌─────────────────┐   ┌──────────────────┐
│    Supabase      │    │  Backend API    │   │  Raspberry Pi    │
│    Database      │    │   (FastAPI)     │   │  (Auto-running)  │
│  (Postgres +     │    │  localhost:8000 │   │                  │
│   Auth + RLS)    │    └────────┬────────┘   │ • Video (5000)   │
└──────────────────┘             │            │ • SMS (8001)     │
                                 ▼            │ • GPS Tracking   │
                     ┌───────────────────────┐└──────────────────┘
                     │   ngrok / Cloudflare  │
                     │        Tunnel         │
                     │  (Public HTTPS URL)   │
                     └───────────────────────┘
                                 ▲
                                 │
                        ┌────────┴────────┐
                        │   Vercel App    │
                        │  (Production)   │
                        └─────────────────┘
```

**Key Points**:
- **Windows Backend**: Runs on your Windows machine (port 8000), exposed via ngrok
- **Raspberry Pi**: Runs its own services automatically, accessed directly by frontend
- **Frontend**: Accesses backend via ngrok/Cloudflare, Pi via auto-discovery

## Common Issues & Solutions

### Issue: "Failed to connect to backend"
**Solution**: Ensure ngrok is running and the URL matches `VITE_BACKEND_URL`

### Issue: "Raspberry Pi not found"
**Solution**: 
- Raspberry Pi services should be running automatically on the Pi
- Ensure Pi is on same network for auto-discovery
- Check Pi is powered on and connected to network
- Or manually set: `VITE_RASPBERRY_PI_URL=http://192.168.1.54:5000`

### Issue: "CORS errors in browser console"
**Solution**: Check backend CORS configuration allows your frontend origin

### Issue: "ngrok URL stops working"
**Solution**: 
- Free ngrok URLs change on restart
- Use `--url` flag to keep same URL (requires ngrok account)
- For production, use Cloudflare Worker instead

## Next Steps

1. ✅ Environment variables configured
2. ⏳ Start backend with ngrok tunnel
3. ⏳ Test locally
4. ⏳ Add Vercel environment variables
5. ⏳ Deploy to Vercel
6. ⏳ Test production deployment

## Resources

- [ngrok Documentation](https://ngrok.com/docs)
- [Cloudflare Workers](https://developers.cloudflare.com/workers/)
- [Vite Environment Variables](https://vitejs.dev/guide/env-and-mode.html)
- [Vercel Environment Variables](https://vercel.com/docs/environment-variables)
