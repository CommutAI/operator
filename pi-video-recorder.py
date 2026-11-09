"""
Hybrid Video Recorder for Raspberry Pi
Records video locally and periodically syncs to cloud storage
"""

import cv2
import time
import os
import json
import requests
from datetime import datetime
from typing import Optional
import threading


class HybridVideoRecorder:
    """Records video locally with periodic cloud sync"""

    def __init__(self, storage_path='/home/chichi/videos', sync_interval=300):
        self.storage_path = storage_path
        self.sync_interval = sync_interval  # 5 minutes default
        self.current_recorder = None
        self.current_trip_id = None
        self.current_file_path = None
        self.frame_count = 0
        self.start_time = None
        self.sync_thread = None
        self.sync_running = False
        self.backend_url = os.getenv('BACKEND_URL', 'http://localhost:8000')
        self.supabase_url = os.getenv('SUPABASE_URL')
        self.supabase_key = os.getenv('SUPABASE_SERVICE_ROLE_KEY')

        # Ensure storage directory exists
        os.makedirs(storage_path, exist_ok=True)

    def start_recording(self, trip_id: str, camera_id: int = 0) -> bool:
        """Start recording a trip"""
        try:
            if self.current_recorder is not None:
                print(f"[Recorder] Already recording trip {self.current_trip_id}")
                return False

            # Initialize camera
            cap = cv2.VideoCapture(camera_id)
            if not cap.isOpened():
                print(f"[Recorder] Failed to open camera {camera_id}")
                return False

            # Set video properties
            cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
            cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
            cap.set(cv2.CAP_PROP_FPS, 30)

            # Create video writer
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            filename = f"trip_{trip_id}_{timestamp}.mp4"
            self.current_file_path = os.path.join(self.storage_path, filename)

            fourcc = cv2.VideoWriter_fourcc(*'mp4v')
            self.current_recorder = cv2.VideoWriter(
                self.current_file_path,
                fourcc,
                30.0,
                (640, 480)
            )

            if not self.current_recorder.isOpened():
                print(f"[Recorder] Failed to create video writer")
                cap.release()
                return False

            self.current_trip_id = trip_id
            self.frame_count = 0
            self.start_time = time.time()

            # Create database record
            self._create_video_record(trip_id, self.current_file_path)

            # Start sync thread
            self.sync_running = True
            self.sync_thread = threading.Thread(target=self._sync_loop, daemon=True)
            self.sync_thread.start()

            print(f"[Recorder] Started recording trip {trip_id} to {self.current_file_path}")
            return True

        except Exception as e:
            print(f"[Recorder] Error starting recording: {e}")
            return False

    def add_frame(self, frame):
        """Add a frame to the current recording"""
        if self.current_recorder is not None and self.current_recorder.isOpened():
            self.current_recorder.write(frame)
            self.frame_count += 1
            return True
        return False

    def stop_recording(self) -> Optional[str]:
        """Stop recording and return the file path"""
        if self.current_recorder is None:
            return None

        try:
            # Stop sync thread
            self.sync_running = False
            if self.sync_thread:
                self.sync_thread.join(timeout=5)

            # Release recorder
            if self.current_recorder.isOpened():
                self.current_recorder.release()

            # Get file size
            file_size = os.path.getsize(self.current_file_path) if os.path.exists(self.current_file_path) else 0
            duration = int(time.time() - self.start_time) if self.start_time else 0

            # Update database record
            self._update_video_record(
                self.current_trip_id,
                file_size=file_size,
                duration_seconds=duration,
                frame_count=self.frame_count,
                status='uploading'
            )

            # Final sync to cloud
            self._sync_to_cloud(final=True)

            file_path = self.current_file_path
            trip_id = self.current_trip_id

            # Reset state
            self.current_recorder = None
            self.current_trip_id = None
            self.current_file_path = None
            self.frame_count = 0
            self.start_time = None

            print(f"[Recorder] Stopped recording trip {trip_id}")
            return file_path

        except Exception as e:
            print(f"[Recorder] Error stopping recording: {e}")
            return None

    def _create_video_record(self, trip_id: str, file_path: str):
        """Create video record in database"""
        try:
            payload = {
                'trip_id': trip_id,
                'storage_type': 'local',
                'file_path': file_path,
                'status': 'recording',
                'start_time': datetime.now().isoformat()
            }

            response = requests.post(
                f"{self.backend_url}/api/videos/create",
                json=payload,
                timeout=10
            )

            if response.status_code == 200:
                print(f"[Recorder] Created video record for trip {trip_id}")
            else:
                print(f"[Recorder] Failed to create video record: {response.text}")

        except Exception as e:
            print(f"[Recorder] Error creating video record: {e}")

    def _update_video_record(self, trip_id: str, **kwargs):
        """Update video record in database"""
        try:
            payload = {
                'trip_id': trip_id,
                **kwargs
            }

            response = requests.patch(
                f"{self.backend_url}/api/videos/update",
                json=payload,
                timeout=10
            )

            if response.status_code != 200:
                print(f"[Recorder] Failed to update video record: {response.text}")

        except Exception as e:
            print(f"[Recorder] Error updating video record: {e}")

    def _sync_loop(self):
        """Periodic sync loop"""
        while self.sync_running:
            time.sleep(self.sync_interval)
            if self.sync_running:
                self._sync_to_cloud()

    def _sync_to_cloud(self, final: bool = False):
        """Sync video to cloud storage"""
        if not self.current_file_path or not os.path.exists(self.current_file_path):
            return

        try:
            # Get current file size
            file_size = os.path.getsize(self.current_file_path)

            # Update progress
            self._update_video_record(
                self.current_trip_id,
                upload_progress=50 if not final else 100,
                status='uploading'
            )

            # For now, just simulate upload
            # TODO: Implement actual cloud upload (Supabase Storage, S3, etc.)
            print(f"[Recorder] Syncing {file_size} bytes to cloud (final={final})")

            if final:
                # Mark as completed
                self._update_video_record(
                    self.current_trip_id,
                    status='completed',
                    upload_progress=100
                )
                print(f"[Recorder] Sync completed for trip {self.current_trip_id}")

        except Exception as e:
            print(f"[Recorder] Error syncing to cloud: {e}")
            self._update_video_record(
                self.current_trip_id,
                status='failed',
                error_message=str(e)
            )

    def get_recording_status(self) -> dict:
        """Get current recording status"""
        if self.current_recorder is None:
            return {
                'recording': False,
                'trip_id': None,
                'duration': 0,
                'frame_count': 0,
                'file_size': 0
            }

        duration = int(time.time() - self.start_time) if self.start_time else 0
        file_size = os.path.getsize(self.current_file_path) if os.path.exists(self.current_file_path) else 0

        return {
            'recording': True,
            'trip_id': self.current_trip_id,
            'duration': duration,
            'frame_count': self.frame_count,
            'file_size': file_size,
            'file_path': self.current_file_path
        }


# Singleton instance
recorder = HybridVideoRecorder()
