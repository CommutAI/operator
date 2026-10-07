import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { supabase } from '../lib/supabase';
import { Bus, Users, Clock, Activity, Play, Square, Eye, Calendar } from 'lucide-react';
import L from 'leaflet';

// Fix for default marker icons in Leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface BusLocation {
  id: string;
  trip_id: string;
  bus_number: number;
  route: string;
  conductor_name: string;
  driver_name: string;
  lat: number;
  lng: number;
  passengers: number;
  capacity: number;
  speed?: number;
  gps_updated_at: string;
  status: string;
}

interface Trip {
  id: string;
  bus_number: number;
  bus_route: string;
  conductor_name: string;
  driver_name: string;
  started_at: string;
  ended_at?: string;
  status: string;
  current_lat?: number;
  current_lng?: number;
  passengers?: number;
  gps_updated_at?: string;
}

function MapView({ buses, selectedBus, setSelectedBus }: { 
  buses: BusLocation[]; 
  selectedBus: BusLocation | null;
  setSelectedBus: (bus: BusLocation | null) => void;
}) {
  const map = useMap();

  useEffect(() => {
    if (selectedBus) {
      map.setView([selectedBus.lat, selectedBus.lng], 15);
    }
  }, [selectedBus, map]);

  return (
    <>
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {buses.map((bus) => (
        <Marker
          key={bus.id}
          position={[bus.lat, bus.lng]}
          eventHandlers={{
            click: () => setSelectedBus(bus),
          }}
        >
          <Popup>
            <div className="p-2 min-w-[200px]">
              <h3 className="font-bold text-lg mb-2">Bus #{bus.bus_number}</h3>
              <div className="space-y-1 text-sm">
                <p><strong>Route:</strong> {bus.route}</p>
                <p><strong>Conductor:</strong> {bus.conductor_name}</p>
                <p><strong>Driver:</strong> {bus.driver_name}</p>
                <p><strong>Passengers:</strong> {bus.passengers}/{bus.capacity}</p>
                <p><strong>Status:</strong> {bus.status}</p>
                <p className="text-gray-500 text-xs">
                  Last update: {new Date(bus.gps_updated_at).toLocaleTimeString()}
                </p>
              </div>
            </div>
          </Popup>
        </Marker>
      ))}
    </>
  );
}

