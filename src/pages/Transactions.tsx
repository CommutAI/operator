import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Receipt, Search, DollarSign, Clock, Bus, User } from 'lucide-react';

interface Transaction {
  id: string;
  amount: number;
  type: string;
  bus_number: number;
  route: string;
  conductor_name: string;
  card_number?: string;
  created_at: string;
}

export default function Transactions() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState('daily');
  const [typeFilter, setTypeFilter] = useState('all');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  useEffect(() => {
    fetchTransactions();

    const subscription = supabase
      .channel('transaction-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, fetchTransactions)
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [dateFilter, customStartDate, customEndDate]);

  const fetchTransactions = async () => {
    try {
      let query = supabase
        .from('transactions')
        .select(`
          id,
          amount,
          type,
          created_at,
          qr_cards (card_uid),
          trips!inner (
            id,
            conductor_id,
            buses (bus_number, route)
          ),
          staff_id
        `)
        .order('created_at', { ascending: false })
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
        query = query.gte('created_at', startDate.toISOString()).lte('created_at', endDate.toISOString());
      }

      const { data, error } = await query;

      if (error) throw error;

      // Fetch all conductors separately
      const conductorIds = [...new Set((data || []).map((tx: any) => tx.trips?.conductor_id).filter(Boolean))];
      const staffIds = [...new Set((data || []).map((tx: any) => tx.staff_id).filter(Boolean))];
      const allUserIds = [...new Set([...conductorIds, ...staffIds])];

      const { data: users } = await supabase
        .from('staff_users')
        .select('id, full_name')
        .in('id', allUserIds);

      const userMap = new Map(
        (users || []).map((u: any) => [u.id, u.full_name])
      );

      const transactionsData: Transaction[] = (data || []).map((tx: any) => ({
        id: tx.id,
        amount: tx.amount,
        type: tx.type,
        bus_number: tx.trips?.buses?.bus_number || 0,
        route: tx.trips?.buses?.route || 'Unknown',
        conductor_name: userMap.get(tx.trips?.conductor_id) || userMap.get(tx.staff_id) || 'Unknown',
        card_number: tx.qr_cards?.card_uid,
        created_at: tx.created_at,
      }));

      setTransactions(transactionsData);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching transactions:', error);
      setLoading(false);
    }
  };

  const filteredTransactions = transactions.filter(tx => {
    const matchesSearch =
      tx.bus_number.toString().includes(searchTerm) ||
      tx.route.toLowerCase().includes(searchTerm.toLowerCase()) ||
      tx.conductor_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      tx.card_number?.includes(searchTerm);

    const matchesType = typeFilter === 'all' || tx.type === typeFilter;

    return matchesSearch && matchesType;
  });

  const totalRevenue = filteredTransactions.reduce((sum, tx) => sum + Number(tx.amount), 0);
  const totalTransactions = filteredTransactions.length;

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'fare': return 'text-green-400 bg-green-500/20';
      case 'baggage': return 'text-orange-400 bg-orange-500/20';
      case 'penalty': return 'text-red-400 bg-red-500/20';
      default: return 'text-white/60 bg-white/10';
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Card Management</h1>
        <p className="text-white/60">QR card transactions</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
              <Receipt size={24} />
            </div>
            <div>
              <p className="text-white/60 text-sm">Transactions</p>
              <p className="text-white text-2xl font-bold">{totalTransactions}</p>
            </div>
          </div>
        </div>
        
        <div className="glass-card p-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-lg bg-purple-500/20 text-purple-400">
              <Bus size={24} />
            </div>
            <div>
              <p className="text-white/60 text-sm">Avg Transaction</p>
              <p className="text-white text-2xl font-bold">
                ₱{totalTransactions > 0 ? (totalRevenue / totalTransactions).toFixed(2) : '0.00'}
              </p>
            </div>
          </div>
        </div>
        
        <div className="glass-card p-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-lg bg-orange-500/20 text-orange-400">
              <User size={24} />
            </div>
            <div>
              <p className="text-white/60 text-sm">Unique Cards</p>
              <p className="text-white text-2xl font-bold">
                {new Set(transactions.map(t => t.card_number)).size}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Transaction List */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-white">Transaction History</h2>
          <span className="text-white/60">{filteredTransactions.length} records</span>
        </div>

        {/* Search Bar and Filters */}
        <div className="mb-6 flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/40" size={20} />
            <input
              type="text"
              placeholder="Search by bus, route, conductor, or card number..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-orange-500"
            />
          </div>

          <div className="flex items-center gap-2">
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

            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:border-orange-500"
            >
              <option value="all">All Types</option>
              <option value="fare">Fare</option>
              <option value="baggage">Baggage</option>
              <option value="penalty">Penalty</option>
            </select>
          </div>
        </div>

        {dateFilter === 'custom' && (
          <div className="flex items-center gap-4 mb-6">
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

        {loading ? (
          <div className="text-center py-8">
            <div className="text-white">Loading transactions...</div>
          </div>
        ) : filteredTransactions.length === 0 ? (
          <div className="text-center py-8">
            <Receipt className="text-white/20 mx-auto mb-2" size={48} />
            <p className="text-white/40">No transactions found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left py-3 px-4 text-white/60 font-medium">Type</th>
                  <th className="text-left py-3 px-4 text-white/60 font-medium">Amount</th>
                  <th className="text-left py-3 px-4 text-white/60 font-medium">Bus</th>
                  <th className="text-left py-3 px-4 text-white/60 font-medium">Route</th>
                  <th className="text-left py-3 px-4 text-white/60 font-medium">Conductor</th>
                  <th className="text-left py-3 px-4 text-white/60 font-medium">Card Number</th>
                  <th className="text-left py-3 px-4 text-white/60 font-medium">Time</th>
                </tr>
              </thead>
              <tbody>
                {filteredTransactions.map((tx) => (
                  <tr key={tx.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                    <td className="py-4 px-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${getTypeColor(tx.type)}`}>
                        {tx.type}
                      </span>
                    </td>
                    <td className="py-4 px-4">
                      <span className="text-white font-medium">₱{Number(tx.amount).toFixed(2)}</span>
                    </td>
                    <td className="py-4 px-4">
                      <span className="text-white">#{tx.bus_number}</span>
                    </td>
                    <td className="py-4 px-4 text-white/80">{tx.route}</td>
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-2 text-white/80">
                        <User size={16} />
                        <span>{tx.conductor_name}</span>
                      </div>
                    </td>
                    <td className="py-4 px-4 text-white/80 font-mono text-sm">
                      {tx.card_number || 'N/A'}
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-2 text-white/60">
                        <Clock size={16} />
                        <span>{new Date(tx.created_at).toLocaleString()}</span>
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
