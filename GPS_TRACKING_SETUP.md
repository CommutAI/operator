# GPS Tracking Setup & Fix

## Problem Identified
The LiveMap was showing **fallback coordinates** (`8.429, 124.762`) instead of the real GPS data from your database (`8.41245600, 124.81650700`).

**Root Cause:** The LiveMap component was designed to only show GPS when there were active trips with `status = 'in_progress'`. Since your GPS data has `trip_id = null`, it wasn't being displayed properly.

## What Was Fixed

### 1. **LiveMap Component** (`src/pages/LiveMap.tsx`)
✅ **Always displays GPS data** from the database, even without active trips
✅ **Prioritizes real GPS coordinates** over fallback values
✅ **Added green pulsing marker** for live GPS location
✅ **Shows GPS status card** with coordinates and last update time
✅ **Better visual distinction** for GPS markers vs bus markers
✅ **Added console logging** to help debug GPS data flow

### 2. **Backend GPS Endpoint** (New: `Usersjoshusys-admin/backend/routers/gps.py`)
✅ Created `/api/gps/location` endpoint to receive GPS data from hardware
✅ Validates coordinates (latitude: -90 to 90, longitude: -180 to 180)
✅ Stores GPS data in `gps_locations` table
✅ Automatically updates trip location if `trip_id` is provided
✅ Supports standalone GPS data (without trip_id)

### 3. **Raspberry Pi GPS Sender** (New: `pi-gps-sender.py`)
✅ Reads GPS data from serial port (NMEA sentences)
✅ Parses GPGGA and GPRMC sentences
✅ Sends GPS to backend API every 5 seconds
✅ Auto-detects active trips
✅ Includes GPS simulator for testing without hardware

## Current GPS Data in Database

Your database contains:
```sql
INSERT INTO gps_locations VALUES (
  id: '8d21337b-1a22-43c4-93dd-dcb774b8c7bd',
  latitude: 8.41245600,
  longitude: 124.81650700,
  altitude: 449.40,
  speed: 0.00,
  accuracy: 10.00,
  source: 'gps',
  trip_id: null,
  satellite_count: 5,
  fix_quality: 1,
  recorded_at: '2026-11-12 06:28:41'
);
```

