# CommutAI Operator Dashboard

Modern web dashboard for CommutAI public transportation monitoring system.

## 🚀 Quick Start

### Local Development with ngrok

```bash
# Start all services at once (Windows backend + ngrok + frontend)
.\start-with-ngrok.ps1

# Or manually:
# 1. Start Windows backend
cd Usersjoshusys-admin/backend
python main.py

# 2. Start ngrok (in separate terminal)
ngrok http http://localhost:8000 --url https://hertz-osmosis-squiggly.ngrok-free.dev

# 3. Start frontend (in separate terminal)
npm run dev
```

**Note**: Raspberry Pi services run automatically on the Pi itself.

### Test Your Setup

```bash
.\test-connections.ps1
```

## 📋 Documentation

- **[DEPLOYMENT_CONFIG.md](./DEPLOYMENT_CONFIG.md)** - Complete deployment guide with tunnel configuration
- **[VERCEL_SETUP.md](./VERCEL_SETUP.md)** - Vercel deployment and environment variables setup

## 🔧 Configuration

Your operator connects to:

1. **Supabase** - Database (PostgreSQL + Auth)
2. **Windows Backend API** - FastAPI server (port 8000) via ngrok/Cloudflare
3. **Raspberry Pi** - Video streaming & GPS (runs automatically on Pi)

### Environment Variables

Create a `.env` file (already configured):

```env
# Supabase
VITE_SUPABASE_URL=https://iyacktzzktwrpeibcena.supabase.co
VITE_SUPABASE_ANON_KEY=your-key-here

# Backend API (ngrok tunnel or Cloudflare worker)
VITE_BACKEND_URL=https://hertz-osmosis-squiggly.ngrok-free.dev
# or: VITE_BACKEND_URL=https://sys-admin.lopezkristine749.workers.dev

# Raspberry Pi (leave empty for auto-discovery)
# Pi services run automatically on the Pi
VITE_RASPBERRY_PI_URL=

# SMS Server (optional)
VITE_SMS_SERVER_URL=http://localhost:3001
```

## 🌐 Deployment to Vercel

See **[VERCEL_SETUP.md](./VERCEL_SETUP.md)** for detailed instructions.

### Quick Deploy

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel
```

**Important:** Add environment variables in Vercel dashboard before deploying!

## 🔒 ngrok Configuration

Your ngrok is configured with:
- **URL**: `https://hertz-osmosis-squiggly.ngrok-free.dev`
- **Target**: `http://localhost:8000` (Windows FastAPI backend)
- **Auth Token**: Already configured

Start ngrok tunnel:
```bash
ngrok http http://localhost:8000 --url https://hertz-osmosis-squiggly.ngrok-free.dev
```

## 🤖 Raspberry Pi

The Raspberry Pi runs its services automatically:
- **Video Server**: Port 5000
- **SMS API**: Port 8001
- **GPS Tracking**: Automatic

Frontend auto-discovers the Pi on your local network.

## 📦 Scripts

- `start-with-ngrok.ps1` - Start all services (backend + ngrok + frontend)
- `test-connections.ps1` - Test all service connections
- `npm run dev` - Start frontend development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build

