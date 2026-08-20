import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Bus, Users, MapPin, Clock, Activity, Search, Filter } from 'lucide-react';

interface Bus {
  id: string;
  bus_number: number;
  plate_number: string;
  route: string;
  seat_capacity: number;
  status: string;
  current_trip_id?: string;
  current_passengers?: number;
  last_gps_update?: string;
}

export default function Buses() {
  const [buses, setBuses] = useState<Bus[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    fetchBuses();
    
    const subscription = supabase
      .channel('buses-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'buses' }, fetchBuses)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trips' }, fetchBuses)
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const fetchBuses = async () => {
    try {
      const { data, error } = await supabase
        .from('buses')
        .select(`
          id,
          bus_number,
          plate_number,
          route,
          seat_capacity,
          status,
          trips (
            id,
            status,
            passenger_counts (count),
            gps_updated_at
          )
        `)
        .order('bus_number');

      if (error) throw error;

      const busesWithTripInfo: Bus[] = (data || []).map((bus: any) => {
        const activeTrip = bus.trips?.find((t: any) => t.status === 'in_progress');
        return {
          id: bus.id,
          bus_number: bus.bus_number,
          plate_number: bus.plate_number,
          route: bus.route,
          seat_capacity: bus.seat_capacity,
          status: bus.status,
          current_trip_id: activeTrip?.id,
          current_passengers: activeTrip?.passenger_counts?.[0]?.count || 0,
          last_gps_update: activeTrip?.gps_updated_at,
        };
      });

      setBuses(busesWithTripInfo);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching buses:', error);
      setLoading(false);
    }
  };

  const filteredBuses = buses.filter(bus => {
    const matchesSearch = 
      bus.bus_number.toString().includes(searchTerm) ||
      bus.plate_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      bus.route.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || bus.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'text-green-400 bg-green-500/20';
      case 'maintenance': return 'text-yellow-400 bg-yellow-500/20';
      case 'inactive': return 'text-red-400 bg-red-500/20';
      default: return 'text-white/60 bg-white/10';
    }
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
        <h1 className="text-3xl font-bold text-white mb-2">Bus Monitoring</h1>
        <p className="text-white/60">Monitor all buses in the fleet</p>
      </div>

      {/* Filters */}
      <div className="glass-card p-4 flex flex-col md:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/40" size={20} />
          <input
            type="text"
            placeholder="Search by bus number, plate, or route..."
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
            <option value="active">Active</option>
            <option value="maintenance">Maintenance</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="glass-card p-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-lg bg-green-500/20 text-green-400">
              <Bus size={24} />
            </div>
            <div>
              <p className="text-white/60 text-sm">Active Buses</p>
              <p className="text-white text-2xl font-bold">
                {buses.filter(b => b.status === 'active').length}
              </p>
            </div>
          </div>
        </div>
        
        <div className="glass-card p-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-lg bg-yellow-500/20 text-yellow-400">
              <Activity size={24} />
            </div>
            <div>
              <p className="text-white/60 text-sm">In Maintenance</p>
              <p className="text-white text-2xl font-bold">
                {buses.filter(b => b.status === 'maintenance').length}
              </p>
            </div>
          </div>
        </div>
        
        <div className="glass-card p-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-lg bg-red-500/20 text-red-400">
              <Bus size={24} />
            </div>
            <div>
              <p className="text-white/60 text-sm">Inactive</p>
              <p className="text-white text-2xl font-bold">
                {buses.filter(b => b.status === 'inactive').length}
              </p>
            </div>
          </div>
        </div>
        
        <div className="glass-card p-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-lg bg-blue-500/20 text-blue-400">
              <Users size={24} />
            </div>
            <div>
              <p className="text-white/60 text-sm">Total Capacity</p>
              <p className="text-white text-2xl font-bold">
                {buses.reduce((sum, b) => sum + b.seat_capacity, 0)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Bus List */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">Fleet Overview</h2>
          <span className="text-white/60">{filteredBuses.length} buses</span>
        </div>

        {loading ? (
          <div className="text-center py-8">
            <div className="text-white">Loading buses...</div>
          </div>
        ) : filteredBuses.length === 0 ? (
          <div className="text-center py-8">
            <Bus className="text-white/20 mx-auto mb-2" size={48} />
            <p className="text-white/40">No buses found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left py-3 px-4 text-white/60 font-medium">Bus #</th>
                  <th className="text-left py-3 px-4 text-white/60 font-medium">Plate</th>
                  <th className="text-left py-3 px-4 text-white/60 font-medium">Route</th>
                  <th className="text-left py-3 px-4 text-white/60 font-medium">Status</th>
                  <th className="text-left py-3 px-4 text-white/60 font-medium">Capacity</th>
                  <th className="text-left py-3 px-4 text-white/60 font-medium">Passengers</th>
                  <th className="text-left py-3 px-4 text-white/60 font-medium">GPS</th>
                </tr>
              </thead>
              <tbody>
                {filteredBuses.map((bus) => {
                  const gpsStatus = getGPSStatus(bus.last_gps_update);
                  const occupancyRate = bus.current_passengers 
                    ? Math.round((bus.current_passengers / bus.seat_capacity) * 100)
                    : 0;
                  
                  return (
                    <tr key={bus.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                      <td className="py-4 px-4">
                        <span className="text-white font-medium">#{bus.bus_number}</span>
                      </td>
                      <td className="py-4 px-4 text-white/80">{bus.plate_number}</td>
                      <td className="py-4 px-4 text-white/80">{bus.route}</td>
                      <td className="py-4 px-4">
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(bus.status)}`}>
                          {bus.status}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-white/80">{bus.seat_capacity}</td>
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-2">
                          <Users size={16} className="text-white/60" />
                          <span className="text-white">{bus.current_passengers || 0}</span>
                          <span className="text-white/40">/ {bus.seat_capacity}</span>
                          <span className={`text-xs ${occupancyRate > 90 ? 'text-red-400' : occupancyRate > 70 ? 'text-yellow-400' : 'text-green-400'}`}>
                            ({occupancyRate}%)
                          </span>
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <span className={`text-sm ${gpsStatus.color}`}>{gpsStatus.status}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
