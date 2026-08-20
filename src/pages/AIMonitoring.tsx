import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Brain, AlertTriangle, CheckCircle, Clock, Search, Filter, Bus, User } from 'lucide-react';

interface FareIrregularity {
  id: string;
  type: string;
  bus_number: number;
  route: string;
  conductor_name: string;
  detected_at: string;
  resolved: boolean;
  resolved_at?: string;
  notes?: string;
}

export default function AIMonitoring() {
  const [irregularities, setIrregularities] = useState<FareIrregularity[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');

  useEffect(() => {
    fetchIrregularities();
    
    const subscription = supabase
      .channel('irregularity-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fare_irregularities' }, fetchIrregularities)
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const fetchIrregularities = async () => {
    try {
      const { data, error } = await supabase
        .from('fare_irregularities')
        .select(`
          id,
          type,
          detected_at,
          resolved,
          resolved_at,
          notes,
          trips (
            buses (bus_number, route),
            staff_users (full_name)
          )
        `)
        .order('detected_at', { ascending: false })
        .limit(100);

      if (error) throw error;

      const irregularitiesData: FareIrregularity[] = (data || []).map((ir: any) => ({
        id: ir.id,
        type: ir.type,
        bus_number: ir.trips?.buses?.bus_number || 0,
        route: ir.trips?.buses?.route || 'Unknown',
        conductor_name: ir.trips?.staff_users?.full_name || 'Unknown',
        detected_at: ir.detected_at,
        resolved: ir.resolved,
        resolved_at: ir.resolved_at,
        notes: ir.notes,
      }));

      setIrregularities(irregularitiesData);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching irregularities:', error);
      setLoading(false);
    }
  };

  const filteredIrregularities = irregularities.filter(ir => {
    const matchesSearch = 
      ir.bus_number.toString().includes(searchTerm) ||
      ir.route.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ir.conductor_name.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || 
      (statusFilter === 'resolved' && ir.resolved) ||
      (statusFilter === 'unresolved' && !ir.resolved);
    
    const matchesType = typeFilter === 'all' || ir.type === typeFilter;
    
    return matchesSearch && matchesStatus && matchesType;
  });

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'no_ticket': return 'text-red-400 bg-red-500/20';
      case 'invalid_ticket': return 'text-orange-400 bg-orange-500/20';
      case 'overcrowding': return 'text-yellow-400 bg-yellow-500/20';
      case 'suspicious_activity': return 'text-purple-400 bg-purple-500/20';
      default: return 'text-white/60 bg-white/10';
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'no_ticket': return 'No Ticket';
      case 'invalid_ticket': return 'Invalid Ticket';
      case 'overcrowding': return 'Overcrowding';
      case 'suspicious_activity': return 'Suspicious Activity';
      default: return type;
    }
  };

  const resolveIrregularity = async (id: string) => {
    try {
      const { error } = await supabase
        .from('fare_irregularities')
        .update({ resolved: true, resolved_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;
      fetchIrregularities();
    } catch (error) {
      console.error('Error resolving irregularity:', error);
    }
  };

  const unresolvedCount = irregularities.filter(ir => !ir.resolved).length;
  const resolvedCount = irregularities.filter(ir => ir.resolved).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">AI Irregularity Monitoring</h1>
        <p className="text-white/60">Monitor AI-detected fare irregularities</p>
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
            <option value="unresolved">Unresolved</option>
            <option value="resolved">Resolved</option>
          </select>
          
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:border-orange-500"
          >
            <option value="all">All Types</option>
            <option value="no_ticket">No Ticket</option>
            <option value="invalid_ticket">Invalid Ticket</option>
            <option value="overcrowding">Overcrowding</option>
            <option value="suspicious_activity">Suspicious Activity</option>
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
              <p className="text-white/60 text-sm">Unresolved</p>
              <p className="text-white text-2xl font-bold">{unresolvedCount}</p>
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
            <div className="p-3 rounded-lg bg-purple-500/20 text-purple-400">
              <Brain size={24} />
            </div>
            <div>
              <p className="text-white/60 text-sm">Total Detected</p>
              <p className="text-white text-2xl font-bold">{irregularities.length}</p>
            </div>
          </div>
        </div>
        
        <div className="glass-card p-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-lg bg-blue-500/20 text-blue-400">
              <Bus size={24} />
            </div>
            <div>
              <p className="text-white/60 text-sm">Resolution Rate</p>
              <p className="text-white text-2xl font-bold">
                {irregularities.length > 0 
                  ? Math.round((resolvedCount / irregularities.length) * 100) 
                  : 0}%
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Irregularity List */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">Detected Irregularities</h2>
          <span className="text-white/60">{filteredIrregularities.length} records</span>
        </div>

        {loading ? (
          <div className="text-center py-8">
            <div className="text-white">Loading irregularities...</div>
          </div>
        ) : filteredIrregularities.length === 0 ? (
          <div className="text-center py-8">
            <Brain className="text-white/20 mx-auto mb-2" size={48} />
            <p className="text-white/40">No irregularities found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left py-3 px-4 text-white/60 font-medium">Type</th>
                  <th className="text-left py-3 px-4 text-white/60 font-medium">Bus</th>
                  <th className="text-left py-3 px-4 text-white/60 font-medium">Route</th>
                  <th className="text-left py-3 px-4 text-white/60 font-medium">Conductor</th>
                  <th className="text-left py-3 px-4 text-white/60 font-medium">Status</th>
                  <th className="text-left py-3 px-4 text-white/60 font-medium">Detected</th>
                  <th className="text-left py-3 px-4 text-white/60 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredIrregularities.map((ir) => (
                  <tr key={ir.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                    <td className="py-4 px-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${getTypeColor(ir.type)}`}>
                        {getTypeLabel(ir.type)}
                      </span>
                    </td>
                    <td className="py-4 px-4">
                      <span className="text-white font-medium">#{ir.bus_number}</span>
                    </td>
                    <td className="py-4 px-4 text-white/80">{ir.route}</td>
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-2 text-white/80">
                        <User size={16} />
                        <span>{ir.conductor_name}</span>
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      {ir.resolved ? (
                        <span className="px-3 py-1 rounded-full text-xs font-medium text-green-400 bg-green-500/20">
                          Resolved
                        </span>
                      ) : (
                        <span className="px-3 py-1 rounded-full text-xs font-medium text-red-400 bg-red-500/20">
                          Unresolved
                        </span>
                      )}
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-2 text-white/60">
                        <Clock size={16} />
                        <span>{new Date(ir.detected_at).toLocaleString()}</span>
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      {!ir.resolved && (
                        <button
                          onClick={() => resolveIrregularity(ir.id)}
                          className="px-3 py-1 bg-green-500/20 text-green-400 rounded-lg hover:bg-green-500/30 transition-colors text-sm"
                        >
                          Resolve
                        </button>
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
