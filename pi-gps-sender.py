"""
GPS Location Sender for Raspberry Pi
Reads GPS data from hardware and sends it to the backend API
"""

import serial
import time
import requests
import os
import json
from datetime import datetime
from typing import Optional, Dict
import threading


class GPSSender:
    """Reads GPS data and sends to backend"""

    def __init__(self, backend_url: str = None, port: str = "/dev/serial0", baudrate: int = 9600):
        """
        Initialize GPS sender
        
        Args:
            backend_url: Backend API URL (default: from env or localhost)
            port: Serial port for GPS module (default: /dev/serial0 for Pi UART)
            baudrate: Serial baudrate (default: 9600 for most GPS modules)
        """
        self.backend_url = backend_url or os.getenv('BACKEND_URL', 'http://localhost:8000')
        self.port = port
        self.baudrate = baudrate
        self.serial_conn = None
        self.running = False
        self.current_trip_id = None
        self.send_interval = 5  # Send GPS every 5 seconds
        self.last_valid_location = None
        
        # GPS fix status
        self.has_fix = False
        self.satellite_count = 0
        self.fix_quality = 0

    def connect(self) -> bool:
        """Connect to GPS module via serial port"""
        try:
            self.serial_conn = serial.Serial(self.port, self.baudrate, timeout=1)
            print(f"[GPS] Connected to GPS module on {self.port}")
            return True
        except Exception as e:
            print(f"[GPS] Error connecting to GPS module: {e}")
            return False

    def disconnect(self):
        """Disconnect from GPS module"""
        if self.serial_conn and self.serial_conn.is_open:
            self.serial_conn.close()
            print("[GPS] Disconnected from GPS module")

    def parse_gpgga(self, sentence: str) -> Optional[Dict]:
        """
        Parse GPGGA NMEA sentence
        Format: $GPGGA,hhmmss.ss,llll.ll,a,yyyyy.yy,a,x,xx,x.x,x.x,M,x.x,M,x.x,xxxx*hh
        """
        try:
            parts = sentence.split(',')
            if len(parts) < 15 or parts[0] not in ['$GPGGA', '$GNGGA']:
                return None

            # Parse latitude
            if parts[2] and parts[3]:
                lat_deg = float(parts[2][:2])
                lat_min = float(parts[2][2:])
                latitude = lat_deg + (lat_min / 60.0)
                if parts[3] == 'S':
                    latitude = -latitude
            else:
                return None

            # Parse longitude
            if parts[4] and parts[5]:
                lon_deg = float(parts[4][:3])
                lon_min = float(parts[4][3:])
                longitude = lon_deg + (lon_min / 60.0)
                if parts[5] == 'W':
                    longitude = -longitude
            else:
                return None

            # Fix quality and satellite count
            fix_quality = int(parts[6]) if parts[6] else 0
            satellite_count = int(parts[7]) if parts[7] else 0

            # HDOP (Horizontal Dilution of Precision)
            hdop = float(parts[8]) if parts[8] else None

            # Altitude
            altitude = float(parts[9]) if parts[9] else None

            self.fix_quality = fix_quality
            self.satellite_count = satellite_count
            self.has_fix = fix_quality > 0

            return {
                'latitude': latitude,
                'longitude': longitude,
                'altitude': altitude,
                'accuracy': hdop,
                'satellite_count': satellite_count,
                'fix_quality': fix_quality,
                'source': 'gps',
                'recorded_at': datetime.now().isoformat()
            }

        except (ValueError, IndexError) as e:
            print(f"[GPS] Error parsing GPGGA: {e}")
            return None

    def parse_gprmc(self, sentence: str) -> Optional[Dict]:
        """
        Parse GPRMC NMEA sentence (includes speed)
        Format: $GPRMC,hhmmss.ss,A,llll.ll,a,yyyyy.yy,a,x.x,x.x,ddmmyy,x.x,a*hh
        """
        try:
            parts = sentence.split(',')
            if len(parts) < 12 or parts[0] not in ['$GPRMC', '$GNRMC']:
                return None

            # Check status
            if parts[2] != 'A':  # A = Active/Valid, V = Void
                return None

            # Parse latitude
            if parts[3] and parts[4]:
                lat_deg = float(parts[3][:2])
                lat_min = float(parts[3][2:])
                latitude = lat_deg + (lat_min / 60.0)
                if parts[4] == 'S':
                    latitude = -latitude
            else:
                return None

            # Parse longitude
            if parts[5] and parts[6]:
                lon_deg = float(parts[5][:3])
                lon_min = float(parts[5][3:])
                longitude = lon_deg + (lon_min / 60.0)
                if parts[6] == 'W':
                    longitude = -longitude
            else:
                return None

            # Speed in knots
            speed_knots = float(parts[7]) if parts[7] else 0
            speed_kmh = speed_knots * 1.852  # Convert to km/h

            return {
                'latitude': latitude,
                'longitude': longitude,
                'speed': speed_kmh,
                'source': 'gps',
                'recorded_at': datetime.now().isoformat()
            }

        except (ValueError, IndexError) as e:
            print(f"[GPS] Error parsing GPRMC: {e}")
            return None

    def read_gps_data(self) -> Optional[Dict]:
        """Read and parse GPS data from serial port"""
        if not self.serial_conn or not self.serial_conn.is_open:
            return None

        try:
            # Read lines until we get valid GPS data
            max_attempts = 50  # Don't block forever
            for _ in range(max_attempts):
                line = self.serial_conn.readline().decode('ascii', errors='ignore').strip()
                
                if line.startswith('$GPGGA') or line.startswith('$GNGGA'):
                    data = self.parse_gpgga(line)
                    if data:
                        return data
                
                elif line.startswith('$GPRMC') or line.startswith('$GNRMC'):
                    data = self.parse_gprmc(line)
                    if data:
                        return data

            return None

        except Exception as e:
            print(f"[GPS] Error reading GPS data: {e}")
            return None

    def send_gps_location(self, location: Dict) -> bool:
        """Send GPS location to backend API"""
        try:
            # Add trip_id if available
            if self.current_trip_id:
                location['trip_id'] = self.current_trip_id

            response = requests.post(
                f"{self.backend_url}/api/gps/location",
                json=location,
                timeout=10
            )

            if response.status_code == 200:
                print(f"[GPS] Sent location: {location['latitude']:.6f}, {location['longitude']:.6f} (trip: {self.current_trip_id or 'none'})")
                return True
            else:
                print(f"[GPS] Failed to send location: {response.status_code} - {response.text}")
                return False

        except requests.exceptions.RequestException as e:
            print(f"[GPS] Network error sending GPS: {e}")
            return False
        except Exception as e:
            print(f"[GPS] Error sending GPS location: {e}")
            return False

    def get_active_trip(self) -> Optional[str]:
        """Poll backend for active trip"""
        try:
            response = requests.get(
                f"{self.backend_url}/api/trips",
                timeout=5
            )
            
            if response.status_code == 200:
                data = response.json()
                trips = data.get('trips', [])
                
                # Find first in_progress trip
                for trip in trips:
                    if trip.get('status') == 'in_progress':
                        return trip.get('id')
            
            return None

        except Exception as e:
            print(f"[GPS] Error fetching active trip: {e}")
            return None

    def start(self, check_trip: bool = True):
        """
        Start GPS monitoring and sending
        
        Args:
            check_trip: If True, automatically poll for active trips
        """
        if not self.connect():
            print("[GPS] Failed to connect to GPS module")
            return

        self.running = True
        print(f"[GPS] Started GPS monitoring (send interval: {self.send_interval}s)")
        
        last_send_time = 0
        trip_check_interval = 30  # Check for active trip every 30 seconds
        last_trip_check = 0

        try:
            while self.running:
                current_time = time.time()

                # Check for active trip periodically
                if check_trip and (current_time - last_trip_check) >= trip_check_interval:
                    trip_id = self.get_active_trip()
                    if trip_id != self.current_trip_id:
                        self.current_trip_id = trip_id
                        print(f"[GPS] Active trip: {self.current_trip_id or 'none'}")
                    last_trip_check = current_time

                # Read GPS data
                location = self.read_gps_data()
                
                if location:
                    self.last_valid_location = location
                    
                    # Send at specified interval
                    if (current_time - last_send_time) >= self.send_interval:
                        self.send_gps_location(location)
                        last_send_time = current_time
                else:
                    # No GPS fix yet
                    if not self.has_fix:
                        print(f"[GPS] Waiting for GPS fix... (satellites: {self.satellite_count})")
                
                time.sleep(0.1)  # Small delay to prevent CPU spinning

        except KeyboardInterrupt:
            print("\n[GPS] Stopped by user")
        finally:
            self.stop()

    def stop(self):
        """Stop GPS monitoring"""
        self.running = False
        self.disconnect()
        print("[GPS] GPS monitoring stopped")

    def set_trip_id(self, trip_id: Optional[str]):
        """Manually set the current trip ID"""
        self.current_trip_id = trip_id
        print(f"[GPS] Trip ID set to: {trip_id}")

    def get_status(self) -> Dict:
        """Get current GPS status"""
        return {
            'running': self.running,
            'has_fix': self.has_fix,
            'satellite_count': self.satellite_count,
            'fix_quality': self.fix_quality,
            'trip_id': self.current_trip_id,
            'last_location': self.last_valid_location
        }


