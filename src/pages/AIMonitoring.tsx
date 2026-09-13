import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Brain, AlertTriangle, CheckCircle, Clock, Search, Filter, Bus, User, Users, TrendingUp } from 'lucide-react';

interface FareIrregularity {
  id: string;
  type: string;
  bus_number: number;
  route: string;
  conductor_name: string;
  detected_at: string;
  resolved: boolean;
  resolved_at?: string;
  description?: string;
}

interface PassengerCount {
  id: string;
  trip_id: string;
  bus_number: number;
  route: string;
  count: number;
  ai_count: number;
  recorded_at: string;
}

export default function AIMonitoring() {
  const [irregularities, setIrregularities] = useState<FareIrregularity[]>([]);
  const [passengerCounts, setPassengerCounts] = useState<PassengerCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');

  useEffect(() => {
    fetchIrregularities();
    fetchPassengerCounts();
    
    const irregularitySubscription = supabase
      .channel('irregularity-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fare_irregularities' }, fetchIrregularities)
      .subscribe();

    const passengerSubscription = supabase
      .channel('passenger-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'passenger_counts' }, fetchPassengerCounts)
      .subscribe();

    return () => {
      irregularitySubscription.unsubscribe();
      passengerSubscription.unsubscribe();
    };
  }, []);

  const fetchPassengerCounts = async () => {
    try {
      const { data, error } = await supabase
        .from('passenger_counts')
        .select(`
          id,
          count,
          ai_count,
          recorded_at,
          trips (
            id,
            buses (bus_number, route)
          )
        `)
        .order('recorded_at', { ascending: false })
        .limit(100);

      if (error) throw error;

      const counts: PassengerCount[] = (data || []).map((pc: any) => ({
        id: pc.id,
        trip_id: pc.trips?.id,
        bus_number: pc.trips?.buses?.bus_number || 0,
        route: pc.trips?.buses?.route || 'Unknown',
        count: pc.count,
        ai_count: pc.ai_count,
        recorded_at: pc.recorded_at,
      }));

      setPassengerCounts(counts);
    } catch (error) {
      console.error('Error fetching passenger counts:', error);
    }
  };

  const fetchIrregularities = async () => {
    try {
      const { data: irregularitiesData, error: irregularitiesError } = await supabase
        .from('fare_irregularities')
        .select(`
          id,
          type,
          description,
          detected_at,
          resolved,
          resolved_at,
          trips (
            id,
            conductor_id,
            buses (bus_number, route)
          )
        `)
        .order('detected_at', { ascending: false })
        .limit(100);

      if (irregularitiesError) throw irregularitiesError;

      // Fetch all conductors separately
      const conductorIds = [...new Set((irregularitiesData || []).map((ir: any) => ir.trips?.conductor_id).filter(Boolean))];
      const { data: conductors } = await supabase
        .from('staff_users')
        .select('id, full_name')
        .in('id', conductorIds);

      const conductorMap = new Map(
        (conductors || []).map((c: any) => [c.id, c.full_name])
      );

      const irregularities: FareIrregularity[] = (irregularitiesData || []).map((ir: any) => ({
        id: ir.id,
        type: ir.type,
        bus_number: ir.trips?.buses?.bus_number || 0,
        route: ir.trips?.buses?.route || 'Unknown',
        conductor_name: conductorMap.get(ir.trips?.conductor_id) || 'Unknown',
        detected_at: ir.detected_at,
        resolved: ir.resolved,
        resolved_at: ir.resolved_at,
        description: ir.description,
      }));

      setIrregularities(irregularities);
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

  // Passenger analytics calculations
  const totalPassengers = passengerCounts.reduce((sum, pc) => sum + pc.count, 0);
  const totalAIPassengers = passengerCounts.reduce((sum, pc) => sum + (pc.ai_count || 0), 0);
  const discrepancy = totalAIPassengers - totalPassengers;

  const getDiscrepancyColor = (diff: number) => {
    if (Math.abs(diff) < 5) return 'text-green-400';
    if (Math.abs(diff) < 10) return 'text-yellow-400';
    return 'text-red-400';
  };

  const filteredPassengerCounts = passengerCounts.filter(pc => {
    return (
      pc.bus_number.toString().includes(searchTerm) ||
      pc.route.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">AI Monitoring</h1>
        <p className="text-white/60">AI-detected fare irregularities and passenger count verification</p>
      </div>

      {/* Focused Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-card p-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-lg bg-red-500/20 text-red-400">
              <AlertTriangle size={24} />
            </div>
            <div>
              <p className="text-white/60 text-sm">Active Irregularities</p>
              <p className="text-white text-2xl font-bold">{unresolvedCount}</p>
            </div>
          </div>
        </div>
        
        <div className="glass-card p-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-lg bg-blue-500/20 text-blue-400">
              <Users size={24} />
            </div>
            <div>
              <p className="text-white/60 text-sm">QR Scans</p>
              <p className="text-white text-2xl font-bold">{totalPassengers}</p>
            </div>
          </div>
        </div>
        
        <div className="glass-card p-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-lg bg-purple-500/20 text-purple-400">
              <Brain size={24} />
            </div>
            <div>
              <p className="text-white/60 text-sm">AI Count</p>
              <p className="text-white text-2xl font-bold">{totalAIPassengers}</p>
            </div>
          </div>
        </div>
        
        <div className="glass-card p-4">
          <div className="flex items-center gap-3">
            <div className={`p-3 rounded-lg bg-white/10 ${getDiscrepancyColor(discrepancy)}`}>
              <TrendingUp size={24} />
            </div>
            <div>
              <p className="text-white/60 text-sm">Discrepancy</p>
              <p className={`text-2xl font-bold ${getDiscrepancyColor(discrepancy)}`}>
                {discrepancy > 0 ? '+' : ''}{discrepancy}
              </p>
            </div>
          </div>
        </div>
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Fare Irregularities Section */}
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <AlertTriangle className="text-red-400" size={20} />
            AI-Detected Irregularities
          </h2>

          <div className="glass-card p-6">
            <div className="flex items-center justify-between mb-6">
              <span className="text-white/60">{filteredIrregularities.length} irregularities</span>
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
              <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="text-left py-3 px-4 text-white/60 font-medium">Type</th>
                      <th className="text-left py-3 px-4 text-white/60 font-medium">Bus</th>
                      <th className="text-left py-3 px-4 text-white/60 font-medium">Route</th>
                      <th className="text-left py-3 px-4 text-white/60 font-medium">Status</th>
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
                          {ir.resolved ? (
                            <span className="px-3 py-1 rounded-full text-xs font-medium text-green-400 bg-green-500/20">
                              Resolved
                            </span>
                          ) : (
                            <span className="px-3 py-1 rounded-full text-xs font-medium text-red-400 bg-red-500/20">
                              Active
                            </span>
                          )}
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

        {/* Passenger Count Verification Section */}
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Users className="text-blue-400" size={20} />
            Passenger Count Verification
          </h2>

          <div className="glass-card p-6">
            <div className="flex items-center justify-between mb-6">
              <span className="text-white/60">{filteredPassengerCounts.length} records</span>
            </div>

            {loading ? (
              <div className="text-center py-8">
                <div className="text-white">Loading passenger data...</div>
              </div>
            ) : filteredPassengerCounts.length === 0 ? (
              <div className="text-center py-8">
                <Users className="text-white/20 mx-auto mb-2" size={48} />
                <p className="text-white/40">No passenger records found</p>
              </div>
            ) : (
              <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="text-left py-3 px-4 text-white/60 font-medium">Bus</th>
                      <th className="text-left py-3 px-4 text-white/60 font-medium">Route</th>
                      <th className="text-left py-3 px-4 text-white/60 font-medium">QR Count</th>
                      <th className="text-left py-3 px-4 text-white/60 font-medium">AI Count</th>
                      <th className="text-left py-3 px-4 text-white/60 font-medium">Difference</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPassengerCounts.map((pc) => {
                      const diff = (pc.ai_count || 0) - pc.count;
                      
                      return (
                        <tr key={pc.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                          <td className="py-4 px-4">
                            <span className="text-white font-medium">#{pc.bus_number}</span>
                          </td>
                          <td className="py-4 px-4 text-white/80">{pc.route}</td>
                          <td className="py-4 px-4">
                            <div className="flex items-center gap-2">
                              <Users size={16} className="text-blue-400" />
                              <span className="text-white">{pc.count}</span>
                            </div>
                          </td>
                          <td className="py-4 px-4">
                            <div className="flex items-center gap-2">
                              <Brain size={16} className="text-purple-400" />
                              <span className="text-white">{pc.ai_count || 0}</span>
                            </div>
                          </td>
                          <td className="py-4 px-4">
                            <span className={`font-medium ${getDiscrepancyColor(diff)}`}>
                              {diff > 0 ? '+' : ''}{diff}
                            </span>
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
      </div>
    </div>
  );
}
