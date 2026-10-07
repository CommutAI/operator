import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Users, TrendingUp, Calendar, Clock, Search, Bus } from 'lucide-react';

interface PassengerCount {
  id: string;
  trip_id: string;
  bus_number: number;
  route: string;
  count: number;
  ai_count: number;
  recorded_at: string;
}

export default function Passengers() {
  const [passengerCounts, setPassengerCounts] = useState<PassengerCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState('all');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  // @ts-ignore - setters will be used for custom date range implementation
  void setCustomStartDate;
  void setCustomEndDate;

  useEffect(() => {
    fetchPassengerCounts();
    
    const subscription = supabase
      .channel('passenger-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'passenger_counts' }, fetchPassengerCounts)
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [dateFilter, customStartDate, customEndDate]);

  const fetchPassengerCounts = async () => {
    try {
      let query = supabase
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

      // Apply date filter
      const now = new Date();
      let startDate: Date;
      let applyDateFilter = true;
      
      switch (dateFilter) {
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
        case 'all':
          applyDateFilter = false;
          startDate = new Date(0);
          break;
        default:
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      }

      if (applyDateFilter) {
        const endDate = customEndDate ? new Date(customEndDate) : now;
        query = query.gte('recorded_at', startDate.toISOString()).lte('recorded_at', endDate.toISOString());
      }

      const { data, error } = await query;

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
      setLoading(false);
    } catch (error) {
      console.error('Error fetching passenger counts:', error);
      setLoading(false);
    }
  };

  const filteredCounts = passengerCounts.filter(pc => {
    return (
      pc.bus_number.toString().includes(searchTerm) ||
      pc.route.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  const totalPassengers = filteredCounts.reduce((sum, pc) => sum + pc.count, 0);
  const totalAIPassengers = filteredCounts.reduce((sum, pc) => sum + (pc.ai_count || 0), 0);
  const discrepancy = totalAIPassengers - totalPassengers;

  const getDiscrepancyColor = (diff: number) => {
    if (Math.abs(diff) < 5) return 'text-green-400';
    if (Math.abs(diff) < 10) return 'text-yellow-400';
    return 'text-red-400';
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Passenger Occupancy</h1>
        <p className="text-white/60">Monitor passenger counts and AI detection accuracy</p>
      </div>

      {/* Filters */}
      <div className="glass-card p-4 flex flex-col md:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/40" size={20} />
          <input
            type="text"
            placeholder="Search by bus number or route..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-orange-500"
          />
        </div>
        
        <div className="flex items-center gap-2">
          <Calendar className="text-white/40" size={20} />
          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:border-orange-500"
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
            <option value="custom">Custom Range</option>
            <option value="all">All Time</option>
          </select>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
              <TrendingUp size={24} />
            </div>
            <div>
              <p className="text-white/60 text-sm">AI Count</p>
              <p className="text-white text-2xl font-bold">{totalAIPassengers}</p>
            </div>
          </div>
        </div>
        
        <div className="glass-card p-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-lg bg-orange-500/20 text-orange-400">
              <Bus size={24} />
            </div>
            <div>
              <p className="text-white/60 text-sm">Records</p>
              <p className="text-white text-2xl font-bold">{filteredCounts.length}</p>
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

      {/* Passenger Count List */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">Passenger Records</h2>
          <span className="text-white/60">{filteredCounts.length} records</span>
        </div>

        {loading ? (
          <div className="text-center py-8">
            <div className="text-white">Loading passenger data...</div>
          </div>
        ) : filteredCounts.length === 0 ? (
          <div className="text-center py-8">
            <Users className="text-white/20 mx-auto mb-2" size={48} />
            <p className="text-white/40">No passenger records found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left py-3 px-4 text-white/60 font-medium">Bus</th>
                  <th className="text-left py-3 px-4 text-white/60 font-medium">Route</th>
                  <th className="text-left py-3 px-4 text-white/60 font-medium">QR Count</th>
                  <th className="text-left py-3 px-4 text-white/60 font-medium">AI Count</th>
                  <th className="text-left py-3 px-4 text-white/60 font-medium">Difference</th>
                  <th className="text-left py-3 px-4 text-white/60 font-medium">Recorded At</th>
                </tr>
              </thead>
              <tbody>
                {filteredCounts.map((pc) => {
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
                          <TrendingUp size={16} className="text-purple-400" />
                          <span className="text-white">{pc.ai_count || 0}</span>
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <span className={`font-medium ${getDiscrepancyColor(diff)}`}>
                          {diff > 0 ? '+' : ''}{diff}
                        </span>
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-2 text-white/60">
                          <Clock size={16} />
                          <span>{new Date(pc.recorded_at).toLocaleString()}</span>
                        </div>
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
