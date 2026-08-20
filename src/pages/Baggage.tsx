import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Package, Search, Filter, DollarSign, Bus, User, Clock } from 'lucide-react';

interface BaggageFee {
  id: string;
  amount: number;
  bus_number: number;
  route: string;
  conductor_name: string;
  created_at: string;
}

export default function Baggage() {
  const [baggageFees, setBaggageFees] = useState<BaggageFee[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState('today');

  useEffect(() => {
    fetchBaggageFees();
    
    const subscription = supabase
      .channel('baggage-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, fetchBaggageFees)
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [dateFilter]);

  const fetchBaggageFees = async () => {
    try {
      let query = supabase
        .from('transactions')
        .select(`
          id,
          amount,
          created_at,
          boarded_passengers (
            trips (
              buses (bus_number, route),
              staff_users (full_name)
            )
          )
        `)
        .eq('type', 'baggage')
        .order('created_at', { ascending: false })
        .limit(100);

      // Apply date filter
      if (dateFilter === 'today') {
        const today = new Date().toISOString().split('T')[0];
        query = query.gte('created_at', today);
      } else if (dateFilter === 'week') {
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        query = query.gte('created_at', weekAgo);
      } else if (dateFilter === 'month') {
        const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        query = query.gte('created_at', monthAgo);
      }

      const { data, error } = await query;

      if (error) throw error;

      const feesData: BaggageFee[] = (data || []).map((fee: any) => ({
        id: fee.id,
        amount: fee.amount,
        bus_number: fee.boarded_passengers?.trips?.buses?.bus_number || 0,
        route: fee.boarded_passengers?.trips?.buses?.route || 'Unknown',
        conductor_name: fee.boarded_passengers?.trips?.staff_users?.full_name || 'Unknown',
        created_at: fee.created_at,
      }));

      setBaggageFees(feesData);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching baggage fees:', error);
      setLoading(false);
    }
  };

  const filteredFees = baggageFees.filter(fee => {
    return (
      fee.bus_number.toString().includes(searchTerm) ||
      fee.route.toLowerCase().includes(searchTerm.toLowerCase()) ||
      fee.conductor_name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  const totalRevenue = filteredFees.reduce((sum, fee) => sum + Number(fee.amount), 0);
  const totalFees = filteredFees.length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Baggage Management</h1>
        <p className="text-white/60">Monitor baggage fee transactions</p>
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
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:border-orange-500"
          >
            <option value="today">Today</option>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
            <option value="all">All Time</option>
          </select>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass-card p-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-lg bg-green-500/20 text-green-400">
              <DollarSign size={24} />
            </div>
            <div>
              <p className="text-white/60 text-sm">Total Revenue</p>
              <p className="text-white text-2xl font-bold">₱{totalRevenue.toLocaleString()}</p>
            </div>
          </div>
        </div>
        
        <div className="glass-card p-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-lg bg-blue-500/20 text-blue-400">
              <Package size={24} />
            </div>
            <div>
              <p className="text-white/60 text-sm">Total Fees</p>
              <p className="text-white text-2xl font-bold">{totalFees}</p>
            </div>
          </div>
        </div>
        
        <div className="glass-card p-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-lg bg-purple-500/20 text-purple-400">
              <Package size={24} />
            </div>
            <div>
              <p className="text-white/60 text-sm">Avg Fee</p>
              <p className="text-white text-2xl font-bold">
                ₱{totalFees > 0 ? (totalRevenue / totalFees).toFixed(2) : '0.00'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Baggage Fee List */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">Baggage Fee History</h2>
          <span className="text-white/60">{filteredFees.length} records</span>
        </div>

        {loading ? (
          <div className="text-center py-8">
            <div className="text-white">Loading baggage fees...</div>
          </div>
        ) : filteredFees.length === 0 ? (
          <div className="text-center py-8">
            <Package className="text-white/20 mx-auto mb-2" size={48} />
            <p className="text-white/40">No baggage fees found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left py-3 px-4 text-white/60 font-medium">Amount</th>
                  <th className="text-left py-3 px-4 text-white/60 font-medium">Bus</th>
                  <th className="text-left py-3 px-4 text-white/60 font-medium">Route</th>
                  <th className="text-left py-3 px-4 text-white/60 font-medium">Conductor</th>
                  <th className="text-left py-3 px-4 text-white/60 font-medium">Time</th>
                </tr>
              </thead>
              <tbody>
                {filteredFees.map((fee) => (
                  <tr key={fee.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                    <td className="py-4 px-4">
                      <span className="text-white font-medium">₱{Number(fee.amount).toFixed(2)}</span>
                    </td>
                    <td className="py-4 px-4">
                      <span className="text-white">#{fee.bus_number}</span>
                    </td>
                    <td className="py-4 px-4 text-white/80">{fee.route}</td>
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-2 text-white/80">
                        <User size={16} />
                        <span>{fee.conductor_name}</span>
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-2 text-white/60">
                        <Clock size={16} />
                        <span>{new Date(fee.created_at).toLocaleString()}</span>
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
