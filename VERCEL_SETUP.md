# Vercel Deployment Setup

## Quick Setup for Vercel

### 1. Install Vercel CLI (Optional)
```bash
npm install -g vercel
```

### 2. Login to Vercel
```bash
vercel login
```

### 3. Deploy Your Project
```bash
# In the operator directory
vercel
```

## Environment Variables for Vercel

Add these in your Vercel dashboard:
**Project Settings → Environment Variables**

### Required Variables

| Variable Name | Value | Environment |
|--------------|-------|-------------|
| `VITE_SUPABASE_URL` | `https://iyacktzzktwrpeibcena.supabase.co` | Production, Preview, Development |
| `VITE_SUPABASE_ANON_KEY` | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml5YWNrdHp6a3R3cnBlaWJjZW5hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEwNzAxMzMsImV4cCI6MjEwNjY0NjEzM30.nnUW_wjKE9t6V_ZNNR1u_HqcqQletGEsJ4A2kcBLxl0` | Production, Preview, Development |
| `VITE_BACKEND_URL` | `https://sys-admin.lopezkristine749.workers.dev` | Production |
| `VITE_BACKEND_URL` | `https://hertz-osmosis-squiggly.ngrok-free.dev` | Preview, Development (optional) |
| `VITE_RASPBERRY_PI_URL` | *(leave empty)* | All environments |
| `VITE_SMS_SERVER_URL` | *(leave empty)* | All environments |

### Step-by-Step in Vercel Dashboard

1. Go to https://vercel.com/dashboard
2. Select your project
3. Click **Settings** tab
4. Click **Environment Variables** in the sidebar
5. Add each variable above:
   - Click **Add New**
   - Enter **Key** (variable name)
   - Enter **Value**
   - Select environments: **Production**, **Preview**, and **Development**
   - Click **Save**

## Important Notes

### Why use Cloudflare Worker URL?

✅ **For Production (Vercel):**
- Use `https://sys-admin.lopezkristine749.workers.dev`
- Cloudflare Worker URLs are persistent
- No expiration issues
- Better for production deployments

❌ **Avoid ngrok URLs in Production:**
- ngrok free URLs expire when you restart ngrok
- ngrok URLs change unless you have a paid plan with reserved domains
- Only use ngrok for local development/testing

### Backend URL Options

**Option 1: Cloudflare Worker (Recommended for Production)**
```env
VITE_BACKEND_URL=https://sys-admin.lopezkristine749.workers.dev
```

**Option 2: ngrok (For Development/Testing Only)**
```env
VITE_BACKEND_URL=https://hertz-osmosis-squiggly.ngrok-free.dev
```

**Option 3: Deploy Backend to Cloud**
- Deploy FastAPI backend to: Railway, Render, DigitalOcean, etc.
- Then use that URL as `VITE_BACKEND_URL`

## Vercel Build Configuration

### vercel.json (Optional)

Create a `vercel.json` file if you need custom build settings:

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "devCommand": "npm run dev",
  "installCommand": "npm install",
  "framework": "vite",
  "regions": ["sin1"]
}
```

### Build & Development Settings

In Vercel dashboard → Project Settings → General:

- **Framework Preset**: Vite
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Install Command**: `npm install`
- **Development Command**: `npm run dev`

## Testing Your Deployment

### After Deployment

1. Open your Vercel deployment URL
2. Check browser console for errors
3. Test login functionality
4. Verify backend API connectivity

### Common Issues

#### CORS Errors
**Solution**: Update backend CORS to allow Vercel domain

```python
# In backend/main.py
allow_origins=[
    "https://your-app.vercel.app",
    "https://your-app-*.vercel.app",  # Preview deployments
]
```

#### Environment Variables Not Working
**Symptoms**: `import.meta.env.VITE_BACKEND_URL` is undefined

**Solutions**:
1. Ensure variable names start with `VITE_`
2. Redeploy after adding environment variables
3. Check that variables are set for correct environment (Production/Preview/Development)

#### Backend Not Reachable
**Symptoms**: "Failed to fetch" errors

**Solutions**:
1. Verify backend is running and accessible
2. Test backend URL directly: `curl https://your-backend-url/health`
3. Check backend CORS configuration
4. Ensure ngrok tunnel is active (if using ngrok)

## Production Checklist

- [ ] All environment variables added to Vercel
- [ ] Backend CORS configured for Vercel domain
- [ ] Backend deployed or tunnel active
- [ ] Test login functionality
- [ ] Test API connectivity
- [ ] Check browser console for errors
- [ ] Test on mobile devices
- [ ] Monitor Vercel deployment logs

## Monitoring

### Vercel Logs

View real-time logs in Vercel dashboard:
1. Go to your project
2. Click **Deployments** tab
3. Click on a deployment
4. Click **Functions** or **Runtime Logs**

### Backend Logs

Monitor your backend separately:
- **ngrok**: Check ngrok web interface at http://127.0.0.1:4040
- **Cloudflare Worker**: Check Cloudflare Workers dashboard
- **Cloud deployment**: Check hosting provider's logs

## Need Help?

- [Vercel Documentation](https://vercel.com/docs)
- [Vite Environment Variables](https://vitejs.dev/guide/env-and-mode.html)
- [Supabase Documentation](https://supabase.com/docs)
- [ngrok Documentation](https://ngrok.com/docs)
