# Hybrid Video Storage Implementation Guide

This document explains how to implement the hybrid video storage system for trip recordings.

## Architecture

```
Raspberry Pi
  ├─ Local Recording (mp4 files)
  ├─ Periodic Cloud Sync (every 5 minutes)
  └─ Final Upload (when trip ends)

Backend
  ├─ Video metadata database (trip_videos table)
  ├─ Video management API
  └─ Cloud storage integration

Frontend
  └─ Video playback and management UI
```

## Database Schema

Run the migration to create the `trip_videos` table:

```bash
# Apply migration to Supabase
psql -h db.xxx.supabase.co -U postgres -d postgres -f migrations/add_trip_videos.sql
```

Or run via Supabase Dashboard SQL Editor.

## Backend Setup

### 1. Add Video Router

Add the video router to `backend/main.py`:

```python
from routers import videos

app.include_router(videos.router, tags=["Videos"])
```

### 2. Install Dependencies

```bash
cd Usersjoshusys-admin/backend
pip install -r requirements.txt
```

## Raspberry Pi Setup

### 1. Install Dependencies

```bash
# On the Pi
cd /home/chichi/raspberry-pi-server
pip install opencv-python requests
```

### 2. Integrate Video Recorder

Update `video_server_stream_only.py` to use the recorder:

```python
from pi_video_recorder import recorder

# When trip starts
recorder.start_recording(trip_id)

# In the frame processing loop
recorder.add_frame(frame)

# When trip ends
recorder.stop_recording()
```

### 3. Create Storage Directory

```bash
sudo mkdir -p /home/chichi/videos
sudo chown chichi:chichi /home/chichi/videos
```

### 4. Update .env

Add to `/home/chichi/raspberry-pi-server/.env`:

```env
BACKEND_URL=https://sys-admin-my13.onrender.com
SUPABASE_URL=your-supabase-url
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

## Cloud Storage Options

### Option A: Supabase Storage (Recommended)

1. Create a storage bucket in Supabase Dashboard
2. Add bucket named `trip-videos`
3. Update `_sync_to_cloud()` in `pi-video-recorder.py`:

```python
from supabase import create_client

supabase = create_client(self.supabase_url, self.supabase_key)

def _sync_to_cloud(self, final: bool = False):
    with open(self.current_file_path, 'rb') as f:
        supabase.storage.from_('trip-videos').upload(
            f'trips/{self.current_trip_id}/video.mp4',
            f.read()
        )
```

### Option B: AWS S3

```python
import boto3

s3 = boto3.client('s3')

def _sync_to_cloud(self, final: bool = False):
    s3.upload_file(
        self.current_file_path,
        'commutai-trip-videos',
        f'trips/{self.current_trip_id}/video.mp4'
    )
```

## Frontend Integration

Add video playback to Trip Management page:

```typescript
// src/pages/TripManagement.tsx
const fetchTripVideo = async (tripId: string) => {
  const { data } = await supabase
    .from('trip_videos')
    .select('*')
    .eq('trip_id', tripId)
    .single();

  return data;
};

// Display video player
{video && video.status === 'completed' && (
  <video
    src={video.storage_url}
    controls
    className="w-full rounded-lg"
  />
)}
```

## Storage Management

### Automatic Cleanup

Add a cleanup job to remove old videos:

```python
# On Pi
import os
import time

def cleanup_old_videos(days=30):
    """Delete videos older than specified days"""
    cutoff = time.time() - (days * 86400)
    for filename in os.listdir('/home/chichi/videos'):
        filepath = os.path.join('/home/chichi/videos', filename)
        if os.path.getmtime(filepath) < cutoff:
            os.remove(filepath)
            print(f"Deleted old video: {filename}")
```

### Monitoring

Check recording status:

```python
# On Pi
from pi_video_recorder import recorder

status = recorder.get_recording_status()
print(f"Recording: {status['recording']}")
print(f"Duration: {status['duration']}s")
print(f"Frames: {status['frame_count']}")
print(f"Size: {status['file_size']} bytes")
```

## Testing

### 1. Test Local Recording

```python
# On Pi
from pi_video_recorder import recorder

recorder.start_recording('test-trip-123')
# Wait 10 seconds
recorder.stop_recording()
```

### 2. Test API Endpoints

```bash
# Create video record
curl -X POST http://localhost:8000/api/videos/create \
  -H "Content-Type: application/json" \
  -d '{"trip_id": "uuid", "storage_type": "local"}'

# Get video for trip
curl http://localhost:8000/api/videos/trip/{trip_id}

# List all videos
curl http://localhost:8000/api/videos
```

## Cost Estimates

### Local Storage (Pi SD Card)
- 30fps @ 640x480 ≈ 1 GB/hour
- 8-hour trip = 8 GB
- 30 trips = 240 GB
- Cost: Free (already have SD card)

### Supabase Storage
- Free tier: 1 GB
- Paid: $0.021/GB/month
- 240 GB = $5.04/month

### AWS S3
- Standard: $0.023/GB/month
- 240 GB = $5.52/month

## Next Steps

1. ✅ Database schema created
2. ✅ Backend API created
3. ✅ Pi recorder implementation
4. ⏳ Integrate with Pi video server
5. ⏳ Add cloud storage upload
6. ⏳ Add frontend video player
7. ⏳ Add automatic cleanup
8. ⏳ Test end-to-end
