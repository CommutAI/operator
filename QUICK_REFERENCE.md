# CommutAI Operator - Quick Reference Card

## 🎯 URLs & Endpoints

| Service | URL | Purpose |
|---------|-----|---------|
| **Supabase** | `https://iyacktzzktwrpeibcena.supabase.co` | Database & Auth |
| **ngrok Tunnel** | `https://hertz-osmosis-squiggly.ngrok-free.dev` | Windows Backend API (dev/test) |
| **Cloudflare Worker** | `https://sys-admin.lopezkristine749.workers.dev` | Windows Backend API (production) |
| **Local Backend** | `http://localhost:8000` | Windows FastAPI backend |
| **Local Frontend** | `http://localhost:5173` | Vite dev server |
| **Raspberry Pi** | Auto-discovered | Single FastAPI server (5000) with video, GPS, SMS |

## 🚀 Quick Commands

### Start Everything
```powershell
.\start-with-ngrok.ps1
```

### Test Connections
```powershell
.\test-connections.ps1
```

### Start Individually
```bash
# Windows Backend
cd Usersjoshusys-admin/backend && python main.py

# ngrok (expose Windows backend)
ngrok http http://localhost:8000 --url https://hertz-osmosis-squiggly.ngrok-free.dev

# Frontend
npm run dev
```

**Note**: Raspberry Pi services run automatically on the Pi (no manual start needed)

### Build & Deploy
```bash
# Build for production
npm run build

# Deploy to Vercel
vercel
```

## 🔑 Environment Variables

### Local (.env file)
```env
VITE_SUPABASE_URL=https://iyacktzzktwrpeibcena.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
VITE_BACKEND_URL=https://hertz-osmosis-squiggly.ngrok-free.dev
VITE_RASPBERRY_PI_URL=
VITE_SMS_SERVER_URL=http://localhost:3001
```

### Vercel (Production)
```env
VITE_SUPABASE_URL=https://iyacktzzktwrpeibcena.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
VITE_BACKEND_URL=https://sys-admin.lopezkristine749.workers.dev
VITE_RASPBERRY_PI_URL=
VITE_SMS_SERVER_URL=
```

## 🔧 ngrok Commands

### Configure Auth Token
```bash
ngrok config add-authtoken 3LuKodl6DzfcNIvClQsWNQBI4KC_4pok55SE3nDUNHjxMhEx7
```

### Start Tunnel
```bash
# With reserved URL (Windows backend on port 8000)
ngrok http http://localhost:8000 --url https://hertz-osmosis-squiggly.ngrok-free.dev

# Without reserved URL (changes on restart)
ngrok http 8000
```

### View ngrok Dashboard
Open browser: http://127.0.0.1:4040

## 🐛 Troubleshooting

### Backend Not Connecting
```powershell
# Check if Windows backend is running
curl http://localhost:8000

# Check ngrok tunnel
curl https://hertz-osmosis-squiggly.ngrok-free.dev
```

### CORS Errors
Update `Usersjoshusys-admin/backend/main.py`:
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "https://your-vercel-app.vercel.app"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### ngrok URL Expired
Restart ngrok with the same URL:
```bash
ngrok http http://localhost:8000 --url https://hertz-osmosis-squiggly.ngrok-free.dev
```

### Raspberry Pi Not Found
- Ensure Pi is powered on and connected to network
- Pi services run automatically (video server, SMS, GPS)
- Check Pi is on same network as your Windows machine
- Verify Pi services: SSH to Pi and check `systemctl status`

### Environment Variables Not Working
1. Ensure they start with `VITE_`
2. Restart dev server after changing .env
3. In Vercel, redeploy after adding variables

## 📁 Project Structure

```
operator/
├── src/
│   ├── components/     # React components
│   ├── pages/          # Page components
│   ├── hooks/          # Custom hooks
│   ├── services/       # API services
│   ├── contexts/       # React contexts
│   └── lib/            # Supabase client
├── public/             # Static assets
├── .env                # Environment variables (local)
├── .env.example        # Environment template
├── DEPLOYMENT_CONFIG.md    # Full deployment guide
├── VERCEL_SETUP.md        # Vercel setup guide
├── start-with-ngrok.ps1   # Start all services
└── test-connections.ps1   # Test connections
```

## 🌐 Vercel Deployment Steps

1. Add environment variables in Vercel dashboard
2. Connect GitHub repository
3. Configure build settings:
   - Framework: Vite
   - Build Command: `npm run build`
   - Output Directory: `dist`
4. Deploy!

## 📞 Support Resources

- **ngrok Docs**: https://ngrok.com/docs
- **Cloudflare Workers**: https://developers.cloudflare.com/workers/
- **Vite Docs**: https://vitejs.dev/
- **Vercel Docs**: https://vercel.com/docs
- **Supabase Docs**: https://supabase.com/docs

## ✅ Pre-Deployment Checklist

- [ ] Environment variables configured in .env
- [ ] Backend running locally
- [ ] ngrok tunnel active
- [ ] Frontend runs without errors
- [ ] All pages load correctly
- [ ] Login/logout works
- [ ] Environment variables added to Vercel
- [ ] Backend CORS configured for Vercel domain
- [ ] Production backend URL set (Cloudflare Worker)

## 🎨 Development vs Production

| Aspect | Development | Production |
|--------|-------------|------------|
| **Backend URL** | ngrok tunnel (port 8000) | Cloudflare Worker |
| **Frontend** | localhost:5173 | Vercel |
| **Environment** | .env file | Vercel dashboard |
| **Database** | Supabase (same) | Supabase (same) |
| **Pi Connection** | Auto-discover (local network) | Auto-discover (registers IP) |
| **Pi Services** | Running on Pi automatically | Running on Pi automatically |
