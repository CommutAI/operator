# GPS Tracking - Quick Start

## ✅ What's Fixed

Your LiveMap now **displays GPS data directly from the database**, even without active trips.

**Your GPS data:** `8.41245600, 124.81650700` (Manolo Fortich area)

## 🚀 Quick Test

1. **Start your app:**
   ```bash
   npm run dev
   ```

2. **Navigate to Live Map**

3. **Look for:**
   - 🟢 Green pulsing marker on map
   - 📊 "Live GPS Active" status card
   - 📍 Coordinates in header: `8.412456, 124.816507`

## 🔍 Debug Check

Open browser console (F12) and look for:
```
[LiveMap] GPS rows fetched: 1
[LiveMap] Latest GPS row: {latitude: "8.41245600", ...}
[LiveMap] Added GPS pin at: 8.412456 124.816507
```

## 📝 Key Changes

**Before:**
- ❌ Only showed GPS with active trips
- ❌ Used fallback coordinates `8.429, 124.762`
- ❌ No visual distinction for GPS

**After:**
- ✅ Always shows GPS from database
- ✅ Uses real coordinates `8.412456, 124.816507`
- ✅ Green pulsing marker for GPS
- ✅ GPS status card in sidebar
- ✅ Works with `trip_id = null`

## 🎯 Expected Result

When you open the Live Map, you should see the map centered on your GPS coordinates with a bright green marker showing **"🚍 Live GPS Location"**.

## ⚠️ If GPS Doesn't Show

1. **Check database has data:**
   ```sql
   SELECT * FROM gps_locations ORDER BY recorded_at DESC LIMIT 1;
   ```

2. **Check browser console** for errors

3. **Use test page:** Open `test-gps-fetch.html` in browser

4. **Verify RLS policy** allows reading `gps_locations` table

## 📡 Send New GPS Data (Optional)

### From Backend API:
```bash
curl -X POST http://localhost:8000/api/gps/location \
  -H "Content-Type: application/json" \
  -d '{
    "latitude": 8.491303,
    "longitude": 124.657574,
    "source": "test"
  }'
```

### From Database:
```sql
INSERT INTO gps_locations (latitude, longitude, source)
VALUES (8.491303, 124.657574, 'manual_test');
```

The map will update automatically via Supabase Realtime! ⚡

---

**Need more details?** See `GPS_TRACKING_SETUP.md`
