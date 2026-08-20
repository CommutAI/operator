import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { AlertTriangle, Search, Filter, Clock, User, MapPin, CheckCircle } from 'lucide-react';

interface EmergencyAlert {
  id: string;
  bus_number: number;
  route: string;
  conductor_name: string;
  lat?: number;
  lng?: number;
  status: string;
  notes?: string;
  created_at: string;
  acknowledged_at?: string;
  resolved_at?: string;
}

export default function Emergency() {
  const [alerts, setAlerts] = useState<EmergencyAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    fetchAlerts();
    
    const subscription = supabase
      .channel('emergency-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'emergency_alerts' }, fetchAlerts)
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const fetchAlerts = async () => {
    try {
      const { data, error } = await supabase
        .from('emergency_alerts')
        .select(`
          id,
          lat,
          lng,
          status,
          notes,
          created_at,
          acknowledged_at,
          resolved_at,
          trips (
            buses (bus_number, route),
            conductor:staff_users!trips_conductor_id_fkey (full_name)
          )
        `)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;

      const alertsData: EmergencyAlert[] = (data || []).map((alert: any) => ({
        id: alert.id,
        bus_number: alert.trips?.buses?.bus_number || 0,
        route: alert.trips?.buses?.route || 'Unknown',
        conductor_name: alert.trips?.conductor?.full_name || 'Unknown',
        lat: alert.lat,
        lng: alert.lng,
        status: alert.status,
        notes: alert.notes,
        created_at: alert.created_at,
        acknowledged_at: alert.acknowledged_at,
        resolved_at: alert.resolved_at,
      }));

      setAlerts(alertsData);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching emergency alerts:', error);
      setLoading(false);
    }
  };

  const filteredAlerts = alerts.filter(alert => {
    const matchesSearch = 
      alert.bus_number.toString().includes(searchTerm) ||
      alert.route.toLowerCase().includes(searchTerm.toLowerCase()) ||
      alert.conductor_name.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || alert.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const acknowledgeAlert = async (id: string) => {
    try {
      const { error } = await supabase
        .from('emergency_alerts')
        .update({ status: 'acknowledged', acknowledged_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;
      fetchAlerts();
    } catch (error) {
      console.error('Error acknowledging alert:', error);
    }
  };

  const resolveAlert = async (id: string) => {
    try {
      const { error } = await supabase
        .from('emergency_alerts')
        .update({ status: 'resolved', resolved_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;
      fetchAlerts();
    } catch (error) {
      console.error('Error resolving alert:', error);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'text-red-400 bg-red-500/20';
      case 'acknowledged': return 'text-yellow-400 bg-yellow-500/20';
      case 'resolved': return 'text-green-400 bg-green-500/20';
      default: return 'text-white/60 bg-white/10';
    }
  };

  const activeCount = alerts.filter(a => a.status === 'active').length;
  const acknowledgedCount = alerts.filter(a => a.status === 'acknowledged').length;
  const resolvedCount = alerts.filter(a => a.status === 'resolved').length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Emergency Alerts</h1>
        <p className="text-white/60">Monitor and manage emergency incidents</p>
      </div>

      {/* Filters */}
      <div className="glass-card p-4 flex flex-col md:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/40" size={20} />
          <input
            type="text"
            placeholder="Search by bus, route, or conductor..."
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
            <option value="acknowledged">Acknowledged</option>
            <option value="resolved">Resolved</option>
          </select>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="glass-card p-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-lg bg-red-500/20 text-red-400">
              <AlertTriangle size={24} />
            </div>
            <div>
              <p className="text-white/60 text-sm">Active</p>
              <p className="text-white text-2xl font-bold">{activeCount}</p>
            </div>
          </div>
        </div>
        
        <div className="glass-card p-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-lg bg-yellow-500/20 text-yellow-400">
              <AlertTriangle size={24} />
            </div>
            <div>
              <p className="text-white/60 text-sm">Acknowledged</p>
              <p className="text-white text-2xl font-bold">{acknowledgedCount}</p>
            </div>
          </div>
        </div>
        
        <div className="glass-card p-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-lg bg-green-500/20 text-green-400">
              <CheckCircle size={24} />
            </div>
            <div>
              <p className="text-white/60 text-sm">Resolved</p>
              <p className="text-white text-2xl font-bold">{resolvedCount}</p>
            </div>
          </div>
        </div>
        
        <div className="glass-card p-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-lg bg-blue-500/20 text-blue-400">
              <AlertTriangle size={24} />
            </div>
            <div>
              <p className="text-white/60 text-sm">Total</p>
              <p className="text-white text-2xl font-bold">{alerts.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Alert List */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">Emergency History</h2>
          <span className="text-white/60">{filteredAlerts.length} alerts</span>
        </div>

        {loading ? (
          <div className="text-center py-8">
            <div className="text-white">Loading alerts...</div>
          </div>
        ) : filteredAlerts.length === 0 ? (
          <div className="text-center py-8">
            <AlertTriangle className="text-white/20 mx-auto mb-2" size={48} />
            <p className="text-white/40">No emergency alerts found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left py-3 px-4 text-white/60 font-medium">Status</th>
                  <th className="text-left py-3 px-4 text-white/60 font-medium">Bus</th>
                  <th className="text-left py-3 px-4 text-white/60 font-medium">Route</th>
                  <th className="text-left py-3 px-4 text-white/60 font-medium">Conductor</th>
                  <th className="text-left py-3 px-4 text-white/60 font-medium">Location</th>
                  <th className="text-left py-3 px-4 text-white/60 font-medium">Notes</th>
                  <th className="text-left py-3 px-4 text-white/60 font-medium">Time</th>
                  <th className="text-left py-3 px-4 text-white/60 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredAlerts.map((alert) => (
                  <tr key={alert.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                    <td className="py-4 px-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(alert.status)}`}>
                        {alert.status}
                      </span>
                    </td>
                    <td className="py-4 px-4">
                      <span className="text-white font-medium">#{alert.bus_number}</span>
                    </td>
                    <td className="py-4 px-4 text-white/80">{alert.route}</td>
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-2 text-white/80">
                        <User size={16} />
                        <span>{alert.conductor_name}</span>
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      {alert.lat && alert.lng ? (
                        <div className="flex items-center gap-2 text-white/80">
                          <MapPin size={16} />
                          <span>{alert.lat.toFixed(4)}, {alert.lng.toFixed(4)}</span>
                        </div>
                      ) : (
                        <span className="text-white/40">No location</span>
                      )}
                    </td>
                    <td className="py-4 px-4 text-white/80 max-w-xs truncate">
                      {alert.notes || '-'}
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-2 text-white/60">
                        <Clock size={16} />
                        <span>{new Date(alert.created_at).toLocaleString()}</span>
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex gap-2">
                        {alert.status === 'active' && (
                          <button
                            onClick={() => acknowledgeAlert(alert.id)}
                            className="px-3 py-1 bg-yellow-500/20 text-yellow-400 rounded-lg hover:bg-yellow-500/30 transition-colors text-sm"
                          >
                            Acknowledge
                          </button>
                        )}
                        {alert.status === 'acknowledged' && (
                          <button
                            onClick={() => resolveAlert(alert.id)}
                            className="px-3 py-1 bg-green-500/20 text-green-400 rounded-lg hover:bg-green-500/30 transition-colors text-sm"
                          >
                            Resolve
                          </button>
                        )}
                      </div>
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
