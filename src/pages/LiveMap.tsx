import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import { Bus, Navigation, Users, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useBackendVideo } from '../hooks/useBackendVideo';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// ─── Leaflet icon fix ────────────────────────────────────────────────────────
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl:       'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl:     'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

const gpsIcon = new L.Icon({
  iconUrl:    'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
  shadowUrl:  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
  iconSize:   [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41],
});

if (!document.getElementById('leaflet-map-styles')) {
  const s = document.createElement('style');
  s.id = 'leaflet-map-styles';
  s.textContent = `.leaflet-control-attribution{display:none!important}`;
  document.head.appendChild(s);
}

// ─── OSRM route cache with LRU eviction to prevent memory leaks ────────────────
const ROUTE_CACHE_MAX_SIZE = 50;
const routeCache = new Map<string, [number, number][]>();

async function fetchRoute(start: [number, number], end: [number, number]): Promise<[number, number][]> {
  const key = `${start[0]},${start[1]}_${end[0]},${end[1]}`;
  if (routeCache.has(key)) {
    const cached = routeCache.get(key)!;
    // Move to end for LRU
    routeCache.delete(key);
    routeCache.set(key, cached);
    return cached;
  }
  try {
    const r = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${start[1]},${start[0]};${end[1]},${end[0]}?overview=full&geometries=geojson`
    );
    const d = await r.json();
    if (d.routes?.[0]) {
      const coords: [number, number][] = d.routes[0].geometry.coordinates.map(
        ([lng, lat]: [number, number]) => [lat, lng]
      );
      // Evict oldest if cache is full
      if (routeCache.size >= ROUTE_CACHE_MAX_SIZE) {
        const firstKey = routeCache.keys().next().value;
        if (firstKey !== undefined) routeCache.delete(firstKey);
      }
      routeCache.set(key, coords);
      return coords;
    }
  } catch { /* fall through */ }
  const fallback: [number, number][] = [start, end];
  if (routeCache.size >= ROUTE_CACHE_MAX_SIZE) {
    const firstKey = routeCache.keys().next().value;
    if (firstKey !== undefined) routeCache.delete(firstKey);
  }
  routeCache.set(key, fallback);
  return fallback;
}

// ─── Sub-components defined OUTSIDE LiveMap to prevent remount every render ──
const SummaryCard = ({ title, value, icon: Icon, color }: { title: string; value: number; icon: any; color: string }) => (
  <div className="glass-card p-4 hover:scale-105 transition-transform duration-300">
    <div className={`w-10 h-10 rounded-lg ${color} flex items-center justify-center mb-2`}>
      <Icon className="w-5 h-5 text-white" />
    </div>
    <h3 className="text-white/60 text-xs mb-1">{title}</h3>
    <p className="text-white text-xl font-bold">{value}</p>
  </div>
);

const MapRecenter = ({ center }: { center: [number, number] }) => {
  const map = useMap();
  useEffect(() => { map.setView(center, map.getZoom()); }, [center, map]);
  return null;
};

interface BusData {
  id: string; plate: string | number; route: string;
  lat: number; lng: number; passengers: number;
  status: string; locationSource: string;
  locationUpdatedAt: string | null;
  busId: string | null; tripId: string | null;
}

// BusMarker is stable — defined outside the component
const BusMarker = ({ bus, liveCount }: { bus: BusData; liveCount: number }) => {
  const isGps = bus.id === 'gps-live';
  const displayCount = bus.status === 'active' ? liveCount : bus.passengers;
  return (
    <Marker position={[bus.lat, bus.lng]} icon={isGps ? gpsIcon : undefined}>
      <Popup>
        <div className="p-2 min-w-[180px]">
          <h3 className="font-bold text-gray-800">{bus.plate}</h3>
          <p className="text-sm text-gray-600">{bus.route}</p>
          <p className="text-xs text-gray-700 mt-2">{bus.lat.toFixed(6)}, {bus.lng.toFixed(6)}</p>
          <p className="text-xs text-gray-500 mt-1">Source: {bus.locationSource || 'fallback'}</p>
          {bus.locationUpdatedAt && (
            <p className="text-xs text-gray-500">Updated: {new Date(bus.locationUpdatedAt).toLocaleString()}</p>
          )}
          <div className="flex items-center gap-2 mt-2">
            <Users size={16} className="text-orange-500" />
            <span className="text-sm font-medium">{displayCount} passenger{displayCount !== 1 ? 's' : ''}</span>
          </div>
          <span className={`inline-block px-2 py-1 rounded text-xs mt-2 ${bus.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
            {bus.status}
          </span>
        </div>
      </Popup>
    </Marker>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────
const DEBOUNCE_MS = 1500;
const DEFAULT_CENTER: [number, number] = [8.429, 124.762];
const MAIN_ROUTE = { start: [8.367004436125404, 124.86562729876327] as [number, number], end: [8.491303183117974, 124.65757370963438] as [number, number] };

const LiveMap = () => {
  const [buses, setBuses]             = useState<BusData[]>([]);
  const [routes, setRoutes]           = useState<any[]>([]);
  const [routeCoords, setRouteCoords] = useState<Record<string, [number, number][]>>({});
  const [latestGps, setLatestGps]     = useState<any>(null);
  const [stats, setStats]             = useState({ totalPassengers: 0, activeBuses: 0, totalRoutes: 0, maintenanceBuses: 0 });
  const [loading, setLoading]         = useState(true);

  const { passengerCount: livePassengerCount } = useBackendVideo({ autoConnect: true });

  // Debounce ref — prevents flooding on rapid GPS inserts
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchLiveMapData = useCallback(async () => {
    try {
      // Run all independent queries in parallel
      const [tripsRes, busesRes, gpsRes] = await Promise.all([
        supabase.from('trips').select('id, bus_id, current_lat, current_lng, gps_updated_at, buses!fk_trips_bus_id(id, bus_number, plate_number, route)').eq('status', 'in_progress'),
        supabase.from('buses').select('id, bus_number, plate_number, route, status'),
        (supabase.from('gps_locations').select('trip_id, latitude, longitude, source, recorded_at').order('recorded_at', { ascending: false }).limit(10) as any),
      ]);

      const activeTrips: any[] = tripsRes.data || [];
      const allBuses: any[]    = busesRes.data || [];
      const gpsRows: any[]     = gpsRes.data   || [];

      // ── Build GPS lookup ─────────────────────────────────────────────────
      const latestByTrip: Record<string, any> = {};
      let latestAny: any = null;
      for (const row of gpsRows) {
        const lat = parseFloat(row.latitude), lng = parseFloat(row.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
        const gps = { lat, lng, source: row.source || 'gps', recordedAt: row.recorded_at, tripId: row.trip_id || null };
        if (!latestAny) latestAny = gps;
        if (row.trip_id && !latestByTrip[row.trip_id]) latestByTrip[row.trip_id] = gps;
      }

      // ── Bus markers from active trips ────────────────────────────────────
      const busMarkers: BusData[] = activeTrips.map((trip: any) => {
        const gps = latestByTrip[trip.id] || latestAny;
        return {
          id:      trip.id,
          plate:   trip.buses?.bus_number || trip.buses?.plate_number || 'Unknown',
          route:   trip.buses?.route      || 'Unknown',
          lat:     gps?.lat ?? trip.current_lat  ?? DEFAULT_CENTER[0],
          lng:     gps?.lng ?? trip.current_lng  ?? DEFAULT_CENTER[1],
          passengers:       0,
          status:           'active',
          locationSource:   gps ? (gps.tripId ? gps.source : `${gps.source} (latest GPS)`) : 'fallback',
          locationUpdatedAt: gps?.recordedAt || trip.gps_updated_at || null,
          busId:   trip.bus_id,
          tripId:  trip.id,
        };
      });

      // ── GPS pin when no trip covers that location ────────────────────────
      const gpsPins: BusData[] = [];
      if (latestAny) {
        const covered = busMarkers.some(b => Math.abs(b.lat - latestAny.lat) < 0.0001 && Math.abs(b.lng - latestAny.lng) < 0.0001);
        if (!covered) {
          const pisBus = allBuses.find((b: any) => b.bus_number === 1);
          gpsPins.push({
            id: 'gps-live',
            plate: pisBus ? `Bus ${pisBus.bus_number}` : 'Live GPS',
            route: latestAny.tripId ? `Trip: ${latestAny.tripId.slice(0, 8)}…` : 'No active trip',
            lat: latestAny.lat, lng: latestAny.lng,
            passengers: 0, status: 'active',
            locationSource: `${latestAny.source} (live)`,
            locationUpdatedAt: latestAny.recordedAt,
            busId: pisBus?.id ?? null, tripId: latestAny.tripId,
          });
        }
      }

      // ── Inactive buses (no GPS) ──────────────────────────────────────────
      const activeTripBusIds = new Set(activeTrips.map((t: any) => t.bus_id));
      const inactiveBuses: BusData[] = allBuses
        .filter((b: any) => !activeTripBusIds.has(b.id))
        .map((b: any) => ({
          id: b.id, plate: b.plate_number, route: b.route,
          lat: DEFAULT_CENTER[0], lng: DEFAULT_CENTER[1],
          passengers: 0, status: b.status === 'maintenance' ? 'maintenance' : 'idle',
          locationSource: 'fallback', locationUpdatedAt: null,
          busId: b.id, tripId: null,
        }));

      // ── Passenger counts — single combined query by trip OR bus ──────────
      const tripIds  = activeTrips.map((t: any) => t.id).filter(Boolean);
      const busIds   = [...busMarkers.map(b => b.busId), ...gpsPins.map(p => p.busId)].filter(Boolean) as string[];

      let totalPassengers = 0;
      if (tripIds.length > 0 || busIds.length > 0) {
        // Fetch once, deduplicate by trip first then bus
        const { data: pcData } = await (supabase
          .from('passenger_counts')
          .select('trip_id, bus_id, count, ai_count, recorded_at')
          .or(
            [
              tripIds.length ? `trip_id.in.(${tripIds.join(',')})` : '',
              busIds.length  ? `bus_id.in.(${busIds.join(',')})` : '',
            ].filter(Boolean).join(',')
          )
          .order('recorded_at', { ascending: false })
          .limit(50) as any);

        const perTrip: Record<string, number> = {};
        const perBus:  Record<string, number> = {};
        for (const pc of (pcData || [])) {
          if (pc.trip_id && perTrip[pc.trip_id] === undefined) perTrip[pc.trip_id] = pc.ai_count ?? pc.count ?? 0;
          if (pc.bus_id  && perBus[pc.bus_id]   === undefined) perBus[pc.bus_id]   = pc.ai_count ?? pc.count ?? 0;
        }

        for (const bus of busMarkers) {
          const c = perTrip[bus.tripId!] ?? perBus[bus.busId!] ?? 0;
          bus.passengers = c; totalPassengers += c;
        }
        for (const pin of gpsPins) {
          pin.passengers = perBus[pin.busId!] ?? 0;
        }
      }

      setLatestGps(latestAny);
      setBuses([...busMarkers, ...gpsPins, ...inactiveBuses]);

      // ── Stats ─────────────────────────────────────────────────────────────
      const uniqueRoutes = [...new Set(allBuses.map((b: any) => b.route as string))];
      setStats({
        totalPassengers,
        activeBuses:      allBuses.filter((b: any) => b.status === 'active').length,
        totalRoutes:      uniqueRoutes.length,
        maintenanceBuses: allBuses.filter((b: any) => b.status === 'maintenance').length,
      });

      // ── Route polylines — use cache, only fetch once ──────────────────────
      const routeColors = ['#f97316', '#3b82f6', '#22c55e', '#a855f7', '#ef4444'];
      const coordsMap: Record<string, [number, number][]> = {};
      coordsMap['Manolo Fortich - Agora'] = await fetchRoute(MAIN_ROUTE.start, MAIN_ROUTE.end);
      for (const route of uniqueRoutes) {
        if (!coordsMap[route]) coordsMap[route] = coordsMap['Manolo Fortich - Agora'];
      }
      setRouteCoords(coordsMap);
      const display = uniqueRoutes.length > 0 ? uniqueRoutes : ['Manolo Fortich - Agora'];
      setRoutes(display.map((r, i) => ({ id: i + 1, name: r, color: routeColors[i % routeColors.length], path: coordsMap[r] || [] })));

    } catch (err) {
      console.error('[LiveMap] fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const scheduleFetch = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(fetchLiveMapData, DEBOUNCE_MS);
  }, [fetchLiveMapData]);

  useEffect(() => {
    fetchLiveMapData();

    const tripSub = supabase.channel('lm-trips')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trips' }, scheduleFetch)
      .subscribe();

    const gpsSub = supabase.channel('lm-gps')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'gps_locations' }, scheduleFetch)
      .subscribe();

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      tripSub.unsubscribe();
      gpsSub.unsubscribe();
    };
  }, [fetchLiveMapData, scheduleFetch]);

  const center = useMemo<[number, number]>(
    () => latestGps ? [latestGps.lat, latestGps.lng] : DEFAULT_CENTER,
    [latestGps]
  );

  const allRouteCoords = useMemo(
    () => Object.values(routeCoords).flat() as [number, number][],
    [routeCoords]
  );

  if (loading) return (
    <div className="space-y-6">
      <h1 className="text-white text-3xl font-bold">Live Map</h1>
      <p className="text-white/60">Loading GPS data…</p>
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-white text-3xl font-bold mb-2">Live Map</h1>
        <p className="text-white/60">Real-time GPS tracking of all buses</p>
        {latestGps && (
          <p className="text-white/40 text-sm mt-1">
            Last update: {new Date(latestGps.recordedAt).toLocaleString()} · {latestGps.lat.toFixed(6)}, {latestGps.lng.toFixed(6)}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard title="Total Passengers" value={livePassengerCount} icon={Users}        color="bg-blue-500"   />
        <SummaryCard title="Active Buses"      value={stats.activeBuses}  icon={Bus}          color="bg-green-500"  />
        <SummaryCard title="Total Routes"      value={stats.totalRoutes}  icon={Navigation}   color="bg-purple-500" />
        <SummaryCard title="Maintenance"       value={stats.maintenanceBuses} icon={AlertTriangle} color="bg-yellow-500" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3">
          <div className="glass-card p-4 h-[600px]">
            <MapContainer center={center} zoom={13} style={{ height: '100%', width: '100%' }}
              dragging={false} scrollWheelZoom={false} doubleClickZoom={false} touchZoom={false}>
              <MapRecenter center={center} />
              {allRouteCoords.length > 0 && (
                <MapRouteFitter coordinates={allRouteCoords} />
              )}
              <TileLayer attribution="" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              {routes.map(r => r.path.length > 0 && (
                <Polyline key={r.id} positions={r.path} color={r.color} weight={4} opacity={0.7} />
              ))}
              {buses.map(bus => (
                <BusMarker key={bus.id} bus={bus} liveCount={livePassengerCount} />
              ))}
            </MapContainer>
          </div>
        </div>

        <div className="space-y-4">
          {latestGps && (
            <div className="glass-card p-4 border border-green-500/20">
              <h3 className="text-white font-bold mb-3 flex items-center gap-2 text-sm">
                <div className="w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse" /> Live GPS
              </h3>
              <div className="space-y-1 text-xs">
                {[['Lat', latestGps.lat.toFixed(6)], ['Lng', latestGps.lng.toFixed(6)], ['Source', latestGps.source]].map(([k, v]) => (
                  <div key={k} className="flex justify-between">
                    <span className="text-white/50">{k}:</span>
                    <span className="text-white font-mono">{v}</span>
                  </div>
                ))}
                <div className="flex justify-between">
                  <span className="text-white/50">Updated:</span>
                  <span className="text-white">{new Date(latestGps.recordedAt).toLocaleTimeString()}</span>
                </div>
              </div>
            </div>
          )}

          <div className="glass-card p-4">
            <h3 className="text-white font-bold mb-3 flex items-center gap-2"><Bus className="text-orange-400 w-4 h-4" /> Buses</h3>
            <div className="space-y-2">
              {buses.length > 0 ? buses.map(bus => (
                <div key={bus.id} className={`bg-white/5 p-2.5 rounded-xl ${bus.id === 'gps-live' ? 'border border-green-400/40' : ''}`}>
                  <div className="flex justify-between items-start mb-1">
                    <div>
                      <p className="text-white font-medium text-xs">{bus.plate}</p>
                      <p className="text-white/50 text-xs">{bus.route}</p>
                    </div>
                    <span className={`w-2 h-2 rounded-full mt-1 ${bus.status === 'active' ? 'bg-green-400' : 'bg-gray-400'}`} />
                  </div>
                  <div className="flex items-center gap-1 text-white/60 text-xs">
                    <Users size={12} />
                    <span>{bus.status === 'active' ? livePassengerCount : bus.passengers} pax</span>
                  </div>
                </div>
              )) : <p className="text-white/50 text-sm">No active buses</p>}
            </div>
          </div>

          <div className="glass-card p-4">
            <h3 className="text-white font-bold mb-3 flex items-center gap-2 text-sm"><Navigation className="text-orange-400 w-4 h-4" /> Routes</h3>
            <div className="space-y-2">
              {routes.map(r => (
                <div key={r.id} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: r.color }} />
                  <span className="text-white/70 text-xs">{r.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Defined after LiveMap to avoid hoisting issues with gpsIcon
const MapRouteFitter = ({ coordinates }: { coordinates: [number, number][] }) => {
  const map = useMap();
  useEffect(() => {
    if (coordinates.length > 0) map.fitBounds(L.latLngBounds(coordinates), { padding: [50, 50] });
  }, [coordinates, map]);
  return null;
};

export default LiveMap;