export default function LiveOperations() {
  const [buses, setBuses] = useState<BusLocation[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [selectedBus, setSelectedBus] = useState<BusLocation | null>(null);
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState('all');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [sortBy, setSortBy] = useState('date_desc');
  const [availableDrivers, setAvailableDrivers] = useState<any[]>([]);
  const [assigningDriver, setAssigningDriver] = useState(false);

  useEffect(() => {
    fetchBusLocations();
    fetchTrips();
    fetchAvailableDrivers();
    
    // Subscribe to real-time updates
    const subscription = supabase
      .channel('bus-locations')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'trips',
        },
        () => {
          fetchBusLocations();
          fetchTrips();
        }
      )
      .subscribe();

    // Refresh every 30 seconds
    const interval = setInterval(() => {
      fetchBusLocations();
      fetchTrips();
    }, 30000);

    return () => {
      subscription.unsubscribe();
      clearInterval(interval);
    };
  }, []);

  const fetchBusLocations = async () => {
    try {
      // Fetch all active buses from the buses table
      const { data: busesData, error: busesError } = await supabase
        .from('buses')
        .select('*')
        .eq('status', 'active');

      if (busesError) throw busesError;

      console.log('Active buses data:', busesData);
      console.log('Number of active buses:', busesData?.length);

      // Fetch active trips for these buses to get GPS data
      const busIds = (busesData || []).map((b: any) => b.id);
      
      const { data: tripsData, error: tripsError } = await supabase
        .from('trips')
        .select(`
          id,
          bus_id,
          conductor_id,
          operator_id,
          current_lat,
          current_lng,
          gps_updated_at,
          status,
          passenger_counts (
            count
          )
        `)
        .eq('status', 'in_progress')
        .in('bus_id', busIds);

      if (tripsError) throw tripsError;

      console.log('Active trips data:', tripsData);
      console.log('Number of active trips:', tripsData?.length);

      // Fetch all conductors and operators separately
      const conductorIds = [...new Set((tripsData || []).map((t: any) => t.conductor_id).filter(Boolean))];
      const operatorIds = [...new Set((tripsData || []).map((t: any) => t.operator_id).filter(Boolean))];
      
      const { data: conductors } = await supabase
        .from('staff_users')
        .select('id, full_name')
        .in('id', conductorIds);

      const { data: operators } = await supabase
        .from('staff_users')
        .select('id, full_name')
        .in('id', operatorIds);

      const conductorMap = new Map(
        (conductors || []).map((c: any) => [c.id, c.full_name])
      );

      const operatorMap = new Map(
        (operators || []).map((c: any) => [c.id, c.full_name])
      );

      // Create a map of bus_id to trip data
      const tripMap = new Map(
        (tripsData || []).map((trip: any) => [trip.bus_id, trip])
      );

      const busLocations: BusLocation[] = (busesData || []).map((bus: any) => {
        const trip = tripMap.get(bus.id);
        return {
          id: bus.id,
          trip_id: trip?.id || '',
          bus_number: bus.bus_number || 0,
          route: bus.route || 'Unknown',
          conductor_name: trip ? conductorMap.get(trip.conductor_id) || 'Unknown' : 'Not Assigned',
          driver_name: trip ? operatorMap.get(trip.operator_id) || 'Not Assigned' : 'Not Assigned',
          lat: trip?.current_lat || 0,
          lng: trip?.current_lng || 0,
          passengers: trip?.passenger_counts?.[0]?.count || 0,
          capacity: bus.seat_capacity || 50,
          gps_updated_at: trip?.gps_updated_at || new Date().toISOString(),
          status: trip ? trip.status : 'available',
        };
      });

      console.log('Bus locations:', busLocations);
      setBuses(busLocations);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching bus locations:', error);
      setLoading(false);
    }
  };

  const fetchTrips = async () => {
    try {
      const { data: tripsData, error: tripsError } = await supabase
        .from('trips')
        .select(`
          id,
          conductor_id,
          operator_id,
          started_at,
          ended_at,
          status,
          current_lat,
          current_lng,
          gps_updated_at,
          buses (
            bus_number,
            route
          ),
          passenger_counts (count)
        `)
        .order('started_at', { ascending: false })
        .limit(50);

      if (tripsError) throw tripsError;

      console.log('All trips data:', tripsData);
      console.log('Number of all trips:', tripsData?.length);

      // Fetch all conductors and operators separately
      const conductorIds = [...new Set((tripsData || []).map((t: any) => t.conductor_id).filter(Boolean))];
      const operatorIds = [...new Set((tripsData || []).map((t: any) => t.operator_id).filter(Boolean))];
      
      const { data: conductors } = await supabase
        .from('staff_users')
        .select('id, full_name')
        .in('id', conductorIds);

      const { data: operators } = await supabase
        .from('staff_users')
        .select('id, full_name')
        .in('id', operatorIds);

      const conductorMap = new Map(
        (conductors || []).map((c: any) => [c.id, c.full_name])
      );

      const operatorMap = new Map(
        (operators || []).map((c: any) => [c.id, c.full_name])
      );

      const trips: Trip[] = (tripsData || []).map((trip: any) => ({
        id: trip.id,
        bus_number: trip.buses?.bus_number || 0,
        bus_route: trip.buses?.route || 'Unknown',
        conductor_name: conductorMap.get(trip.conductor_id) || 'Unknown',
        driver_name: operatorMap.get(trip.operator_id) || 'Not Assigned',
        started_at: trip.started_at,
        ended_at: trip.ended_at,
        status: trip.status,
        current_lat: trip.current_lat,
        current_lng: trip.current_lng,
        passengers: trip.passenger_counts?.[0]?.count || 0,
        gps_updated_at: trip.gps_updated_at,
      }));

      console.log('Processed trips:', trips);
      setTrips(trips);
    } catch (error) {
      console.error('Error fetching trips:', error);
    }
  };

  const fetchAvailableDrivers = async () => {
    try {
      const { data, error } = await supabase
        .from('staff_users')
        .select('id, full_name, role')
        .eq('is_active', true)
        .in('role', ['operator', 'conductor']);

      if (error) throw error;
      setAvailableDrivers(data || []);
    } catch (error) {
      console.error('Error fetching available drivers:', error);
    }
  };

  const assignDriver = async (tripId: string, driverId: string) => {
    try {
      setAssigningDriver(true);
      const { error } = await supabase
        .from('trips')
        .update({ operator_id: driverId })
        .eq('id', tripId);

      if (error) throw error;
      
      // Refresh data
      await fetchTrips();
      await fetchBusLocations();
    } catch (error) {
      console.error('Error assigning driver:', error);
      alert('Failed to assign driver');
    } finally {
      setAssigningDriver(false);
    }
  };

  const getGPSStatus = (updatedAt: string) => {
    const now = new Date();
    const update = new Date(updatedAt);
    const diff = (now.getTime() - update.getTime()) / 1000; // seconds

    if (diff < 60) return { status: 'Connected', color: 'text-green-400' };
    if (diff < 300) return { status: 'Recent', color: 'text-yellow-400' };
    return { status: 'Delayed', color: 'text-red-400' };
  };

  const getFilteredTrips = () => {
    const now = new Date();
    let startDate: Date;
    let applyTimeFilter = true;
    
    switch (timeRange) {
      case 'all':
        applyTimeFilter = false;
        break;
      case 'daily':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'weekly':
        startDate = new Date(now);
        startDate.setDate(now.getDate() - 7);
        break;
      case 'monthly':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'yearly':
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      case 'custom':
        startDate = customStartDate ? new Date(customStartDate) : new Date(0);
        break;
      default:
        startDate = new Date(0);
    }
    
    const endDate = customEndDate ? new Date(customEndDate) : now;
    
    let filtered = trips.filter(trip => {
      const tripDate = new Date(trip.started_at);
      const isInTimeRange = !applyTimeFilter || (tripDate >= startDate && tripDate <= endDate);
      return isInTimeRange;
    });

    // Apply sorting
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'date_desc':
          return new Date(b.started_at).getTime() - new Date(a.started_at).getTime();
        case 'date_asc':
          return new Date(a.started_at).getTime() - new Date(b.started_at).getTime();
        case 'status':
          return a.status.localeCompare(b.status);
        case 'bus_number':
          return a.bus_number - b.bus_number;
        default:
          return 0;
      }
    });

    return filtered;
  };

  const filteredTrips = getFilteredTrips();

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'in_progress': return 'text-green-400 bg-green-500/20';
      case 'completed': return 'text-blue-400 bg-blue-500/20';
      case 'cancelled': return 'text-red-400 bg-red-500/20';
      default: return 'text-white/60 bg-white/10';
    }
  };

  const getDuration = (start: string, end?: string) => {
    const startDate = new Date(start);
    const endDate = end ? new Date(end) : new Date();
    const diff = (endDate.getTime() - startDate.getTime()) / 1000 / 60; // minutes
    
    if (diff < 60) return `${Math.round(diff)}m`;
    return `${Math.round(diff / 60)}h ${Math.round(diff % 60)}m`;
  };

  const getTripGPSStatus = (updatedAt?: string) => {
    if (!updatedAt) return { status: 'No Data', color: 'text-gray-400' };
    
    const now = new Date();
    const update = new Date(updatedAt);
    const diff = (now.getTime() - update.getTime()) / 1000;

    if (diff < 60) return { status: 'Live', color: 'text-green-400' };
    if (diff < 300) return { status: 'Recent', color: 'text-yellow-400' };
    return { status: 'Stale', color: 'text-red-400' };
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Live Operations</h1>
        <p className="text-white/60">Real-time bus tracking and trip management</p>
      </div>

      {/* Combined Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="glass-card p-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-lg bg-green-500/20 text-green-400">
              <Play size={24} />
            </div>
            <div>
              <p className="text-white/60 text-sm">Active Trips</p>
              <p className="text-white text-2xl font-bold">
                {trips.filter(t => t.status === 'in_progress').length}
              </p>
            </div>
          </div>
        </div>
        
        <div className="glass-card p-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-lg bg-blue-500/20 text-blue-400">
              <Square size={24} />
            </div>
            <div>
              <p className="text-white/60 text-sm">Completed Today</p>
              <p className="text-white text-2xl font-bold">
                {trips.filter(t => t.status === 'completed' && t.ended_at && t.ended_at.startsWith(new Date().toISOString().split('T')[0])).length}
              </p>
            </div>
          </div>
        </div>
        
        <div className="glass-card p-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-lg bg-purple-500/20 text-purple-400">
              <Users size={24} />
            </div>
            <div>
              <p className="text-white/60 text-sm">Total Passengers</p>
              <p className="text-white text-2xl font-bold">
                {trips.reduce((sum, t) => sum + (t.passengers || 0), 0)}
              </p>
            </div>
          </div>
        </div>
        
        <div className="glass-card p-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-lg bg-orange-500/20 text-orange-400">
              <Bus size={24} />
            </div>
            <div>
              <p className="text-white/60 text-sm">Total Trips</p>
              <p className="text-white text-2xl font-bold">{trips.length}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Map */}
        <div className="lg:col-span-3">
          <div className="glass-card p-4 h-[600px]">
            {loading ? (
              <div className="h-full flex items-center justify-center">
                <div className="text-white">Loading map...</div>
              </div>
            ) : (
              <MapContainer
                center={[8.4, 124.6]} // Approximate center of Mindanao
                zoom={10}
                style={{ height: '100%', width: '100%' }}
                className="rounded-lg"
                attributionControl={false}
              >
                <MapView buses={buses} selectedBus={selectedBus} setSelectedBus={setSelectedBus} />
              </MapContainer>
            )}
          </div>
        </div>

        {/* Bus List */}
        <div className="lg:col-span-1">
          <div className="glass-card p-4 h-[600px] overflow-hidden flex flex-col">
            <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
              <Bus className="text-orange-400" size={20} />
              Active Buses ({buses.length})
            </h2>
            
            <div className="flex-1 overflow-y-auto space-y-3">
              {buses.map((bus) => {
                const gpsStatus = getGPSStatus(bus.gps_updated_at);
                const isSelected = selectedBus?.id === bus.id;
                
                return (
                  <div
                    key={bus.id}
                    onClick={() => setSelectedBus(bus)}
                    className={`p-4 rounded-lg cursor-pointer transition-colors ${
                      isSelected 
                        ? 'bg-orange-500/20 border border-orange-500/30' 
                        : 'bg-white/5 hover:bg-white/10 border border-white/10'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-white font-medium">Bus #{bus.bus_number}</span>
                      <span className={`text-xs ${gpsStatus.color}`}>{gpsStatus.status}</span>
                    </div>
                    <p className="text-white/60 text-sm mb-2">{bus.route}</p>
                    <p className="text-white/40 text-xs mb-1">Conductor: {bus.conductor_name}</p>
                    <p className="text-white/40 text-xs mb-2">Driver: {bus.driver_name}</p>
                    <div className="flex items-center gap-2 text-white/40 text-xs">
                      <Users size={12} />
                      <span>{bus.passengers}/{bus.capacity}</span>
                    </div>
                    <div className="flex items-center gap-2 text-white/40 text-xs mt-1">
                      <Clock size={12} />
                      <span>{new Date(bus.gps_updated_at).toLocaleTimeString()}</span>
                    </div>
                  </div>
                );
              })}
              
              {buses.length === 0 && (
                <div className="text-center py-8">
                  <Bus className="text-white/20 mx-auto mb-2" size={32} />
                  <p className="text-white/40 text-sm">No active buses found</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Trip History */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">Trip History</h2>
          <span className="text-white/60">{filteredTrips.length} trips</span>
        </div>

        {/* Trip History Controls */}
        <div className="mb-6 flex flex-col md:flex-row gap-4">
          {/* Time Range Selector */}
          <div className="flex items-center gap-2">
            <Calendar className="text-white/40" size={20} />
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
              className="px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:border-orange-500"
            >
              <option value="all">All Time</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
              <option value="custom">Custom Range</option>
            </select>
          </div>

          {/* Sort Button */}
          <div className="flex items-center gap-2">
            <Activity className="text-white/40" size={20} />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:border-orange-500"
            >
              <option value="date_desc">Newest First</option>
              <option value="date_asc">Oldest First</option>
              <option value="status">By Status</option>
              <option value="bus_number">By Bus Number</option>
            </select>
          </div>
          
          {timeRange === 'custom' && (
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <label className="text-white/60 text-sm mb-1 block">Start Date</label>
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="w-full px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:border-orange-500"
                />
              </div>
              <div className="flex-1">
                <label className="text-white/60 text-sm mb-1 block">End Date</label>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="w-full px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:border-orange-500"
                />
              </div>
            </div>
          )}
        </div>

        {loading ? (
          <div className="text-center py-8">
            <div className="text-white">Loading trips...</div>
          </div>
        ) : filteredTrips.length === 0 ? (
          <div className="text-center py-8">
            <Bus className="text-white/20 mx-auto mb-2" size={48} />
            <p className="text-white/40">No trips found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left py-3 px-4 text-white/60 font-medium">Bus</th>
                  <th className="text-left py-3 px-4 text-white/60 font-medium">Route</th>
                  <th className="text-left py-3 px-4 text-white/60 font-medium">Conductor</th>
                  <th className="text-left py-3 px-4 text-white/60 font-medium">Driver</th>
                  <th className="text-left py-3 px-4 text-white/60 font-medium">Status</th>
                  <th className="text-left py-3 px-4 text-white/60 font-medium">Duration</th>
                  <th className="text-left py-3 px-4 text-white/60 font-medium">Passengers</th>
                  <th className="text-left py-3 px-4 text-white/60 font-medium">GPS</th>
                  <th className="text-left py-3 px-4 text-white/60 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredTrips.map((trip) => {
                  const gpsStatus = getTripGPSStatus(trip.gps_updated_at);
                  
                  return (
                    <tr key={trip.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                      <td className="py-4 px-4">
                        <span className="text-white font-medium">#{trip.bus_number}</span>
                      </td>
                      <td className="py-4 px-4 text-white/80">{trip.bus_route}</td>
                      <td className="py-4 px-4 text-white/80">{trip.conductor_name}</td>
                      <td className="py-4 px-4 text-white/80">{trip.driver_name}</td>
                      <td className="py-4 px-4">
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(trip.status)}`}>
                          {trip.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-2 text-white/80">
                          <Clock size={16} />
                          <span>{getDuration(trip.started_at, trip.ended_at)}</span>
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-2">
                          <Users size={16} className="text-white/60" />
                          <span className="text-white">{trip.passengers || 0}</span>
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <span className={`text-sm ${gpsStatus.color}`}>{gpsStatus.status}</span>
                      </td>
                      <td className="py-4 px-4">
                        <button
                          onClick={() => setSelectedTrip(trip)}
                          className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                          title="View Details"
                        >
                          <Eye size={18} className="text-white/60 hover:text-white" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Selected Bus Details */}
      {selectedBus && (
        <div className="glass-card p-6">
          <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <Activity className="text-orange-400" size={20} />
            Bus Details - #{selectedBus.bus_number}
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white/5 rounded-lg p-4 border border-white/10">
              <p className="text-white/60 text-sm mb-1">Route</p>
              <p className="text-white font-medium">{selectedBus.route}</p>
            </div>
            
            <div className="bg-white/5 rounded-lg p-4 border border-white/10">
              <p className="text-white/60 text-sm mb-1">Conductor</p>
              <p className="text-white font-medium">{selectedBus.conductor_name}</p>
            </div>
            
            <div className="bg-white/5 rounded-lg p-4 border border-white/10">
              <p className="text-white/60 text-sm mb-1">Driver</p>
              <p className="text-white font-medium">{selectedBus.driver_name}</p>
            </div>
            
            <div className="bg-white/5 rounded-lg p-4 border border-white/10">
              <p className="text-white/60 text-sm mb-1">Passengers</p>
              <p className="text-white font-medium">{selectedBus.passengers} / {selectedBus.capacity}</p>
            </div>
            
            <div className="bg-white/5 rounded-lg p-4 border border-white/10">
              <p className="text-white/60 text-sm mb-1">GPS Status</p>
              <p className={`font-medium ${getGPSStatus(selectedBus.gps_updated_at).color}`}>
                {getGPSStatus(selectedBus.gps_updated_at).status}
              </p>
            </div>
            
            <div className="bg-white/5 rounded-lg p-4 border border-white/10">
              <p className="text-white/60 text-sm mb-1">Latitude</p>
              <p className="text-white font-medium">{selectedBus.lat.toFixed(6)}</p>
            </div>
            
            <div className="bg-white/5 rounded-lg p-4 border border-white/10">
              <p className="text-white/60 text-sm mb-1">Longitude</p>
              <p className="text-white font-medium">{selectedBus.lng.toFixed(6)}</p>
            </div>
            
            <div className="bg-white/5 rounded-lg p-4 border border-white/10">
              <p className="text-white/60 text-sm mb-1">Trip Status</p>
              <p className="text-white font-medium capitalize">{selectedBus.status}</p>
            </div>
            
            <div className="bg-white/5 rounded-lg p-4 border border-white/10 md:col-span-2">
              <p className="text-white/60 text-sm mb-1">Last Update</p>
              <p className="text-white font-medium">{new Date(selectedBus.gps_updated_at).toLocaleString()}</p>
            </div>
          </div>
        </div>
      )}

      {/* Trip Details Modal */}
      {selectedTrip && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSelectedTrip(null)}>
          <div className="glass-card p-6 w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white">Trip Details</h2>
              <button
                onClick={() => setSelectedTrip(null)}
                className="text-white/60 hover:text-white"
              >
                <Square size={24} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white/5 rounded-lg p-4 border border-white/10">
                <p className="text-white/60 text-sm mb-1">Bus Number</p>
                <p className="text-white font-medium">#{selectedTrip.bus_number}</p>
              </div>
              
              <div className="bg-white/5 rounded-lg p-4 border border-white/10">
                <p className="text-white/60 text-sm mb-1">Route</p>
                <p className="text-white font-medium">{selectedTrip.bus_route}</p>
              </div>
              
              <div className="bg-white/5 rounded-lg p-4 border border-white/10">
                <p className="text-white/60 text-sm mb-1">Conductor</p>
                <p className="text-white font-medium">{selectedTrip.conductor_name}</p>
              </div>
              
              <div className="bg-white/5 rounded-lg p-4 border border-white/10">
                <p className="text-white/60 text-sm mb-1">Driver</p>
                <div className="flex items-center gap-2">
                  <p className="text-white font-medium">{selectedTrip.driver_name}</p>
                  <select
                    onChange={(e) => {
                      if (e.target.value && selectedTrip.id) {
                        assignDriver(selectedTrip.id, e.target.value);
                        e.target.value = '';
                      }
                    }}
                    disabled={assigningDriver}
                    className="px-2 py-1 bg-white/10 border border-white/20 rounded text-white text-sm focus:outline-none focus:border-orange-500 disabled:opacity-50"
                  >
                    <option value="">Assign Driver</option>
                    {availableDrivers.map((driver) => (
                      <option key={driver.id} value={driver.id}>
                        {driver.full_name} ({driver.role})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              
              <div className="bg-white/5 rounded-lg p-4 border border-white/10">
                <p className="text-white/60 text-sm mb-1">Status</p>
                <p className={`font-medium ${getStatusColor(selectedTrip.status)}`}>
                  {selectedTrip.status.replace('_', ' ')}
                </p>
              </div>
              
              <div className="bg-white/5 rounded-lg p-4 border border-white/10">
                <p className="text-white/60 text-sm mb-1">Started At</p>
                <p className="text-white font-medium">{new Date(selectedTrip.started_at).toLocaleString()}</p>
              </div>
              
              <div className="bg-white/5 rounded-lg p-4 border border-white/10">
                <p className="text-white/60 text-sm mb-1">Duration</p>
                <p className="text-white font-medium">{getDuration(selectedTrip.started_at, selectedTrip.ended_at)}</p>
              </div>
              
              <div className="bg-white/5 rounded-lg p-4 border border-white/10">
                <p className="text-white/60 text-sm mb-1">Passengers</p>
                <p className="text-white font-medium">{selectedTrip.passengers || 0}</p>
              </div>
              
              <div className="bg-white/5 rounded-lg p-4 border border-white/10">
                <p className="text-white/60 text-sm mb-1">GPS Status</p>
                <p className={`font-medium ${getTripGPSStatus(selectedTrip.gps_updated_at).color}`}>
                  {getTripGPSStatus(selectedTrip.gps_updated_at).status}
                </p>
              </div>

              {selectedTrip.current_lat && selectedTrip.current_lng && (
                <>
                  <div className="bg-white/5 rounded-lg p-4 border border-white/10">
                    <p className="text-white/60 text-sm mb-1">Latitude</p>
                    <p className="text-white font-medium">{selectedTrip.current_lat.toFixed(6)}</p>
                  </div>
                  
                  <div className="bg-white/5 rounded-lg p-4 border border-white/10">
                    <p className="text-white/60 text-sm mb-1">Longitude</p>
                    <p className="text-white font-medium">{selectedTrip.current_lng.toFixed(6)}</p>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
