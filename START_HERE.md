# 🚀 START HERE - CommutAI Operator Quick Start

## TL;DR - Get Running in 3 Steps

```powershell
# 1. Test your setup
.\test-connections.ps1

# 2. Start all services
.\start-with-ngrok.ps1

# 3. Open browser
# http://localhost:5173
```

---

## What This Does

### Your Windows Machine Runs:
1. **Backend API** (FastAPI on port 8000)
2. **ngrok tunnel** (exposes backend to internet)
3. **Frontend** (React app on port 5173)

### Your Raspberry Pi Runs Automatically:
✅ Video streaming (port 5000)
✅ SMS API (port 8001)
✅ GPS tracking

**You don't need to do anything with the Pi!**

---

## Quick Setup

### Option 1: Automatic (Recommended)
```powershell
.\start-with-ngrok.ps1
```
This starts everything for you!

### Option 2: Manual
```powershell
# Terminal 1: Backend
cd Usersjoshusys-admin/backend
python main.py

# Terminal 2: ngrok
ngrok http http://localhost:8000 --url https://hertz-osmosis-squiggly.ngrok-free.dev

# Terminal 3: Frontend
npm run dev
```

---

## Access Your App

Once running, open your browser:

🌐 **Frontend**: http://localhost:5173
- Dashboard, live map, video monitoring, etc.

🔧 **Backend**: http://localhost:8000
- API documentation at /docs

🌍 **Public URL**: https://hertz-osmosis-squiggly.ngrok-free.dev
- Accessible from anywhere

---

## First Time Setup?

If this is your first time:

1. **Install dependencies**
   ```powershell
   npm install
   ```

2. **Check environment variables**
   - Open `.env` file
   - Should have `VITE_BACKEND_URL` set to ngrok URL

3. **Test connections**
   ```powershell
   .\test-connections.ps1
   ```

---

## Troubleshooting

### "Backend not responding"
```powershell
# Check if backend is running
curl http://localhost:8000

# If not, start it:
cd Usersjoshusys-admin/backend
python main.py
```

### "ngrok not working"
```powershell
# Start ngrok manually:
ngrok http http://localhost:8000 --url https://hertz-osmosis-squiggly.ngrok-free.dev
```

### "Raspberry Pi not found"
- Make sure Pi is powered on
- Pi should be on same network as your Windows machine
- Pi services run automatically (no action needed)

---

## What's Connected?

```
┌─────────────┐
│  Your PC    │
│             │
│  Frontend ──┼──┐
│  (Browser)  │  │
│             │  │
│  Backend ───┼──┼─► ngrok ──► Internet
│  (Python)   │  │
│             │  │
└─────────────┘  │
                 │
                 ├─► Supabase (Database)
                 │
                 └─► Raspberry Pi (Auto-discovered)
                     • Video streaming
                     • SMS handling
                     • GPS tracking
```

---

## Need More Help?

📖 **Read the docs:**
- [SETUP_SUMMARY.md](./SETUP_SUMMARY.md) - What was configured
- [QUICK_REFERENCE.md](./QUICK_REFERENCE.md) - Commands & URLs
- [DEPLOYMENT_CONFIG.md](./DEPLOYMENT_CONFIG.md) - Full deployment guide
- [ARCHITECTURE.md](./ARCHITECTURE.md) - How it all works

🧪 **Test your setup:**
```powershell
.\test-connections.ps1
```

---

## Deploy to Production (Vercel)

When you're ready to deploy:

1. Add environment variables in Vercel dashboard
2. Set `VITE_BACKEND_URL` to Cloudflare Worker URL
3. Deploy!

See [VERCEL_SETUP.md](./VERCEL_SETUP.md) for details.

---

## Important Notes

⚠️ **Raspberry Pi services are automatic**
- Don't try to start them on your Windows machine
- They run on the Pi itself via systemd
- Frontend auto-discovers the Pi

✅ **Only start on Windows:**
- Backend (FastAPI)
- ngrok (tunnel)
- Frontend (React)

🔒 **Security:**
- ngrok URL is public but requires authentication
- Pi services only accessible on local network
- Supabase handles user authentication

---

**Ready?** Run `.\start-with-ngrok.ps1` and you're good to go! 🎉