# For testing with simulated GPS data (useful when no hardware available)
def simulate_gps(backend_url: str, trip_id: Optional[str] = None):
    """Simulate GPS data for testing (Manolo Fortich to Cagayan de Oro route)"""
    print("[GPS Simulator] Starting GPS simulation")
    
    # Route coordinates (Manolo Fortich → Cagayan de Oro)
    route_points = [
        (8.367004, 124.865627),  # Start: Manolo Fortich
        (8.380000, 124.850000),
        (8.400000, 124.800000),
        (8.430000, 124.750000),
        (8.460000, 124.700000),
        (8.491303, 124.657574),  # End: Cagayan de Oro (Agora)
    ]
    
    point_index = 0
    
    try:
        while True:
            # Get current point
            lat, lng = route_points[point_index]
            
            # Add small random variation
            import random
            lat += random.uniform(-0.001, 0.001)
            lng += random.uniform(-0.001, 0.001)
            
            location = {
                'latitude': lat,
                'longitude': lng,
                'altitude': random.uniform(50, 150),
                'speed': random.uniform(30, 60),
                'accuracy': random.uniform(5, 15),
                'source': 'gps_simulator',
                'satellite_count': random.randint(6, 12),
                'fix_quality': 1,
                'trip_id': trip_id,
                'recorded_at': datetime.now().isoformat()
            }
            
            # Send to backend
            try:
                response = requests.post(
                    f"{backend_url}/api/gps/location",
                    json=location,
                    timeout=10
                )
                
                if response.status_code == 200:
                    print(f"[GPS Simulator] Sent: {lat:.6f}, {lng:.6f}")
                else:
                    print(f"[GPS Simulator] Error: {response.status_code}")
            except Exception as e:
                print(f"[GPS Simulator] Network error: {e}")
            
            # Move to next point
            point_index = (point_index + 1) % len(route_points)
            
            # Wait before next update
            time.sleep(5)
            
    except KeyboardInterrupt:
        print("\n[GPS Simulator] Stopped")


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description='GPS Location Sender for Raspberry Pi')
    parser.add_argument('--backend-url', default='http://localhost:8000', help='Backend API URL')
    parser.add_argument('--port', default='/dev/serial0', help='Serial port for GPS module')
    parser.add_argument('--baudrate', type=int, default=9600, help='Serial baudrate')
    parser.add_argument('--trip-id', help='Manual trip ID (otherwise auto-detected)')
    parser.add_argument('--simulate', action='store_true', help='Simulate GPS data for testing')
    parser.add_argument('--interval', type=int, default=5, help='Send interval in seconds')
    
    args = parser.parse_args()
    
    if args.simulate:
        # Run simulator
        simulate_gps(args.backend_url, args.trip_id)
    else:
        # Run real GPS sender
        sender = GPSSender(
            backend_url=args.backend_url,
            port=args.port,
            baudrate=args.baudrate
        )
        sender.send_interval = args.interval
        
        if args.trip_id:
            sender.set_trip_id(args.trip_id)
        
        sender.start(check_trip=not args.trip_id)
