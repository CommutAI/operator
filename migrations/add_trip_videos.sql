-- Create trip_videos table for storing video metadata
CREATE TABLE IF NOT EXISTS trip_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID REFERENCES trips(id) ON DELETE CASCADE,
  storage_type TEXT NOT NULL DEFAULT 'local', -- 'local', 'supabase', 's3'
  file_path TEXT,
  file_size BIGINT,
  duration_seconds INTEGER,
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  frame_count INTEGER,
  storage_url TEXT,
  status TEXT DEFAULT 'recording', -- 'recording', 'uploading', 'completed', 'failed'
  upload_progress INTEGER DEFAULT 0, -- 0-100
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index on trip_id for faster queries
CREATE INDEX IF NOT EXISTS idx_trip_videos_trip_id ON trip_videos(trip_id);

-- Create index on status for filtering
CREATE INDEX IF NOT EXISTS idx_trip_videos_status ON trip_videos(status);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_trip_videos_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_trip_videos_updated_at_trigger ON trip_videos;
CREATE TRIGGER update_trip_videos_updated_at_trigger
  BEFORE UPDATE ON trip_videos
  FOR EACH ROW
  EXECUTE FUNCTION update_trip_videos_updated_at();
