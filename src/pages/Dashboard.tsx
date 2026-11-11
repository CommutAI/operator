import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  Bus, Users, DollarSign, Activity, AlertTriangle,
  Map as MapIcon, TrendingUp, Zap, Navigation, ArrowUp, ArrowDown, Video, RefreshCw, CheckCircle, ChevronLeft, ChevronRight
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

const BusMarker = ({ bus }: { bus: any }) => (
  <Marker position={[bus.lat, bus.lng]}>
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
          <span className="text-sm">{bus.passengers} passengers</span>
        </div>
        <span className={`inline-block px-2 py-1 rounded text-xs mt-2 ${bus.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
          {bus.status}
        </span>
      </div>
    </Popup>
  </Marker>
);

export default function Dashboard() {
  const [kpiData, setKpiData] = useState({
    activeBuses: 0,
    totalBuses: 0,
    activeTrips: 0,
    currentPassengers: 0,
    totalPassengersToday: 0,
    fareCollectedToday: 0,
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

  useEffect(() => {
    fetchDashboardData();
    
    // @ts-ignore - Supabase callback type issue with async functions
    const subscription = supabase
      .channel('dashboard-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trips' }, () => { void fetchDashboardData(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'emergency_alerts' }, () => { void fetchDashboardData(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fare_irregularities' }, () => { void fetchDashboardData(); })
      .subscribe();

    const gpsSubscription = supabase
      .channel('dashboard-gps-channel')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'gps_locations' }, () => {
        fetchLiveMapData();
      })
      .subscribe();

    return () => { 
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

      // Fetch active trips without join first
      const { data: trips } = await supabase
        .from('trips')
        .select('*')
        .eq('status', 'in_progress')
        .order('started_at', { ascending: false })
        .limit(6);

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

      // Fetch passenger counts for today
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStr = today.toISOString();
      const { data: passengerCounts } = await supabase
        .from('passenger_counts')
        .select('count, ai_count')
        .gte('recorded_at', todayStr)
        .limit(1000);

      const currentPassengers = passengerCounts?.reduce((sum, pc) => sum + (pc.count || 0), 0) || 0;

      // Fetch transactions for today
      const { data: transactions } = await supabase
        .from('transactions')
        .select('amount')
        .gte('created_at', todayStr)
        .limit(1000);

      const fareCollectedToday = transactions?.reduce((sum, t) => sum + (Number(t.amount) || 0), 0) || 0;

      // Fetch fare irregularities without join first
      const { data: irregularities } = await supabase
        .from('fare_irregularities')
        .select('*')
        .eq('resolved', false)
        .order('detected_at', { ascending: false })
        .limit(50);

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

      // Fetch emergency alerts
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

      // Fetch chart data - last 7 days revenue
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const { data: chartTransactions } = await supabase
        .from('transactions')
        .select('amount, type, created_at')
        .gte('created_at', sevenDaysAgo.toISOString())
        .order('created_at', { ascending: true })
        .limit(1000);

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
        totalPassengersToday: currentPassengers,
        fareCollectedToday,
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
        const gps = latestGpsByTripId[trip.id] || (index === 0 ? latestGpsAny : null);

        // Use GPS if valid, otherwise use default coordinates
        // Invalid GPS is lat=0, lng=0 or trip_id=null
        const isValidGps = gps && gps.lat !== 0 && gps.lng !== 0 && gps.tripId === trip.id;
        const lat = isValidGps ? gps.lat : 8.429; // Default to Cagayan de Oro
        const lng = isValidGps ? gps.lng : 124.762;

        console.log('Bus marker:', {
          id: trip.id,
          plate: trip.buses?.bus_number || trip.buses?.plate_number,
          lat,
          lng,
          isValidGps,
          hasGps: !!gps
        });

        return {
          id: trip.id,
          plate: trip.buses?.bus_number || trip.buses?.plate_number || 'Unknown',
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

      // Fetch passenger counts for active trips
      const tripIds = (activeTrips || []).map((t: any) => t.id);
      let totalPassengers = 0;
      
      if (tripIds.length > 0) {
        const { data: passengerCounts } = await (supabase
          .from('passenger_counts')
          .select('trip_id, count')
          .in('trip_id', tripIds)
          .order('recorded_at', { ascending: false }) as any);

        const latestCounts: Record<string, number> = {};
        (passengerCounts || []).forEach((pc: any) => {
          if (!latestCounts[pc.trip_id]) {
            latestCounts[pc.trip_id] = pc.count;
          }
        });

        busMarkers.forEach((bus: any) => {
          if (latestCounts[bus.tripId]) {
            bus.passengers = latestCounts[bus.tripId];
            totalPassengers += latestCounts[bus.tripId];
          }
        });
      }

      // Only show active buses (those with in-progress trips)
      setMapBuses(busMarkers as any);

      // Calculate stats
      const uniqueRoutes = [...new Set((allBuses || []).map((b: any) => b.route))];
      const activeBusesCount = (allBuses || []).filter((b: any) => b.status === 'active').length;

      setMapStats({
        totalPassengers,
        activeBuses: activeBusesCount,
        totalRoutes: uniqueRoutes.length,
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
      subtitle: `${kpiData.totalPassengersToday} total today`,
      icon: Users,
      color: 'text-blue-400',
      trend: 'Real-time',
    },
    {
      title: 'Revenue Today',
      value: `₱${kpiData.fareCollectedToday.toLocaleString()}`,
      subtitle: 'Fare & baggage fees',
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

      {/* Video Monitoring - Dashboard Widget */}
      <div className="glass-card p-4 lg:p-6 border-2 border-orange-500/20">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg lg:text-xl font-bold text-white flex items-center gap-2">
            <Video className="text-orange-400" size={20} />
            Video Monitoring
          </h2>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${videoStreaming ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
            <span className="text-white/60 text-xs lg:text-sm hidden sm:inline">{videoConnectionStatus}</span>
            <button
              onClick={videoRefresh}
              className="bg-white/10 hover:bg-white/20 text-white p-1 rounded transition-colors"
              title="Refresh"
            >
              <RefreshCw size={14} />
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Video Feed */}
          <div className="lg:col-span-2 relative bg-black rounded-lg h-96 overflow-hidden">
            <img
              ref={videoRef}
              alt="Live video feed"
              className={`absolute inset-0 w-full h-full object-contain ${videoStreaming ? 'block' : 'hidden'}`}
            />
            {!videoStreaming && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center px-4">
                  <Video className="text-white/30 mx-auto mb-2" size={32} />
                  <p className="text-white/40 text-sm">
                    {videoConnectionStatus === 'connecting' ? 'Connecting to backend...' : videoConnectionMessage || 'Video feed unavailable'}
                  </p>
                  {videoConnectionStatus === 'connected' && (
                    <p className="text-white/30 text-xs mt-2">
                      No Raspberry Pi device currently streaming. Connect a Pi with camera to see live video.
                    </p>
                  )}
                </div>
              </div>
            )}
            {videoStreaming && (
              <div className="absolute top-2 left-2 bg-black/70 backdrop-blur-sm rounded-lg px-2 py-1 flex items-center gap-2">
                <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                <span className="text-white text-xs font-medium">LIVE</span>
              </div>
            )}
            {videoStreaming && (
              <div className="absolute top-2 right-2 bg-black/70 backdrop-blur-sm rounded-lg px-2 py-1">
                <div className="flex items-center gap-1">
                  <Users size={12} className="text-orange-400" />
                  <span className="text-white text-xs font-bold">{videoPassengerCount}</span>
                </div>
              </div>
            )}
          </div>

          {/* Video Details Sidebar */}
          <div className="col-span-1 space-y-3">
            <div className="glass-card p-3">
              <div className="text-white/70 text-xs mb-2">Current Status</div>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${videoStreaming ? 'bg-green-400' : 'bg-red-400'}`} />
                <span className="text-white text-sm font-medium">
                  {videoStreaming ? 'Streaming' : 'Offline'}
                </span>
              </div>
            </div>

            <div className="glass-card p-3">
              <div className="text-white/70 text-xs mb-2">Passenger Count</div>
              <div className="flex items-center gap-2">
                <Users size={16} className="text-orange-400" />
                <span className="text-white text-2xl font-bold">{videoPassengerCount}</span>
              </div>
            </div>

            <div className="glass-card p-3">
              <div className="text-white/70 text-xs mb-2">Connection</div>
              <div className="text-white text-sm">
                {videoConnectionStatus}
              </div>
            </div>

            <div className="glass-card p-3">
              <div className="text-white/70 text-xs mb-2">AI Detection</div>
              <div className="flex items-center gap-2">
                <Activity size={16} className="text-blue-400" />
                <span className="text-white text-sm font-medium">YOLOv8n</span>
              </div>
            </div>

            <div className="glass-card p-3">
              <div className="text-white/70 text-xs mb-2">Resolution</div>
              <div className="text-white text-sm">640x480 @ 30fps</div>
            </div>

            <button
              onClick={videoRefresh}
              className="w-full py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm flex items-center justify-center gap-2 transition-colors"
            >
              <RefreshCw size={14} />
              Refresh Feed
            </button>
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
            center={mapBuses.length > 0 && mapBuses[0].lat ? [mapBuses[0].lat, mapBuses[0].lng] : [8.429, 124.762]}
            zoom={13}
            style={{ height: '100%', width: '100%' }}
            dragging={true}
            scrollWheelZoom={true}
          >
            <MapRecenter center={mapBuses.length > 0 && mapBuses[0].lat ? [mapBuses[0].lat, mapBuses[0].lng] : [8.429, 124.762]} />
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
              <BusMarker key={bus.id} bus={bus} />
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
              <span className="text-white/60 text-sm">Today's Revenue</span>
              <span className="text-white font-bold">₱{kpiData.fareCollectedToday.toLocaleString()}</span>
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