**Location:** Near Manolo Fortich, Bukidnon, Philippines
📍 [View on Google Maps](https://www.google.com/maps?q=8.41245600,124.81650700)

## Testing the Fix

### Option 1: Visual Test (Recommended)
1. Start your frontend: `npm run dev`
2. Navigate to the **Live Map** page
3. You should see:
   - ✅ Map centered on `8.412456, 124.816507`
   - ✅ Green pulsing marker at that location
   - ✅ "Live GPS Active" status card in sidebar
   - ✅ GPS coordinates displayed in header

### Option 2: Browser Console Test
1. Open DevTools (F12)
2. Go to Live Map page
3. Check console logs:
   ```
   [LiveMap] GPS rows fetched: 1
   [LiveMap] Latest GPS row: {latitude: "8.41245600", longitude: "124.81650700", ...}
   [LiveMap] latestGpsAny: {lat: 8.412456, lng: 124.816507, ...}
   [LiveMap] Added GPS pin at: 8.412456 124.816507
   [LiveMap] Map center: [8.412456, 124.816507]
   ```

### Option 3: HTML Test Page
1. Open `test-gps-fetch.html` in browser
2. Enter your Supabase URL and Anon Key
3. Click "Fetch GPS Data"
4. Verify coordinates match: `8.41245600, 124.81650700`

## How GPS Data Flows

```
┌─────────────────────┐
│   GPS Hardware      │  (Serial port on Raspberry Pi)
│   /dev/serial0      │
└──────────┬──────────┘
           │
           │ NMEA Sentences
           │ (GPGGA, GPRMC)
           ▼
┌─────────────────────┐
│  pi-gps-sender.py   │  Parses GPS data
│  (Raspberry Pi)     │  every 5 seconds
└──────────┬──────────┘
           │
           │ HTTP POST
           │ /api/gps/location
           ▼
┌─────────────────────┐
│  Backend API        │  Validates & stores
│  (FastAPI)          │  GPS data
└──────────┬──────────┘
           │
           │ INSERT INTO
           │ gps_locations
           ▼
┌─────────────────────┐
│  Supabase Database  │  Stores GPS records
│  (PostgreSQL)       │
└──────────┬──────────┘
           │
           │ Supabase Realtime
           │ (postgres_changes)
           ▼
┌─────────────────────┐
│  LiveMap Component  │  Displays on map
│  (React + Leaflet)  │  with green marker
└─────────────────────┘
```

## Next Steps

### To Start Sending GPS from Raspberry Pi:

1. **Install dependencies on Pi:**
   ```bash
   pip install pyserial requests python-dotenv
   ```

2. **Set environment variable:**
   ```bash
   export BACKEND_URL="http://your-backend-url:8000"
   ```

3. **Run GPS sender:**
   ```bash
   # With real GPS hardware
   python pi-gps-sender.py --backend-url http://your-backend-url:8000

   # With GPS simulator (for testing)
   python pi-gps-sender.py --simulate --backend-url http://your-backend-url:8000
   ```

4. **Manual trip assignment (optional):**
   ```bash
   python pi-gps-sender.py --trip-id "your-trip-id-here"
   ```

### To Add More GPS Data Manually:

```sql
INSERT INTO public.gps_locations (
  latitude, 
  longitude, 
  altitude, 
  speed, 
  accuracy, 
  source, 
  trip_id, 
  satellite_count, 
  fix_quality
) VALUES (
  8.491303,      -- Latitude (Cagayan de Oro)
  124.657574,    -- Longitude
  100.0,         -- Altitude (meters)
  45.5,          -- Speed (km/h)
  8.0,           -- Accuracy (meters)
  'gps',         -- Source
  null,          -- Trip ID (null for standalone)
  8,             -- Satellite count
  1              -- Fix quality (1 = GPS fix)
);
```

## Troubleshooting

### GPS Not Showing on Map
1. **Check browser console** for errors
2. **Verify GPS data exists:**
   ```sql
   SELECT * FROM gps_locations ORDER BY recorded_at DESC LIMIT 5;
   ```
3. **Check RLS policies** - ensure frontend can read `gps_locations`
4. **Clear browser cache** and refresh

### GPS Shows Wrong Location
1. **Verify coordinates in database** are correct format (decimal degrees)
2. **Check latitude range:** -90 to 90
3. **Check longitude range:** -180 to 180
4. **Ensure correct column order** (latitude, longitude) not reversed

### GPS Not Updating
1. **Check Supabase Realtime** subscription is active
2. **Verify backend is receiving** GPS data: Check backend logs
3. **Test GPS endpoint manually:**
   ```bash
   curl -X POST http://localhost:8000/api/gps/location \
     -H "Content-Type: application/json" \
     -d '{"latitude": 8.412456, "longitude": 124.816507, "source": "test"}'
   ```

## Features

### LiveMap Features
- ✅ Real-time GPS tracking
- ✅ Auto-refresh on new GPS data
- ✅ Green pulsing marker for live GPS
- ✅ GPS status card with coordinates
- ✅ Last update timestamp
- ✅ Works with or without active trips
- ✅ Multiple bus/trip support
- ✅ Route polylines
- ✅ Passenger counts
- ✅ Interactive map with zoom/pan

### GPS Data Features
- ✅ Latitude/Longitude (required)
- ✅ Altitude (optional)
- ✅ Speed (optional)
- ✅ Accuracy/HDOP (optional)
- ✅ Satellite count (optional)
- ✅ Fix quality (optional)
- ✅ Trip association (optional)
- ✅ Data source tracking
- ✅ Timestamp tracking

## Files Modified/Created

### Modified:
- ✅ `src/pages/LiveMap.tsx` - Always show GPS data
- ✅ `Usersjoshusys-admin/backend/main.py` - Added GPS router

### Created:
- ✅ `Usersjoshusys-admin/backend/routers/gps.py` - GPS API endpoint
- ✅ `pi-gps-sender.py` - Raspberry Pi GPS sender script
- ✅ `test-gps-fetch.html` - GPS data test page
- ✅ `GPS_TRACKING_SETUP.md` - This documentation

## Support

If GPS tracking is still not working:
1. Check all console logs (browser + backend)
2. Verify database contains GPS data
3. Test with `test-gps-fetch.html`
4. Check network connectivity
5. Verify Supabase RLS policies allow reading `gps_locations`

The LiveMap should now **always display your GPS location** from the database, even without active trips! 🎉
