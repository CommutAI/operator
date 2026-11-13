import { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import {
  Bus, Users, DollarSign, Activity, AlertTriangle,
  Map as MapIcon, TrendingUp, Zap, Navigation, ArrowUp, ArrowDown, Video, RefreshCw, CheckCircle, ChevronLeft, ChevronRight,
  Wifi, Maximize2
} from 'lucide-react';
import { useBackendVideo } from '../hooks/useBackendVideo';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix for default marker icons in Leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// Hide Leaflet attribution
if (!document.getElementById('leaflet-attribution-hide')) {
  const style = document.createElement('style');
  style.id = 'leaflet-attribution-hide';
  style.textContent = `
    .leaflet-control-attribution {
      display: none !important;
    }
  `;
  document.head.appendChild(style);
}

interface KPICard {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: any;
  color: string;
  trend?: string;
  highlight?: boolean;
}

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
        (coord: [number, number]) => [coord[1], coord[0]]
      );
    }
  } catch (error) {
    console.error('Error fetching route:', error);
  }
  
  return [startCoords, endCoords];
};

const BusMarker = ({ bus, liveCount }: { bus: any; liveCount?: number }) => {
  const displayPassengers = (bus.status === 'active' && typeof liveCount === 'number' && liveCount > 0)
    ? Math.max(bus.passengers || 0, liveCount)
    : (bus.passengers || 0);

  return (
    <Marker position={[bus.lat, bus.lng]}>
      <Popup>
        <div className="p-2 min-w-[180px]">
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
            <span className="text-sm font-medium">{displayPassengers} passenger{displayPassengers !== 1 ? 's' : ''}</span>
          </div>
          <span className={`inline-block px-2 py-1 rounded text-xs mt-2 ${bus.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
            {bus.status}
          </span>
        </div>
      </Popup>
    </Marker>
  );
};

export default function Dashboard() {
  const [kpiData, setKpiData] = useState({
    activeBuses: 0,
    totalBuses: 0,
    activeTrips: 0,
    currentPassengers: 0,
    totalPassengersAllTime: 0,
    totalFaresAllTime: 0,
    activeIrregularities: 0,
    busesOnline: 0,
  });

  const [revenueData, setRevenueData] = useState<any[]>([]);
  const [activeTrips, setActiveTrips] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [irregularities, setIrregularities] = useState<any[]>([]);
  const [mapBuses, setMapBuses] = useState<any[]>([]);
  const [mapRoutes, setMapRoutes] = useState<any[]>([]);
  const [routeCoordinates, setRouteCoordinates] = useState<Record<string, [number, number][]>>({});
  const [mapStats, setMapStats] = useState({
    totalPassengers: 0,
    activeBuses: 0,
    totalRoutes: 0,
  });
  const [tripsSortColumn, setTripsSortColumn] = useState<'started_at' | 'bus_number' | 'route'>('started_at');
  const [tripsSortDirection, setTripsSortDirection] = useState<'asc' | 'desc'>('desc');
  const [irregularitiesPage, setIrregularitiesPage] = useState(0);
  const irregularitiesPerPage = 5;

  // Backend video streaming
  const {
    isStreaming: videoStreaming,
    passengerCount: videoPassengerCount,
    connectionStatus: videoConnectionStatus,
    connectionMessage: videoConnectionMessage,
    videoRef,
    refresh: videoRefresh,
  } = useBackendVideo({ autoConnect: true });

  const videoContainerRef = useRef<HTMLDivElement>(null);
  const toggleFullscreen = () => {
    if (!videoContainerRef.current) return;
    if (!document.fullscreenElement) {
      videoContainerRef.current.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  // Synchronize live camera detection passenger count with map markers and stats in real time
  useEffect(() => {
    if (videoPassengerCount > 0) {
      setMapBuses(prev => prev.map(bus => {
        if (bus.status === 'active') {
          return { ...bus, passengers: Math.max(bus.passengers || 0, videoPassengerCount) };
        }
        return bus;
      }));
      setMapStats(prev => ({
        ...prev,
        totalPassengers: Math.max(prev.totalPassengers || 0, videoPassengerCount)
      }));
    }
  }, [videoPassengerCount]);

  // Debounce ref for real-time updates
  const dashboardDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gpsDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetchDashboardData();

    // Debounced fetch to prevent flooding during traffic spikes
    const debouncedFetch = () => {
      if (dashboardDebounceRef.current) clearTimeout(dashboardDebounceRef.current);
      dashboardDebounceRef.current = setTimeout(() => {
        void fetchDashboardData();
      }, 2000); // 2 second debounce
    };

    const debouncedGpsFetch = () => {
      if (gpsDebounceRef.current) clearTimeout(gpsDebounceRef.current);
      gpsDebounceRef.current = setTimeout(() => {
        fetchLiveMapData();
      }, 1500); // 1.5 second debounce for GPS (higher frequency)
    };

    // @ts-ignore - Supabase callback type issue with async functions
    const subscription = supabase
      .channel('dashboard-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trips' }, debouncedFetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'emergency_alerts' }, debouncedFetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fare_irregularities' }, debouncedFetch)
      .subscribe();

    const gpsSubscription = supabase
      .channel('dashboard-gps-channel')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'gps_locations' }, debouncedGpsFetch)
      .subscribe();

    return () => {
      if (dashboardDebounceRef.current) clearTimeout(dashboardDebounceRef.current);
      if (gpsDebounceRef.current) clearTimeout(gpsDebounceRef.current);
      subscription.unsubscribe();
      gpsSubscription.unsubscribe();
    };
  }, []);

  const fetchDashboardData = async () => {
    try {
      // Fetch buses
      const { data: buses } = await supabase
        .from('buses')
        .select('status');

      const activeBuses = buses?.filter(b => b.status === 'active').length || 0;
      const totalBuses = buses?.length || 0;

      // Fetch active trips without join first - optimized with limit
      const { data: trips } = await supabase
        .from('trips')
        .select('*')
        .eq('status', 'in_progress')
        .order('started_at', { ascending: false })
        .limit(10);

      // Fetch buses separately and merge
      let tripsWithBuses = trips || [];
      if (trips && trips.length > 0) {
        const busIds = trips.map(t => t.bus_id).filter(Boolean);
        const { data: buses } = await supabase
          .from('buses')
          .select('id, bus_number, plate_number, route')
          .in('id', busIds);
        const busesMap = new Map((buses || []).map(b => [b.id, b]));
        tripsWithBuses = trips.map(trip => ({
          ...trip,
          buses: busesMap.get(trip.bus_id)
        }));
      }

      setActiveTrips(tripsWithBuses);

      // Use count query instead of fetching all records - prevents memory issues
      const { count: currentPassengersCount } = await supabase
        .from('boarded_passengers')
        .select('*', { count: 'exact', head: true });

      const currentPassengers = currentPassengersCount || 0;

      // Use aggregation query for total fares - more efficient
      const { data: fareAgg } = await supabase
        .from('transactions')
        .select('amount')
        .limit(1000);

      const totalFaresAllTime = fareAgg?.reduce((sum, t) => sum + (Number(t.amount) || 0), 0) || 0;

      // Fetch fare irregularities without join first - limited
      const { data: irregularities } = await supabase
        .from('fare_irregularities')
        .select('*')
        .eq('resolved', false)
        .order('detected_at', { ascending: false })
        .limit(20);

      // Fetch trips and buses for irregularities
      let irregularitiesWithInfo = irregularities || [];
      if (irregularities && irregularities.length > 0) {
        const tripIds = irregularities.map(i => i.trip_id).filter(Boolean);
        const { data: trips } = await supabase
          .from('trips')
          .select('id, bus_id')
          .in('id', tripIds);
        const tripsMap = new Map((trips || []).map(t => [t.id, t]));

        const busIds = (trips || []).map(t => t.bus_id).filter(Boolean);
        const { data: buses } = await supabase
          .from('buses')
          .select('id, bus_number, plate_number')
          .in('id', busIds);
        const busesMap = new Map((buses || []).map(b => [b.id, b]));

        irregularitiesWithInfo = irregularities.map(irregularity => {
          const trip = tripsMap.get(irregularity.trip_id);
          const bus = trip ? busesMap.get(trip.bus_id) : null;
          return {
            ...irregularity,
            trips: trip ? { ...trip, buses: bus } : null
          };
        });
      }

      setIrregularities(irregularitiesWithInfo);

      // Fetch emergency alerts - limited
      const { data: emergencyAlerts } = await supabase
        .from('emergency_alerts')
        .select('*')
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(3);

      // Count buses with recent GPS updates (last 5 minutes)
      let busesOnline = 0;
      try {
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        const { data: tripsWithGPS } = await supabase
          .from('trips')
          .select('id')
          .eq('status', 'in_progress')
          .gte('gps_updated_at', fiveMinutesAgo.toISOString());
        busesOnline = tripsWithGPS?.length || 0;
      } catch (error) {
        // If gps_updated_at column doesn't exist, count all active trips
        const { data: activeTripsCount } = await supabase
          .from('trips')
          .select('id')
          .eq('status', 'in_progress');
        busesOnline = activeTripsCount?.length || 0;
      }

      // Fetch chart data - last 7 days revenue with limit
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const { data: chartTransactions } = await supabase
        .from('transactions')
        .select('amount, type, created_at')
        .gte('created_at', sevenDaysAgo.toISOString())
        .order('created_at', { ascending: true })
        .limit(500);

      // Group revenue by date
      const revenueByDate: Record<string, any> = {};
      (chartTransactions || []).forEach((tx: any) => {
        const date = new Date(tx.created_at).toLocaleDateString();
        if (!revenueByDate[date]) {
          revenueByDate[date] = { date, fare: 0, baggage: 0, total: 0 };
        }
        const amount = Number(tx.amount);
        if (tx.type === 'fare') revenueByDate[date].fare += amount;
        if (tx.type === 'baggage') revenueByDate[date].baggage += amount;
        revenueByDate[date].total += amount;
      });

      setRevenueData(Object.values(revenueByDate));

      setKpiData({
        activeBuses,
        totalBuses,
        activeTrips: trips?.length || 0,
        currentPassengers,
        totalPassengersAllTime: currentPassengers,
        totalFaresAllTime: totalFaresAllTime,
        activeIrregularities: irregularities?.length || 0,
        busesOnline,
      });

      setAlerts(emergencyAlerts || []);

      // Fetch live map data
      await fetchLiveMapData();
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    }
  };

  const fetchLiveMapData = async () => {
    try {
      // Fetch active trips without join first
      const { data: activeTrips } = await supabase
        .from('trips')
        .select('*')
        .eq('status', 'in_progress')
        .order('started_at', { ascending: false });

      // Fetch buses separately
      const { data: allBuses } = await supabase
        .from('buses')
        .select('*');

      // Fetch buses for active trips
      let tripsWithBuses = activeTrips || [];
      if (activeTrips && activeTrips.length > 0) {
        const busIds = activeTrips.map(t => t.bus_id).filter(Boolean);
        const { data: buses } = await supabase
          .from('buses')
          .select('id, bus_number, plate_number, route')
          .in('id', busIds);
        const busesMap = new Map((buses || []).map(b => [b.id, b]));
        tripsWithBuses = activeTrips.map(trip => ({
          ...trip,
          buses: busesMap.get(trip.bus_id)
        }));
      }

      const { data: gpsRows } = await (supabase
        .from('gps_locations')
        .select('trip_id, latitude, longitude, source, recorded_at')
        .order('recorded_at', { ascending: false })
        .limit(100) as any);

      const latestGpsByTripId: Record<string, any> = {};
      let latestGpsAny: any = null;
      (gpsRows || []).forEach((row: any) => {
        const gps = {
          lat: parseFloat(row.latitude),
          lng: parseFloat(row.longitude),
          source: row.source || 'gps',
          recordedAt: row.recorded_at,
          tripId: row.trip_id || null
        };

        if (!Number.isFinite(gps.lat) || !Number.isFinite(gps.lng)) return;
        if (!latestGpsAny) latestGpsAny = gps;
        if (row.trip_id && !latestGpsByTripId[row.trip_id]) {
          latestGpsByTripId[row.trip_id] = gps;
        }
      });

      // Transform trips to bus markers
      const busMarkers = (tripsWithBuses || []).map((trip: any, index: number) => {
        const gps = latestGpsByTripId[trip.id] || latestGpsAny;

        // Accept any GPS row — Pi sends GPS without trip_id when no trip is active
        const isValidGps = gps && Number.isFinite(gps.lat) && Number.isFinite(gps.lng) && gps.lat !== 0 && gps.lng !== 0;
        const lat = isValidGps ? gps.lat : 8.41255083;
        const lng = isValidGps ? gps.lng : 124.81642417;

        return {
          id: trip.id,
          plate: trip.buses?.bus_number ? String(trip.buses.bus_number) : (trip.buses?.plate_number || 'Unknown'),
          route: trip.buses?.route || 'Unknown',
          lat: lat,
          lng: lng,
          passengers: 0,
          status: 'active',
          locationSource: gps ? (gps.tripId ? gps.source : `${gps.source} (latest GPS)`) : 'fallback',
          locationUpdatedAt: gps?.recordedAt || trip.gps_updated_at || null,
          busId: trip.bus_id,
          tripId: trip.id
        };
      });

      // Always show active bus with live GPS position even when no trip is currently in progress
      if (busMarkers.length === 0) {
        const activeBus = (allBuses || []).find((b: any) => b.status === 'active')
          || (allBuses || []).find((b: any) => b.bus_number === 1001)
          || (allBuses || [])[0];

        if (activeBus) {
          const isValidGps = latestGpsAny && Number.isFinite(latestGpsAny.lat) && Number.isFinite(latestGpsAny.lng) && latestGpsAny.lat !== 0 && latestGpsAny.lng !== 0;
          const lat = isValidGps ? latestGpsAny.lat : 8.41255083;
          const lng = isValidGps ? latestGpsAny.lng : 124.81642417;

          busMarkers.push({
            id: activeBus.id || 'bus-live-gps',
            plate: activeBus.bus_number ? String(activeBus.bus_number) : (activeBus.plate_number || '1001'),
            route: activeBus.route || 'Manolo Fortich Terminal ↔ Agora Terminal',
            lat: lat,
            lng: lng,
            passengers: 0,
            status: 'active',
            locationSource: latestGpsAny ? `${latestGpsAny.source} (latest GPS)` : 'fallback',
            locationUpdatedAt: latestGpsAny?.recordedAt || null,
            busId: activeBus.id,
            tripId: null
          });
        }
      }

      // Fetch passenger counts from both passenger_counts and boarded_passengers
      const tripIds = (activeTrips || []).map((t: any) => t.id).filter(Boolean);
      const busIds = (allBuses || []).map((b: any) => b.id).filter(Boolean);
      let totalPassengers = 0;

      const [bpRes, pcRes] = await Promise.all([
        tripIds.length > 0
          ? supabase.from('boarded_passengers').select('trip_id').in('trip_id', tripIds)
          : Promise.resolve({ data: [] }),
        (tripIds.length > 0 || busIds.length > 0)
          ? (supabase
              .from('passenger_counts')
              .select('trip_id, bus_id, count, ai_count, recorded_at')
              .order('recorded_at', { ascending: false })
              .limit(50) as any)
          : Promise.resolve({ data: [] }),
      ]);

      const passengerCountsByTrip: Record<string, number> = {};
      const passengerCountsByBus: Record<string, number> = {};

      (pcRes.data || []).forEach((pc: any) => {
        const count = pc.ai_count ?? pc.count ?? 0;
        if (pc.trip_id && passengerCountsByTrip[pc.trip_id] === undefined) {
          passengerCountsByTrip[pc.trip_id] = count;
        }
        if (pc.bus_id && passengerCountsByBus[pc.bus_id] === undefined) {
          passengerCountsByBus[pc.bus_id] = count;
        }
      });

      (bpRes.data || []).forEach((bp: any) => {
        passengerCountsByTrip[bp.trip_id] = Math.max(
          passengerCountsByTrip[bp.trip_id] || 0,
          (passengerCountsByTrip[bp.trip_id] || 0) + 1
        );
      });

      busMarkers.forEach((bus: any) => {
        const dbCount = passengerCountsByTrip[bus.tripId] ?? passengerCountsByBus[bus.busId] ?? 0;
        const liveCount = (bus.status === 'active' && videoPassengerCount > 0)
          ? Math.max(dbCount, videoPassengerCount)
          : dbCount;
        bus.passengers = liveCount;
        totalPassengers += liveCount;
      });

      // Show active buses / live GPS bus markers
      setMapBuses(busMarkers as any);

      // Calculate stats
      const uniqueRoutes = [...new Set((allBuses || []).map((b: any) => b.route))];
      const activeBusesCount = (allBuses || []).filter((b: any) => b.status === 'active').length;

      setMapStats({
        totalPassengers: Math.max(totalPassengers, videoPassengerCount || 0),
        activeBuses: Math.max(activeBusesCount, busMarkers.length),
        totalRoutes: uniqueRoutes.length || 1,
      });

      const routeColors = ['#f97316', '#3b82f6', '#22c55e', '#a855f7', '#ef4444'];
      
      // Generate route coordinates for unique routes
      const routeCoordsMap: Record<string, [number, number][]> = {};
      
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
      
      setMapRoutes(routesToDisplay.map((route: any, index: number) => ({
        id: index + 1,
        name: route,
        color: routeColors[index % routeColors.length],
        path: routeCoordsMap[route] || routeCoordsMap['Manolo Fortich - Agora'] || []
      })));

    } catch (error) {
      console.error('Error fetching live map data:', error);
    }
  };

  const sortedTrips = [...activeTrips].sort((a, b) => {
    let comparison = 0;
    switch (tripsSortColumn) {
      case 'started_at':
        comparison = new Date(a.started_at).getTime() - new Date(b.started_at).getTime();
        break;
      case 'bus_number':
        comparison = (a.buses?.bus_number || '').localeCompare(b.buses?.bus_number || '');
        break;
      case 'route':
        comparison = (a.buses?.route || '').localeCompare(b.buses?.route || '');
        break;
    }
    return tripsSortDirection === 'asc' ? comparison : -comparison;
  });

  const handleTripsSort = (column: typeof tripsSortColumn) => {
    if (tripsSortColumn === column) {
      setTripsSortDirection(tripsSortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setTripsSortColumn(column);
      setTripsSortDirection('asc');
    }
  };

  const handleResolveAlert = async (alertId: string) => {
    try {
      const { error } = await supabase
        .from('emergency_alerts')
        .update({
          status: 'resolved',
          resolved_at: new Date().toISOString()
        })
        .eq('id', alertId);

      if (error) throw error;

      // Refresh alerts
      await fetchDashboardData();
    } catch (error) {
      console.error('Error resolving alert:', error);
      // Use toast notification instead of alert
      const { toast } = await import('react-hot-toast');
      toast.error('Error resolving alert');
    }
  };

  const handleResolveIrregularity = async (irregularityId: string) => {
    try {
      const { error } = await supabase
        .from('fare_irregularities')
        .update({
          resolved: true,
          resolved_at: new Date().toISOString()
        })
        .eq('id', irregularityId);

      if (error) throw error;

      // Refresh dashboard data
      await fetchDashboardData();
    } catch (error) {
      console.error('Error resolving irregularity:', error);
      const { toast } = await import('react-hot-toast');
      toast.error('Error resolving irregularity');
    }
  };

  const kpiCards: KPICard[] = [
    {
      title: 'Active Buses',
      value: `${kpiData.activeBuses} / ${kpiData.totalBuses}`,
      subtitle: `${kpiData.busesOnline} online with GPS`,
      icon: Bus,
      color: 'text-orange-400',
      trend: 'Live',
    },
    {
      title: 'Passengers On Board',
      value: kpiData.currentPassengers,
      subtitle: `${kpiData.totalPassengersAllTime} total all time`,
      icon: Users,
      color: 'text-blue-400',
      trend: 'Real-time',
    },
    {
      title: 'Total Revenue',
      value: `₱${kpiData.totalFaresAllTime.toLocaleString()}`,
      subtitle: 'Fare & baggage fees (all time)',
      icon: DollarSign,
      color: 'text-green-400',
      trend: '+12%',
      highlight: true,
    },
    {
      title: 'Active Alerts',
      value: kpiData.activeIrregularities,
      subtitle: 'Requires attention',
      icon: AlertTriangle,
      color: 'text-red-400',
      trend: kpiData.activeIrregularities > 0 ? '⚠️' : 'Clear',
    },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Dashboard</h1>
          <p className="text-white/60">Dashboard overview</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-white/60">
          <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          <span>Live</span>
        </div>
      </div>

      {/* Hero KPI Cards - 4 Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map((kpi, index) => {
          const Icon = kpi.icon;
          return (
            <div
              key={index}
              className={`glass-card p-6 hover:bg-white/10 transition-all duration-300 ${
                kpi.highlight
                  ? 'ring-2 ring-yellow-400/50 ring-offset-2 ring-offset-black bg-gradient-to-br from-yellow-500/10 to-transparent'
                  : ''
              }`}
            >
              <div className="flex items-start justify-between mb-4">
                <div className={`p-3 rounded-xl bg-white/10 ${kpi.color}`}>
                  <Icon size={20} />
                </div>
                {kpi.trend && (
                  <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                    kpi.trend === '⚠️' ? 'bg-red-500/20 text-red-400' :
                    kpi.trend.startsWith('+') ? 'bg-green-500/20 text-green-400' :
                    'bg-blue-500/20 text-blue-400'
                  }`}>
                    {kpi.trend}
                  </span>
                )}
              </div>
              <h3 className="text-white/70 text-sm font-medium mb-2">{kpi.title}</h3>
              <p className="text-white text-3xl font-bold mb-1">{kpi.value}</p>
              {kpi.subtitle && (
                <p className="text-white/50 text-xs">{kpi.subtitle}</p>
              )}
            </div>
          );
        })}
      </div>

      {/* Video Monitoring - Split Pane Widget */}
      <div className="glass-card overflow-hidden border border-white/10 rounded-2xl shadow-2xl">
        {/* Split Pane Header */}
        <div className="px-5 py-3.5 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
          <div className="flex items-center gap-2">
            <Video className="text-orange-400" size={18} />
            <h2 className="text-base lg:text-lg font-bold text-white tracking-wide">Video Monitoring</h2>
            <span className="text-[11px] font-mono text-white/40 hidden sm:inline">• Bus #1 Telematics</span>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-xs">
              <div className={`w-2 h-2 rounded-full ${videoStreaming ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
              <span className="text-white/80 capitalize font-medium">{videoStreaming ? 'Live Stream' : videoConnectionStatus}</span>
            </div>
            <button
              onClick={videoRefresh}
              className="bg-white/10 hover:bg-white/20 text-white p-1.5 rounded-lg transition-colors border border-white/10"
              title="Refresh stream"
            >
              <RefreshCw size={13} />
            </button>
          </div>
        </div>

        {/* Split Pane Body (Left: Compact Video Stream, Right: Telematics Grid) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-white/10 items-stretch">
          {/* Left Pane: Compact 4:3 Live Camera Stream */}
          <div className="lg:col-span-5 p-3.5 sm:p-4 flex flex-col justify-center items-center bg-black/30">
            <div
              ref={videoContainerRef}
              className="relative w-full max-w-[420px] aspect-[4/3] max-h-[315px] bg-gradient-to-b from-zinc-950 via-black to-zinc-950 rounded-xl overflow-hidden border border-white/15 shadow-xl flex items-center justify-center group"
            >
              {/* Live Image Frame */}
              <img
                ref={videoRef}
                alt="Live camera stream"
                className={`w-full h-full object-cover transition-opacity duration-300 ${
                  videoStreaming ? 'opacity-100 block' : 'opacity-0 hidden'
                }`}
              />

              {/* Offline / Connecting State */}
              {!videoStreaming && (
                <div className="absolute inset-0 flex items-center justify-center p-6 bg-gradient-to-b from-black/80 via-black/90 to-black/95">
                  <div className="text-center max-w-sm">
                    <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-2 shadow-inner">
                      {videoConnectionStatus === 'connecting' ? (
                        <RefreshCw className="w-6 h-6 text-orange-400 animate-spin" />
                      ) : (
                        <Video className="w-6 h-6 text-white/30" />
                      )}
                    </div>
                    <p className="text-white font-semibold text-xs sm:text-sm mb-0.5">
                      {videoConnectionStatus === 'connecting' ? 'Connecting to camera…' : 'Camera Stream Offline'}
                    </p>
                    <p className="text-white/40 text-[10px] sm:text-[11px] mb-2.5 leading-relaxed">
                      {videoConnectionMessage || 'Waiting for live frames from Raspberry Pi camera.'}
                    </p>
                    <button
                      onClick={videoRefresh}
                      className="px-3 py-1 bg-orange-500/20 hover:bg-orange-500/30 text-orange-300 border border-orange-500/30 rounded-xl text-xs font-medium transition-all flex items-center gap-1.5 mx-auto active:scale-95"
                    >
                      <RefreshCw size={11} />
                      Reconnect Feed
                    </button>
                  </div>
                </div>
              )}

              {/* Top HUD Overlay */}
              <div className="absolute top-2 inset-x-2 flex items-center justify-between pointer-events-none z-10">
                <div className="flex items-center gap-1.5">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold backdrop-blur-md flex items-center gap-1 shadow-lg border ${
                    videoStreaming
                      ? 'bg-red-500/85 text-white border-red-400/40'
                      : 'bg-black/70 text-white/60 border-white/10'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${videoStreaming ? 'bg-white animate-pulse' : 'bg-red-400'}`} />
                    {videoStreaming ? 'LIVE' : 'OFFLINE'}
                  </span>
                  <span className="bg-black/70 backdrop-blur-md border border-white/10 text-white/90 text-[10px] px-2 py-0.5 rounded-full font-medium shadow-md">
                    Bus #1 • Interior
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="bg-black/70 backdrop-blur-md border border-white/10 text-white text-[10px] px-2 py-0.5 rounded-full font-bold flex items-center gap-1 shadow-lg">
                    <Users size={11} className="text-orange-400" />
                    <span>{videoPassengerCount} Detected</span>
                  </span>
                  <button
                    onClick={toggleFullscreen}
                    className="pointer-events-auto bg-black/70 hover:bg-black/90 backdrop-blur-md border border-white/10 text-white/80 hover:text-white p-1 rounded-full transition-all"
                    title="Fullscreen"
                  >
                    <Maximize2 size={11} />
                  </button>
                </div>
              </div>

              {/* Bottom HUD Overlay */}
              <div className="absolute bottom-2 inset-x-2 flex items-center justify-between pointer-events-none z-10 text-[9px] sm:text-[10px] text-white/80">
                <div className="bg-black/70 backdrop-blur-md border border-white/10 px-2 py-0.5 rounded-full flex items-center gap-1 shadow-md">
                  <Activity size={10} className="text-emerald-400" />
                  <span className="font-mono">AI: YOLOv8n</span>
                  <span className="text-white/40">•</span>
                  <span className="text-white/60">640×480 (4:3)</span>
                </div>
                <div className="bg-black/70 backdrop-blur-md border border-white/10 px-2 py-0.5 rounded-full flex items-center gap-1 shadow-md">
                  <Wifi size={10} className={videoStreaming ? 'text-green-400' : 'text-white/40'} />
                  <span className="font-medium capitalize">{videoStreaming ? '30 FPS' : videoConnectionStatus}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Pane: Compact Telematics & Controls */}
          <div className="lg:col-span-7 p-3.5 sm:p-4 lg:p-5 flex flex-col justify-center gap-3 bg-white/[0.01]">
            {/* Row 1: Occupancy Hero Card + Pipeline Overview */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Bus Occupancy Card */}
              <div className="glass-card p-3 sm:p-3.5 rounded-xl border border-white/10 flex flex-col justify-between min-h-[105px]">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <Users size={14} className="text-orange-400" />
                    <span className="text-white/70 text-xs font-semibold uppercase tracking-wider">Bus Occupancy</span>
                  </div>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                    videoPassengerCount > 25
                      ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                      : videoPassengerCount > 10
                      ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30'
                      : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  }`}>
                    {videoPassengerCount > 25 ? 'Near Capacity' : videoPassengerCount > 10 ? 'Moderate' : 'Low Occupancy'}
                  </span>
                </div>

                <div className="flex items-baseline justify-between mb-1.5">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">{videoPassengerCount}</span>
                    <span className="text-white/50 text-xs font-medium">/ 30 seats</span>
                  </div>
                  <span className="text-[11px] text-white/50 font-medium">
                    {30 - videoPassengerCount} left
                  </span>
                </div>

                {/* Progress Bar */}
                <div className="w-full bg-white/10 h-2 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      videoPassengerCount > 25 ? 'bg-red-500' : videoPassengerCount > 10 ? 'bg-yellow-400' : 'bg-emerald-400'
                    }`}
                    style={{ width: `${Math.min(100, (videoPassengerCount / 30) * 100)}%` }}
                  />
                </div>
              </div>

              {/* AI Detection Pipeline Overview */}
              <div className="glass-card p-3 sm:p-3.5 rounded-xl border border-white/10 flex flex-col justify-between min-h-[105px]">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <Activity size={14} className="text-orange-400" />
                    <span className="text-white/70 text-xs font-semibold uppercase tracking-wider">Detection Pipeline</span>
                  </div>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                    Real-time Active
                  </span>
                </div>
                <div>
                  <div className="text-white font-semibold text-xs sm:text-sm">YOLOv8 Nano Neural Net</div>
                  <div className="text-white/50 text-[11px] mt-0.5">Automated Bounding & Occupancy Tally</div>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-white/60 pt-1 border-t border-white/5">
                  <span className="text-emerald-400 font-medium">Conf &gt; 0.50</span>
                  <span>•</span>
                  <span>30 FPS</span>
                  <span>•</span>
                  <span>640×480 (4:3)</span>
                </div>
              </div>
            </div>

            {/* Row 2: 4 Telemetry Cards in a Row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-2.5">
              <div className="glass-card p-2.5 rounded-xl border border-white/10 flex flex-col justify-between min-h-[64px]">
                <div className="flex items-center gap-1.5 text-white/50 text-[11px] mb-0.5">
                  <Activity size={12} className="text-blue-400 shrink-0" />
                  <span className="truncate">AI Model</span>
                </div>
                <div>
                  <div className="text-white font-semibold text-xs sm:text-sm truncate">YOLOv8n ONNX</div>
                  <div className="text-emerald-400 text-[10px] mt-0.5 flex items-center gap-1 truncate">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Active
                  </div>
                </div>
              </div>

              <div className="glass-card p-2.5 rounded-xl border border-white/10 flex flex-col justify-between min-h-[64px]">
                <div className="flex items-center gap-1.5 text-white/50 text-[11px] mb-0.5">
                  <Video size={12} className="text-purple-400 shrink-0" />
                  <span className="truncate">Resolution</span>
                </div>
                <div>
                  <div className="text-white font-semibold text-xs sm:text-sm truncate">640×480 (4:3)</div>
                  <div className="text-white/50 text-[10px] mt-0.5 truncate">Native Sensor</div>
                </div>
              </div>

              <div className="glass-card p-2.5 rounded-xl border border-white/10 flex flex-col justify-between min-h-[64px]">
                <div className="flex items-center gap-1.5 text-white/50 text-[11px] mb-0.5">
                  <Wifi size={12} className="text-green-400 shrink-0" />
                  <span className="truncate">Latency</span>
                </div>
                <div>
                  <div className="text-white font-semibold text-xs sm:text-sm truncate">&lt; 100 ms</div>
                  <div className="text-white/50 text-[10px] mt-0.5 truncate">WebSocket Live</div>
                </div>
              </div>

              <div className="glass-card p-2.5 rounded-xl border border-white/10 flex flex-col justify-between min-h-[64px]">
                <div className="flex items-center gap-1.5 text-white/50 text-[11px] mb-0.5">
                  <CheckCircle size={12} className="text-orange-400 shrink-0" />
                  <span className="truncate">Stream State</span>
                </div>
                <div>
                  <div className="text-white font-semibold text-xs sm:text-sm capitalize truncate">
                    {videoStreaming ? 'Active' : videoConnectionStatus}
                  </div>
                  <div className="text-white/50 text-[10px] mt-0.5 truncate">Bus #1 Telematics</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Live Map - Embedded */}
      <div className="glass-card p-4 lg:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-3">
          <h2 className="text-lg lg:text-xl font-bold text-white flex items-center gap-2">
            <MapIcon className="text-blue-400" size={20} />
            Live Bus Tracking
          </h2>
          <div className="flex items-center gap-3 lg:gap-4 text-xs sm:text-sm">
            <div className="flex items-center gap-2 text-white/70">
              <Navigation size={14} />
              <span>{mapStats.totalRoutes} Routes</span>
            </div>
            <div className="flex items-center gap-2 text-white/70">
              <Bus size={14} />
              <span>{mapStats.activeBuses} Active</span>
            </div>
            <div className="flex items-center gap-2 text-white/70">
              <Users size={14} />
              <span>{mapStats.totalPassengers} Passengers</span>
            </div>
          </div>
        </div>

        <div className="h-[400px] sm:h-[500px] rounded-xl overflow-hidden">
          <MapContainer
            center={mapBuses.length > 0 && mapBuses[0].lat ? [mapBuses[0].lat, mapBuses[0].lng] : [8.41255, 124.81642]}
            zoom={13}
            style={{ height: '100%', width: '100%' }}
            dragging={true}
            scrollWheelZoom={true}
          >
            <MapRecenter center={mapBuses.length > 0 && mapBuses[0].lat ? [mapBuses[0].lat, mapBuses[0].lng] : [8.41255, 124.81642]} />
            {Object.values(routeCoordinates).flat().length > 0 && (
              <MapRouteFitter coordinates={Object.values(routeCoordinates).flat()} />
            )}
            <TileLayer
              attribution=""
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {mapRoutes.map((route: any) => (
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
            {mapBuses.map((bus: any) => (
              <BusMarker key={bus.id} bus={bus} liveCount={videoPassengerCount} />
            ))}
          </MapContainer>
        </div>
      </div>

      {/* Active Trips & Revenue */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
        {/* Active Trips List */}
        <div className="lg:col-span-2 glass-card p-4 lg:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 lg:mb-6 gap-3">
            <h2 className="text-lg lg:text-xl font-bold text-white flex items-center gap-2">
              <Activity className="text-orange-400" size={20} />
              Active Trips
            </h2>
            <div className="flex items-center gap-2 lg:gap-4">
              <span className="text-white/60 text-xs lg:text-sm">{kpiData.activeTrips} in progress</span>
              <div className="flex items-center gap-1 lg:gap-2">
                <button
                  onClick={() => handleTripsSort('bus_number')}
                  className={`text-xs px-2 py-1 rounded transition-colors ${
                    tripsSortColumn === 'bus_number'
                      ? 'bg-orange-500/20 text-orange-400'
                      : 'bg-white/10 text-white/60 hover:bg-white/20'
                  }`}
                >
                  Bus
                  {tripsSortColumn === 'bus_number' && (
                    tripsSortDirection === 'asc' ? <ArrowUp size={12} className="inline ml-1" /> : <ArrowDown size={12} className="inline ml-1" />
                  )}
                </button>
                <button
                  onClick={() => handleTripsSort('route')}
                  className={`text-xs px-2 py-1 rounded transition-colors ${
                    tripsSortColumn === 'route'
                      ? 'bg-orange-500/20 text-orange-400'
                      : 'bg-white/10 text-white/60 hover:bg-white/20'
                  }`}
                >
                  Route
                  {tripsSortColumn === 'route' && (
                    tripsSortDirection === 'asc' ? <ArrowUp size={12} className="inline ml-1" /> : <ArrowDown size={12} className="inline ml-1" />
                  )}
                </button>
                <button
                  onClick={() => handleTripsSort('started_at')}
                  className={`text-xs px-2 py-1 rounded transition-colors ${
                    tripsSortColumn === 'started_at'
                      ? 'bg-orange-500/20 text-orange-400'
                      : 'bg-white/10 text-white/60 hover:bg-white/20'
                  }`}
                >
                  Time
                  {tripsSortColumn === 'started_at' && (
                    tripsSortDirection === 'asc' ? <ArrowUp size={12} className="inline ml-1" /> : <ArrowDown size={12} className="inline ml-1" />
                  )}
                </button>
              </div>
            </div>
          </div>

          {sortedTrips.length > 0 ? (
            <div className="space-y-3">
              {sortedTrips.map((trip: any) => (
                <div key={trip.id} className="bg-white/5 rounded-xl p-3 lg:p-4 border border-white/10 hover:bg-white/10 transition-colors">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 lg:gap-3">
                      <div className="p-2 rounded-lg bg-orange-500/20">
                        <Bus className="text-orange-400" size={16} />
                      </div>
                      <div>
                        <p className="text-white font-medium text-sm lg:text-base">Bus #{trip.buses?.bus_number || 'N/A'}</p>
                        <p className="text-white/60 text-xs">{trip.buses?.route || 'Unknown Route'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                      <span className="text-green-400 text-xs font-medium">Live</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs text-white/50">
                    <span>Started: {new Date(trip.started_at).toLocaleTimeString()}</span>
                    <span>Duration: {Math.round((Date.now() - new Date(trip.started_at).getTime()) / 60000)}m</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <Activity className="text-white/20 mx-auto mb-3" size={48} />
              <p className="text-white/40">No active trips</p>
            </div>
          )}
        </div>

        {/* Revenue Trend Chart */}
        <div className="glass-card p-4 lg:p-6">
          <h2 className="text-lg lg:text-xl font-bold text-white mb-4 flex items-center gap-2">
            <TrendingUp className="text-green-400" size={20} />
            Revenue (7 Days)
          </h2>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={revenueData}>
              <defs>
                <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorFare" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
              <XAxis
                dataKey="date"
                stroke="rgba(255,255,255,0.6)"
                tick={{ fontSize: 11 }}
                tickFormatter={(value) => {
                  const date = new Date(value);
                  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                }}
              />
              <YAxis
                stroke="rgba(255,255,255,0.6)"
                tick={{ fontSize: 11 }}
                tickFormatter={(value) => `₱${(value / 1000).toFixed(0)}k`}
              />
              <Tooltip
                contentStyle={{ backgroundColor: 'rgba(0,0,0,0.9)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px' }}
                itemStyle={{ color: 'white' }}
                labelStyle={{ color: 'rgba(255,255,255,0.8)' }}
                formatter={(value: any) => `₱${Number(value || 0).toLocaleString()}`}
              />
              <Legend />
              <Area
                type="monotone"
                dataKey="total"
                stroke="#22c55e"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorTotal)"
                name="Total Revenue"
              />
              <Area
                type="monotone"
                dataKey="fare"
                stroke="#3b82f6"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorFare)"
                name="Fare Revenue"
              />
            </AreaChart>
          </ResponsiveContainer>
          <div className="mt-4 pt-4 border-t border-white/10 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-white/60 text-sm">Total Revenue</span>
              <span className="text-white font-bold">₱{kpiData.totalFaresAllTime.toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-white/60 text-sm">7-Day Total</span>
              <span className="text-green-400 font-bold">
                ₱{revenueData.reduce((sum, d) => sum + d.total, 0).toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Active Irregularities Section */}
      <div className="glass-card p-4 lg:p-6 border-l-4 border-orange-500">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg lg:text-xl font-bold text-white flex items-center gap-2">
            <AlertTriangle className="text-orange-400" size={20} />
            Active Irregularities
          </h2>
          <span className="text-white/60 text-xs lg:text-sm">{irregularities.length} unresolved</span>
        </div>

        {irregularities.length === 0 ? (
          <div className="text-center py-8">
            <CheckCircle className="text-green-400 mx-auto mb-2" size={48} />
            <p className="text-white/60">No active irregularities</p>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {irregularities
                .slice(irregularitiesPage * irregularitiesPerPage, (irregularitiesPage + 1) * irregularitiesPerPage)
                .map((irregularity: any) => (
                  <div key={irregularity.id} className="bg-orange-500/10 rounded-lg p-2 lg:p-3 border border-orange-500/30">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                          <span className="px-1.5 py-0.5 bg-orange-500/20 text-orange-400 rounded text-[10px] font-medium capitalize">
                            {irregularity.type}
                          </span>
                          {irregularity.trips && (
                            <span className="text-white/60 text-[10px]">
                              Bus {irregularity.trips.buses?.bus_number || irregularity.trips.buses?.plate_number || 'Unknown'}
                            </span>
                          )}
                        </div>
                        <p className="text-white font-medium text-xs">{irregularity.description}</p>
                        <p className="text-white/60 text-[10px] mt-0.5">
                          {new Date(irregularity.detected_at).toLocaleString()}
                        </p>
                      </div>
                      <button
                        onClick={() => handleResolveIrregularity(irregularity.id)}
                        className="px-2 py-1 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded-lg text-xs font-medium transition-colors flex items-center gap-1 self-start sm:self-auto"
                      >
                        <CheckCircle size={12} />
                        Resolve
                      </button>
                    </div>
                  </div>
                ))}
            </div>

            {/* Pagination */}
            {irregularities.length > 0 && (
              <div className="flex items-center justify-between pt-4 border-t border-white/10 mt-4">
                <span className="text-white/60 text-xs">
                  Showing {irregularitiesPage * irregularitiesPerPage + 1} to {Math.min((irregularitiesPage + 1) * irregularitiesPerPage, irregularities.length)} of {irregularities.length}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIrregularitiesPage(Math.max(0, irregularitiesPage - 1))}
                    disabled={irregularitiesPage === 0}
                    className="p-2 rounded-lg bg-white/10 text-white/60 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <span className="text-white/60 text-xs">
                    Page {irregularitiesPage + 1} of {Math.ceil(irregularities.length / irregularitiesPerPage)}
                  </span>
                  <button
                    onClick={() => setIrregularitiesPage(Math.min(Math.ceil(irregularities.length / irregularitiesPerPage) - 1, irregularitiesPage + 1))}
                    disabled={irregularitiesPage === Math.ceil(irregularities.length / irregularitiesPerPage) - 1}
                    className="p-2 rounded-lg bg-white/10 text-white/60 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

    </div>
  );
}
