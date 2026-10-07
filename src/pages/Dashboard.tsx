import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  Bus, Users, DollarSign, Activity, AlertTriangle,
  Map as MapIcon, TrendingUp, Zap, Navigation, ArrowUp, ArrowDown
} from 'lucide-react';
import {
  LineChart,
  Line,
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

// Hide Leaflet attribution and logo (only once)
if (!document.getElementById('leaflet-style-override')) {
  const style = document.createElement('style');
  style.id = 'leaflet-style-override';
  style.textContent = `
    .leaflet-control-attribution {
      display: none !important;
    }
    .leaflet-bottom {
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

      // Fetch active trips with bus info
      const { data: trips } = await supabase
        .from('trips')
        .select('*, buses(*)')
        .eq('status', 'in_progress')
        .order('started_at', { ascending: false })
        .limit(6);

      setActiveTrips(trips || []);

      // Fetch passenger counts for today
      const today = new Date().toISOString().split('T')[0];
      const { data: passengerCounts } = await supabase
        .from('passenger_counts')
        .select('count, ai_count')
        .gte('recorded_at', today);

      const currentPassengers = passengerCounts?.reduce((sum, pc) => sum + (pc.count || 0), 0) || 0;

      // Fetch transactions for today
      const { data: transactions } = await supabase
        .from('transactions')
        .select('amount')
        .gte('created_at', today);

      const fareCollectedToday = transactions?.reduce((sum, t) => sum + (Number(t.amount) || 0), 0) || 0;

      // Fetch fare irregularities
      const { data: irregularities } = await supabase
        .from('fare_irregularities')
        .select('*')
        .eq('resolved', false);

      // Fetch emergency alerts
      const { data: emergencyAlerts } = await supabase
        .from('emergency_alerts')
        .select('*')
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(3);

      // Count buses with recent GPS updates (last 5 minutes)
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const { data: tripsWithGPS } = await supabase
        .from('trips')
        .select('id')
        .eq('status', 'in_progress')
        .gte('gps_updated_at', fiveMinutesAgo);

      const busesOnline = tripsWithGPS?.length || 0;

      // Fetch chart data - last 7 days revenue
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: chartTransactions } = await supabase
        .from('transactions')
        .select('amount, type, created_at')
        .gte('created_at', sevenDaysAgo)
        .order('created_at', { ascending: true });

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
      const busMarkers = (activeTrips || []).map((trip: any, index: number) => {
        const gps = latestGpsByTripId[trip.id] || (index === 0 ? latestGpsAny : null);

        return {
          id: trip.id,
          plate: trip.buses?.plate_number || 'Unknown',
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

      // Add inactive buses
      const usedLatestGps = busMarkers.some((bus: any) => bus.locationUpdatedAt === latestGpsAny?.recordedAt);
      const inactiveBuses = (allBuses || [])
        .filter((bus: any) => bus.status !== 'active' || !activeTrips?.some((t: any) => t.bus_id === bus.id))
        .map((bus: any, index: number) => {
          const gps = !usedLatestGps && index === 0 ? latestGpsAny : null;

          return {
            id: bus.id,
            plate: bus.plate_number,
            route: bus.route,
            lat: gps?.lat ?? 8.429,
            lng: gps?.lng ?? 124.762,
            passengers: 0,
            status: bus.status === 'maintenance' ? 'maintenance' : 'idle',
            locationSource: gps ? `${gps.source} (latest GPS)` : 'fallback',
            locationUpdatedAt: gps?.recordedAt || null,
            busId: bus.id
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

      setMapBuses([...busMarkers, ...inactiveBuses] as any);

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

      {/* Live Map - Embedded */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <MapIcon className="text-blue-400" size={20} />
            Live Bus Tracking
          </h2>
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2 text-white/70">
              <Navigation size={16} />
              <span>{mapStats.totalRoutes} Routes</span>
            </div>
            <div className="flex items-center gap-2 text-white/70">
              <Bus size={16} />
              <span>{mapStats.activeBuses} Active</span>
            </div>
            <div className="flex items-center gap-2 text-white/70">
              <Users size={16} />
              <span>{mapStats.totalPassengers} Passengers</span>
            </div>
          </div>
        </div>
        
        <div className="h-[500px] rounded-xl overflow-hidden">
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
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Active Trips List */}
        <div className="lg:col-span-2 glass-card p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Activity className="text-orange-400" size={20} />
              Active Trips
            </h2>
            <div className="flex items-center gap-4">
              <span className="text-white/60 text-sm">{kpiData.activeTrips} in progress</span>
              <div className="flex items-center gap-2">
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
                <div key={trip.id} className="bg-white/5 rounded-xl p-4 border border-white/10 hover:bg-white/10 transition-colors">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-orange-500/20">
                        <Bus className="text-orange-400" size={16} />
                      </div>
                      <div>
                        <p className="text-white font-medium">Bus #{trip.buses?.bus_number || 'N/A'}</p>
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
        <div className="glass-card p-6">
          <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <TrendingUp className="text-green-400" size={20} />
            Revenue (7 Days)
          </h2>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={revenueData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
              <XAxis 
                dataKey="date" 
                stroke="rgba(255,255,255,0.6)" 
                tick={{ fontSize: 10 }}
              />
              <YAxis 
                stroke="rgba(255,255,255,0.6)" 
                tick={{ fontSize: 10 }}
              />
              <Tooltip
                contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', border: '1px solid rgba(255,255,255,0.2)' }}
                itemStyle={{ color: 'white' }}
                formatter={(value: any) => `₱${Number(value || 0).toLocaleString()}`}
              />
              <Legend />
              <Line type="monotone" dataKey="total" stroke="#22c55e" name="Total" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
          <div className="mt-4 pt-4 border-t border-white/10">
            <div className="flex items-center justify-between">
              <span className="text-white/60 text-sm">Today's Revenue</span>
              <span className="text-white font-bold">₱{kpiData.fareCollectedToday.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Alerts Section */}
      {alerts.length > 0 && (
        <div className="glass-card p-6 border-l-4 border-red-500">
          <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <Zap className="text-red-400" size={20} />
            Active Alerts
          </h2>
          <div className="space-y-3">
            {alerts.map((alert: any) => (
              <div key={alert.id} className="bg-red-500/10 rounded-lg p-4 border border-red-500/30">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-white font-medium">{alert.notes || 'Emergency Alert'}</p>
                    <p className="text-white/60 text-xs mt-1">
                      {new Date(alert.created_at).toLocaleString()}
                    </p>
                  </div>
                  <span className="px-2 py-1 bg-red-500/20 text-red-400 text-xs rounded-full font-medium">
                    Active
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
