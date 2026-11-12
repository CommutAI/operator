import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import { Bus, Navigation, Users, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix for default marker icons in Leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// Custom GPS marker icon (bright green with pulse)
const gpsIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
  className: 'pulse-dot'
});

// Hide Leaflet attribution and add custom animation
if (!document.getElementById('leaflet-map-styles')) {
  const style = document.createElement('style');
  style.id = 'leaflet-map-styles';
  style.textContent = `
    .leaflet-control-attribution {
      display: none !important;
    }
    .pulse-dot {
      animation: pulse 2s infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
  `;
  document.head.appendChild(style);
}

const SummaryCard = ({ title, value, icon: Icon, color }: { title: string; value: number; icon: any; color: string }) => (
  <div className="glass-card p-4 hover:scale-105 transition-transform duration-300">
    <div className="flex items-center justify-between mb-2">
      <div className={`w-10 h-10 rounded-lg ${color} flex items-center justify-center`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
    </div>
    <h3 className="text-white/60 text-xs mb-1">{title}</h3>
    <p className="text-white text-xl font-bold">{value}</p>
  </div>
);

const MapRecenter = ({ center }: { center: [number, number] }) => {
  const map = useMap();

  useEffect(() => {
    map.setView(center, map.getZoom());
  }, [center, map]);

  return null;
};

const MapRouteFitter = ({ coordinates }: { coordinates: [number, number][] }) => {
  const map = useMap();
  
  useEffect(() => {
    if (coordinates.length > 0) {
      const bounds = L.latLngBounds(coordinates);
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [coordinates, map]);
  
  return null;
};

const fetchRouteCoordinates = async (startCoords: [number, number], endCoords: [number, number]): Promise<[number, number][]> => {
  try {
    const response = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${startCoords[1]},${startCoords[0]};${endCoords[1]},${endCoords[0]}?overview=full&geometries=geojson`
    );
    const data = await response.json();
    
    if (data.routes && data.routes[0]) {
      return data.routes[0].geometry.coordinates.map(
        (coord: [number, number]) => [coord[1], coord[0]] // Convert [lng, lat] to [lat, lng]
      );
    }
  } catch (error) {
    console.error('Error fetching route:', error);
  }
  
  // Fallback to straight line
  return [startCoords, endCoords];
};

const LiveMap = () => {
  const [buses, setBuses] = useState<any[]>([]);
  const [routes, setRoutes] = useState<any[]>([]);
  const [routeCoordinates, setRouteCoordinates] = useState<Record<string, [number, number][]>>({});
  const [latestGps, setLatestGps] = useState<any>(null);
  const [stats, setStats] = useState({
    totalPassengers: 0,
    activeBuses: 0,
    totalRoutes: 0,
    maintenanceBuses: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLiveMapData();
    // Set up real-time subscription for trips
    const subscription = supabase
      .channel('trips-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trips' }, () => {
        fetchLiveMapData();
      })
      .subscribe();

    const gpsSubscription = supabase
      .channel('live-map-gps-channel')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'gps_locations' }, () => {
        fetchLiveMapData();
      })
      .subscribe();

    return () => {
      subscription.unsubscribe();
      gpsSubscription.unsubscribe();
    };
  }, []);

  const fetchLiveMapData = async () => {
    try {
      setLoading(true);

      // Fetch active trips with bus information
      const { data: activeTrips } = await supabase
        .from('trips')
        .select('*, buses(*)')
        .eq('status', 'in_progress')
        .order('started_at', { ascending: false });

      // Fetch all buses
      const { data: allBuses } = await supabase
        .from('buses')
        .select('*');

      const { data: gpsRows, error: gpsError } = await (supabase
        .from('gps_locations')
        .select('trip_id, latitude, longitude, source, recorded_at')
        .order('recorded_at', { ascending: false })
        .limit(100) as any);

      console.log('[LiveMap] GPS rows fetched:', gpsRows?.length, gpsError);
      console.log('[LiveMap] Latest GPS row:', gpsRows?.[0]);

      const latestGpsByTripId: Record<string, any> = {};
      let latestGpsAny: any = null;
      (gpsRows || []).forEach((row: any) => {
        const lat = parseFloat(row.latitude);
        const lng = parseFloat(row.longitude);
        const gps = {
          lat,
          lng,
          source: row.source || 'gps',
          recordedAt: row.recorded_at,
          tripId: row.trip_id || null
        };

        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
        if (!latestGpsAny) latestGpsAny = gps;
        if (row.trip_id && !latestGpsByTripId[row.trip_id]) {
          latestGpsByTripId[row.trip_id] = gps;
        }
      });

      console.log('[LiveMap] latestGpsAny:', latestGpsAny);

      // Transform trips to bus markers
      const busMarkers = (activeTrips || []).map((trip: any, index: number) => {
        // Prefer GPS matched to this trip, then fall back to any latest GPS
        const gps = latestGpsByTripId[trip.id] || latestGpsAny;

        return {
          id: trip.id,
          plate: trip.buses?.bus_number || trip.buses?.plate_number || 'Unknown',
          route: trip.buses?.route || 'Unknown',
          lat: gps?.lat ?? trip.current_lat ?? 8.429,
          lng: gps?.lng ?? trip.current_lng ?? 124.762,
          passengers: 0,
          status: 'active',
          locationSource: gps ? (gps.tripId ? gps.source : `${gps.source} (latest GPS)`) : 'fallback',
          locationUpdatedAt: gps?.recordedAt || trip.gps_updated_at || null,
          busId: trip.bus_id,
          tripId: trip.id
        };
      });

      // ALWAYS show a GPS pin if we have GPS data in the database
      // This ensures GPS location is displayed even without active trips
      const gpsPins: any[] = [];
      
      if (latestGpsAny) {
        // Check if any trip marker is already using this exact GPS location
        const alreadyDisplayed = busMarkers.some((b: any) => 
          Math.abs(b.lat - latestGpsAny.lat) < 0.0001 && 
          Math.abs(b.lng - latestGpsAny.lng) < 0.0001
        );
        
        // Only add GPS pin if not already displayed by a trip marker
        if (!alreadyDisplayed) {
          gpsPins.push({
            id: 'gps-live',
            plate: '🚍 Live GPS Location',
            route: latestGpsAny.tripId ? `Trip: ${latestGpsAny.tripId.slice(0, 8)}...` : 'Current GPS Position',
            lat: latestGpsAny.lat,
            lng: latestGpsAny.lng,
            passengers: 0,
            status: 'active',
            locationSource: `${latestGpsAny.source} (live)`,
            locationUpdatedAt: latestGpsAny.recordedAt,
            busId: null,
            tripId: latestGpsAny.tripId
          });
          
          console.log('[LiveMap] Added GPS pin at:', latestGpsAny.lat, latestGpsAny.lng);
        } else {
          console.log('[LiveMap] GPS location already displayed by trip marker');
        }
      } else {
        console.log('[LiveMap] No GPS data available in database');
      }

      // Add inactive buses (don't assign GPS to them — GPS belongs to active trips/orphan pin)
      const inactiveBuses = (allBuses || [])
        .filter((bus: any) => bus.status !== 'active' || !activeTrips?.some((t: any) => t.bus_id === bus.id))
        .map((bus: any) => ({
          id: bus.id,
          plate: bus.plate_number,
          route: bus.route,
          lat: 8.429,
          lng: 124.762,
          passengers: 0,
          status: bus.status === 'maintenance' ? 'maintenance' : 'idle',
          locationSource: 'fallback',
          locationUpdatedAt: null,
          busId: bus.id
        }));

      // Fetch passenger counts for active trips
      const tripIds = (activeTrips || []).map((t: any) => t.id);
      let totalPassengers = 0;

      // Also fetch the latest passenger count overall (for GPS pins with no trip_id)
      const { data: latestCountAny } = await (supabase
        .from('passenger_counts')
        .select('trip_id, count')
        .order('recorded_at', { ascending: false })
        .limit(1) as any);
      const latestPassengerCount = latestCountAny?.[0]?.count ?? 0;

      if (tripIds.length > 0) {
        const { data: passengerCounts } = await (supabase
          .from('passenger_counts')
          .select('trip_id, count')
          .in('trip_id', tripIds)
          .order('recorded_at', { ascending: false }) as any);

        // Group by trip_id, keep only the latest per trip
        const latestCounts: Record<string, number> = {};
        (passengerCounts || []).forEach((pc: any) => {
          if (!latestCounts[pc.trip_id]) {
            latestCounts[pc.trip_id] = pc.count;
          }
        });

        busMarkers.forEach((bus: any) => {
          const count = latestCounts[bus.tripId] ?? 0;
          bus.passengers = count;
          totalPassengers += count;
        });
      }

      // Apply latest passenger count to GPS pins that have no trip
      gpsPins.forEach((pin: any) => {
        if (!pin.tripId) {
          pin.passengers = latestPassengerCount;
        } else {
          // If the GPS pin is linked to a trip, it will already be handled above
          pin.passengers = latestPassengerCount;
        }
      });

      console.log('[LiveMap] Bus markers:', busMarkers.map((b: any) => ({ plate: b.plate, lat: b.lat, lng: b.lng, source: b.locationSource })));
      console.log('[LiveMap] GPS pins:', gpsPins.map((b: any) => ({ lat: b.lat, lng: b.lng })));

      setBuses([...busMarkers, ...gpsPins, ...inactiveBuses] as any);
      setLatestGps(latestGpsAny);

      // Calculate stats
      const uniqueRoutes = [...new Set((allBuses || []).map((b: any) => b.route))];
      const activeBusesCount = (allBuses || []).filter((b: any) => b.status === 'active').length;
      const maintenanceBusesCount = (allBuses || []).filter((b: any) => b.status === 'maintenance').length;

      setStats({
        totalPassengers,
        activeBuses: activeBusesCount,
        totalRoutes: uniqueRoutes.length,
        maintenanceBuses: maintenanceBusesCount
      });

      const routeColors = ['#f97316', '#3b82f6', '#22c55e', '#a855f7', '#ef4444'];
      
      // Generate route coordinates for unique routes
      const routeCoordsMap: Record<string, [number, number][]> = {};
      
      // For demo purposes, use predefined coordinates for major routes
      const predefinedRoutes: Record<string, { start: [number, number]; end: [number, number] }> = {
        'Manolo Fortich - Agora': {
          start: [8.367004436125404, 124.86562729876327],
          end: [8.491303183117974, 124.65757370963438]
        },
        'Manolo Fortich - Cagayan de Oro': {
          start: [8.367004436125404, 124.86562729876327],
          end: [8.491303183117974, 124.65757370963438]
        }
      };
      
      // Always add the main route regardless of database route names
      const mainRouteCoords = await fetchRouteCoordinates(
        [8.367004436125404, 124.86562729876327],
        [8.491303183117974, 124.65757370963438]
      );
      routeCoordsMap['Manolo Fortich - Agora'] = mainRouteCoords;
      
      // Try to match database routes with predefined routes (case-insensitive)
      for (const route of uniqueRoutes) {
        const routeLower = route.toLowerCase();
        const predefinedKey = Object.keys(predefinedRoutes).find(
          key => key.toLowerCase() === routeLower
        );
        
        if (predefinedKey) {
          const predefined = predefinedRoutes[predefinedKey];
          const coords = await fetchRouteCoordinates(predefined.start, predefined.end);
          routeCoordsMap[route] = coords;
        }
      }
      
      setRouteCoordinates(routeCoordsMap);
      
      // Always include the main route in the routes list
      const routesToDisplay = uniqueRoutes.length > 0 
        ? uniqueRoutes 
        : ['Manolo Fortich - Agora'];
      
      setRoutes(routesToDisplay.map((route: any, index: number) => ({
        id: index + 1,
        name: route,
        color: routeColors[index % routeColors.length],
        path: routeCoordsMap[route] || routeCoordsMap['Manolo Fortich - Agora'] || []
      })));

    } catch (error) {
      console.error('Error fetching live map data:', error);
    } finally {
      setLoading(false);
    }
  };

  const BusMarker = ({ bus }: { bus: any }) => {
    // Use green pulsing icon for live GPS markers
    const isGpsMarker = bus.id === 'gps-live';
    const markerIcon = isGpsMarker ? gpsIcon : undefined;
    
    return (
      <Marker position={[bus.lat, bus.lng]} icon={markerIcon}>
        <Popup>
          <div className="p-2">
            <h3 className="font-bold text-gray-800">{bus.plate}</h3>
            <p className="text-sm text-gray-600">{bus.route}</p>
            <p className="text-xs text-gray-700 mt-2">
              {Number(bus.lat).toFixed(6)}, {Number(bus.lng).toFixed(6)}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Source: {bus.locationSource || 'fallback'}
            </p>
            {bus.locationUpdatedAt && (
              <p className="text-xs text-gray-500">
                Updated: {new Date(bus.locationUpdatedAt).toLocaleString()}
              </p>
            )}
            <div className="flex items-center gap-2 mt-2">
              <Users size={16} className="text-orange-500" />
              <span className="text-sm font-medium">{bus.passengers} passenger{bus.passengers !== 1 ? 's' : ''}</span>
            </div>
            <span className={`inline-block px-2 py-1 rounded text-xs mt-2 ${bus.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
              {bus.status}
            </span>
          </div>
        </Popup>
      </Marker>
    );
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-white text-3xl font-bold mb-2">Live Map</h1>
          <p className="text-white/60">Loading GPS data...</p>
        </div>
      </div>
    );
  }

  // Center map on GPS data if available, otherwise use first bus or default
  const center: [number, number] = latestGps
    ? [latestGps.lat, latestGps.lng]
    : buses.length > 0 && Number.isFinite(buses[0].lat)
    ? [buses[0].lat, buses[0].lng]
    : [8.429, 124.762];

  console.log('[LiveMap] Map center:', center, 'latestGps:', latestGps);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-white text-3xl font-bold mb-2">Live Map</h1>
        <p className="text-white/60">Real-time GPS tracking of all buses</p>
        {latestGps && (
          <p className="text-white/40 text-sm mt-1">
            Last GPS update: {new Date(latestGps.recordedAt).toLocaleString()} 
            {' • '} 
            Coordinates: {latestGps.lat.toFixed(6)}, {latestGps.lng.toFixed(6)}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <SummaryCard 
          title="Total Passengers" 
          value={stats.totalPassengers} 
          icon={Users} 
          color="bg-blue-500" 
        />
        <SummaryCard 
          title="Active Buses" 
          value={stats.activeBuses} 
          icon={Bus} 
          color="bg-green-500" 
        />
        <SummaryCard 
          title="Total Routes" 
          value={stats.totalRoutes} 
          icon={Navigation} 
          color="bg-purple-500" 
        />
        <SummaryCard 
          title="Maintenance" 
          value={stats.maintenanceBuses} 
          icon={AlertTriangle} 
          color="bg-yellow-500" 
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3">
          <div className="glass-card p-4 h-[600px]">
            <MapContainer 
              center={center} 
              zoom={13} 
              style={{ height: '100%', width: '100%' }}
              dragging={false}
              scrollWheelZoom={false}
              doubleClickZoom={false}
              touchZoom={false}
            >
              <MapRecenter center={center} />
              {Object.values(routeCoordinates).flat().length > 0 && (
                <MapRouteFitter coordinates={Object.values(routeCoordinates).flat()} />
              )}
              <TileLayer
                attribution=""
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {routes.map((route: any) => (
                route.path.length > 0 && (
                  <Polyline
                    key={route.id}
                    positions={route.path}
                    color={route.color}
                    weight={4}
                    opacity={0.7}
                  />
                )
              ))}
              {buses.map((bus: any) => (
                <BusMarker key={bus.id} bus={bus} />
              ))}
            </MapContainer>
          </div>
        </div>

        <div className="space-y-4">
          {/* GPS Status Card */}
          {latestGps && (
            <div className="glass-card p-6 bg-gradient-to-br from-green-500/10 to-green-600/5 border border-green-500/20">
              <h3 className="text-white text-lg font-bold mb-4 flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-green-400 animate-pulse" />
                Live GPS Active
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-white/60">Latitude:</span>
                  <span className="text-white font-mono">{latestGps.lat.toFixed(6)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/60">Longitude:</span>
                  <span className="text-white font-mono">{latestGps.lng.toFixed(6)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/60">Source:</span>
                  <span className="text-white">{latestGps.source}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/60">Last Update:</span>
                  <span className="text-white text-xs">
                    {new Date(latestGps.recordedAt).toLocaleTimeString()}
                  </span>
                </div>
              </div>
            </div>
          )}

          <div className="glass-card p-6">
            <h3 className="text-white text-lg font-bold mb-4 flex items-center gap-2">
              <Bus className="text-orange-400" />
              Active Buses
            </h3>
            <div className="space-y-3">
              {buses.length > 0 ? (
                buses.map((bus: any) => (
                  <div key={bus.id} className={`bg-white/5 p-3 rounded-xl ${bus.id === 'gps-live' ? 'border-2 border-green-400/50' : ''}`}>
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="text-white font-medium text-sm">{bus.plate}</p>
                        <p className="text-white/60 text-xs">{bus.route}</p>
                      </div>
                      <span className={`w-2 h-2 rounded-full ${bus.status === 'active' ? 'bg-green-400' : 'bg-gray-400'}`} />
                    </div>
                    <div className="flex items-center gap-2 text-white/70 text-xs">
                        <Users size={14} />
                        <span>{bus.passengers} passenger{bus.passengers !== 1 ? 's' : ''}</span>
                      </div>
                    {bus.locationSource && (
                      <div className="text-white/50 text-xs mt-1">
                        📍 {bus.locationSource}
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <p className="text-white/60 text-sm">No active buses</p>
              )}
            </div>
          </div>

          <div className="glass-card p-6">
            <h3 className="text-white text-lg font-bold mb-4 flex items-center gap-2">
              <Navigation className="text-orange-400" />
              Routes
            </h3>
            <div className="space-y-3">
              {routes.map((route: any) => (
                <div key={route.id} className="flex items-center gap-3">
                  <div className="w-4 h-4 rounded-full" style={{ backgroundColor: route.color }} />
                  <span className="text-white/70 text-sm">{route.name}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="glass-card p-6">
            <h3 className="text-white text-lg font-bold mb-4">Map Legend</h3>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-green-400" />
                <span className="text-white/70">Active Bus</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-gray-400" />
                <span className="text-white/70">Idle Bus</span>
              </div>
              {routes.map((route: any) => (
                <div key={route.id} className="flex items-center gap-2">
                  <div className="w-6 h-1 rounded" style={{ backgroundColor: route.color }} />
                  <span className="text-white/70">{route.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LiveMap;
