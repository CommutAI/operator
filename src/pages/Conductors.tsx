import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { User, Search, Filter, Bus, CheckCircle, XCircle } from 'lucide-react';

interface Conductor {
  id: string;
  full_name: string;
  email: string;
  phone?: string;
  status: string;
  active_trip_id?: string;
  current_bus?: string;
  current_route?: string;
  last_active?: string;
}

export default function Conductors() {
  const [conductors, setConductors] = useState<Conductor[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    fetchConductors();
    
    const subscription = supabase
      .channel('conductors-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'staff_users' }, fetchConductors)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trips' }, fetchConductors)
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const fetchConductors = async () => {
    try {
      const { data, error } = await supabase
        .from('staff_users')
        .select(`
          id,
          full_name,
          email,
          phone,
          is_active,
          trips!trips_conductor_id_fkey (
            id,
            status,
            buses (bus_number, route)
          )
        `)
        .eq('role', 'conductor')
        .order('full_name');

      if (error) throw error;

      const conductorsData: Conductor[] = (data || []).map((c: any) => {
        const activeTrip = c.trips?.find((t: any) => t.status === 'in_progress');
        return {
          id: c.id,
          full_name: c.full_name,
          email: c.email,
          phone: c.phone,
          status: c.is_active ? 'active' : 'inactive',
          active_trip_id: activeTrip?.id,
          current_bus: activeTrip?.buses?.bus_number?.toString(),
          current_route: activeTrip?.buses?.route,
          last_active: activeTrip ? new Date().toISOString() : undefined,
        };
      });

      setConductors(conductorsData);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching conductors:', error);
      setLoading(false);
    }
  };

  const filteredConductors = conductors.filter(conductor => {
    const matchesSearch = 
      conductor.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      conductor.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      conductor.phone?.includes(searchTerm);
    
    const matchesStatus = statusFilter === 'all' || conductor.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'text-green-400 bg-green-500/20';
      case 'inactive': return 'text-red-400 bg-red-500/20';
      case 'on_leave': return 'text-yellow-400 bg-yellow-500/20';
      default: return 'text-white/60 bg-white/10';
    }
  };

  const activeConductors = conductors.filter(c => c.active_trip_id).length;
  const totalConductors = conductors.length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Conductor Monitoring</h1>
        <p className="text-white/60">Monitor all conductors and their activity</p>
      </div>

      {/* Filters */}
      <div className="glass-card p-4 flex flex-col md:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/40" size={20} />
          <input
            type="text"
            placeholder="Search by name, email, or phone..."
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
            <option value="inactive">Inactive</option>
            <option value="on_leave">On Leave</option>
          </select>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="glass-card p-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-lg bg-green-500/20 text-green-400">
              <User size={24} />
            </div>
            <div>
              <p className="text-white/60 text-sm">Total Conductors</p>
              <p className="text-white text-2xl font-bold">{totalConductors}</p>
            </div>
          </div>
        </div>
        
        <div className="glass-card p-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-lg bg-blue-500/20 text-blue-400">
              <CheckCircle size={24} />
            </div>
            <div>
              <p className="text-white/60 text-sm">On Trip</p>
              <p className="text-white text-2xl font-bold">{activeConductors}</p>
            </div>
          </div>
        </div>
        
        <div className="glass-card p-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-lg bg-purple-500/20 text-purple-400">
              <Bus size={24} />
            </div>
            <div>
              <p className="text-white/60 text-sm">Available</p>
              <p className="text-white text-2xl font-bold">{totalConductors - activeConductors}</p>
            </div>
          </div>
        </div>
        
        <div className="glass-card p-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-lg bg-orange-500/20 text-orange-400">
              <XCircle size={24} />
            </div>
            <div>
              <p className="text-white/60 text-sm">Inactive</p>
              <p className="text-white text-2xl font-bold">
                {conductors.filter(c => c.status === 'inactive').length}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Conductor List */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">Conductor List</h2>
          <span className="text-white/60">{filteredConductors.length} conductors</span>
        </div>

        {loading ? (
          <div className="text-center py-8">
            <div className="text-white">Loading conductors...</div>
          </div>
        ) : filteredConductors.length === 0 ? (
          <div className="text-center py-8">
            <User className="text-white/20 mx-auto mb-2" size={48} />
            <p className="text-white/40">No conductors found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left py-3 px-4 text-white/60 font-medium">Name</th>
                  <th className="text-left py-3 px-4 text-white/60 font-medium">Email</th>
                  <th className="text-left py-3 px-4 text-white/60 font-medium">Phone</th>
                  <th className="text-left py-3 px-4 text-white/60 font-medium">Status</th>
                  <th className="text-left py-3 px-4 text-white/60 font-medium">Current Bus</th>
                  <th className="text-left py-3 px-4 text-white/60 font-medium">Route</th>
                  <th className="text-left py-3 px-4 text-white/60 font-medium">Activity</th>
                </tr>
              </thead>
              <tbody>
                {filteredConductors.map((conductor) => (
                  <tr key={conductor.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-orange-500/20 flex items-center justify-center text-orange-400 font-medium">
                          {conductor.full_name.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-white font-medium">{conductor.full_name}</span>
                      </div>
                    </td>
                    <td className="py-4 px-4 text-white/80">{conductor.email}</td>
                    <td className="py-4 px-4 text-white/80">{conductor.phone || 'N/A'}</td>
                    <td className="py-4 px-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(conductor.status)}`}>
                        {conductor.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="py-4 px-4">
                      {conductor.current_bus ? (
                        <span className="text-white">#{conductor.current_bus}</span>
                      ) : (
                        <span className="text-white/40">Not on trip</span>
                      )}
                    </td>
                    <td className="py-4 px-4 text-white/80">{conductor.current_route || '-'}</td>
                    <td className="py-4 px-4">
                      {conductor.active_trip_id ? (
                        <span className="px-3 py-1 rounded-full text-xs font-medium text-green-400 bg-green-500/20">
                          On Trip
                        </span>
                      ) : (
                        <span className="px-3 py-1 rounded-full text-xs font-medium text-white/60 bg-white/10">
                          Available
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
