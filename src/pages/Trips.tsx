import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Bus, Users, Clock, Search, Filter, Play, Square, Eye } from 'lucide-react';

interface Trip {
  id: string;
  bus_number: number;
  bus_route: string;
  conductor_name: string;
  started_at: string;
  ended_at?: string;
  status: string;
  current_lat?: number;
  current_lng?: number;
  passengers?: number;
  gps_updated_at?: string;
}

export default function Trips() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);

  useEffect(() => {
    fetchTrips();
    
    const subscription = supabase
      .channel('trips-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trips' }, fetchTrips)
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const fetchTrips = async () => {
    try {
      const { data: tripsData, error: tripsError } = await supabase
        .from('trips')
        .select(`
          id,
          conductor_id,
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

      // Fetch all conductors separately
      const conductorIds = [...new Set((tripsData || []).map((t: any) => t.conductor_id).filter(Boolean))];
      const { data: conductors } = await supabase
        .from('staff_users')
        .select('id, full_name')
        .in('id', conductorIds);

      const conductorMap = new Map(
        (conductors || []).map((c: any) => [c.id, c.full_name])
      );

      const trips: Trip[] = (tripsData || []).map((trip: any) => ({
        id: trip.id,
        bus_number: trip.buses?.bus_number || 0,
        bus_route: trip.buses?.route || 'Unknown',
        conductor_name: conductorMap.get(trip.conductor_id) || 'Unknown',
        started_at: trip.started_at,
        ended_at: trip.ended_at,
        status: trip.status,
        current_lat: trip.current_lat,
        current_lng: trip.current_lng,
        passengers: trip.passenger_counts?.[0]?.count || 0,
        gps_updated_at: trip.gps_updated_at,
      }));

      setTrips(trips);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching trips:', error);
      setLoading(false);
    }
  };

  const filteredTrips = trips.filter(trip => {
    const matchesSearch = 
      trip.bus_number.toString().includes(searchTerm) ||
      trip.bus_route.toLowerCase().includes(searchTerm.toLowerCase()) ||
      trip.conductor_name.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || trip.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

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

  const getGPSStatus = (updatedAt?: string) => {
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
        <h1 className="text-3xl font-bold text-white mb-2">Trip Operations</h1>
        <p className="text-white/60">Monitor and manage all bus trips</p>
      </div>

      {/* Filters */}
      <div className="glass-card p-4 flex flex-col md:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/40" size={20} />
          <input
            type="text"
            placeholder="Search by bus number, route, or conductor..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-orange-500"
          />
        </div>
        
        <div className="flex items-center gap-2">
          <Filter className="text-white/40" size={20} />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:border-orange-500"
          >
            <option value="all">All Status</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      {/* Stats */}
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
                {trips.filter(t => t.status === 'completed').length}
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

      {/* Trip List */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">Trip History</h2>
          <span className="text-white/60">{filteredTrips.length} trips</span>
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
                  <th className="text-left py-3 px-4 text-white/60 font-medium">Status</th>
                  <th className="text-left py-3 px-4 text-white/60 font-medium">Duration</th>
                  <th className="text-left py-3 px-4 text-white/60 font-medium">Passengers</th>
                  <th className="text-left py-3 px-4 text-white/60 font-medium">GPS</th>
                  <th className="text-left py-3 px-4 text-white/60 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredTrips.map((trip) => {
                  const gpsStatus = getGPSStatus(trip.gps_updated_at);
                  
                  return (
                    <tr key={trip.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                      <td className="py-4 px-4">
                        <span className="text-white font-medium">#{trip.bus_number}</span>
                      </td>
                      <td className="py-4 px-4 text-white/80">{trip.bus_route}</td>
                      <td className="py-4 px-4 text-white/80">{trip.conductor_name}</td>
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
                <p className={`font-medium ${getGPSStatus(selectedTrip.gps_updated_at).color}`}>
                  {getGPSStatus(selectedTrip.gps_updated_at).status}
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
