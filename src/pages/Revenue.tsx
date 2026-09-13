import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { DollarSign, TrendingUp, Calendar, BarChart3, PieChart } from 'lucide-react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

interface RevenueData {
  date: string;
  fare: number;
  baggage: number;
  penalty: number;
  total: number;
}

interface TypeDistribution {
  name: string;
  value: number;
}

const COLORS = ['#f97316', '#8b5cf6', '#ef4444'];

export default function Revenue() {
  const [revenueData, setRevenueData] = useState<RevenueData[]>([]);
  const [typeDistribution, setTypeDistribution] = useState<TypeDistribution[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState('monthly');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  useEffect(() => {
    fetchRevenueData();
  }, [dateFilter, customStartDate, customEndDate]);

  const fetchRevenueData = async () => {
    try {
      let query = supabase
        .from('transactions')
        .select('amount, type, created_at')
        .order('created_at', { ascending: true });

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
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      }

      if (applyDateFilter) {
        const endDate = customEndDate ? new Date(customEndDate) : now;
        query = query.gte('created_at', startDate.toISOString()).lte('created_at', endDate.toISOString());
      }

      const { data, error } = await query;

      if (error) throw error;

      // Group by date
      const groupedData: Record<string, RevenueData> = {};
      const typeTotals: Record<string, number> = { fare: 0, baggage: 0, penalty: 0 };

      (data || []).forEach((tx: any) => {
        const date = new Date(tx.created_at).toLocaleDateString();
        const amount = Number(tx.amount);
        const type = tx.type;

        if (!groupedData[date]) {
          groupedData[date] = { date, fare: 0, baggage: 0, penalty: 0, total: 0 };
        }

        if (type === 'fare' || type === 'baggage' || type === 'penalty') {
          (groupedData[date] as any)[type] += amount;
          typeTotals[type] += amount;
        }
        groupedData[date].total += amount;
      });

      const chartData = Object.values(groupedData);
      setRevenueData(chartData);

      const pieData: TypeDistribution[] = [
        { name: 'Fare', value: typeTotals.fare },
        { name: 'Baggage', value: typeTotals.baggage },
        { name: 'Penalty', value: typeTotals.penalty },
      ];
      setTypeDistribution(pieData);

      setLoading(false);
    } catch (error) {
      console.error('Error fetching revenue data:', error);
      setLoading(false);
    }
  };

  const totalRevenue = revenueData.reduce((sum, d) => sum + d.total, 0);
  const avgDailyRevenue = revenueData.length > 0 ? totalRevenue / revenueData.length : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Revenue Monitoring</h1>
        <p className="text-white/60">Track revenue trends and analytics</p>
      </div>

      {/* Filters */}
      <div className="glass-card p-4 flex flex-col md:flex-row gap-4">
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
        
        {dateFilter === 'custom' && (
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
              <TrendingUp size={24} />
            </div>
            <div>
              <p className="text-white/60 text-sm">Avg Daily</p>
              <p className="text-white text-2xl font-bold">₱{avgDailyRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
            </div>
          </div>
        </div>
        
        <div className="glass-card p-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-lg bg-purple-500/20 text-purple-400">
              <BarChart3 size={24} />
            </div>
            <div>
              <p className="text-white/60 text-sm">Transactions</p>
              <p className="text-white text-2xl font-bold">{revenueData.length}</p>
            </div>
          </div>
        </div>
        
        <div className="glass-card p-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-lg bg-orange-500/20 text-orange-400">
              <PieChart size={24} />
            </div>
            <div>
              <p className="text-white/60 text-sm">Data Points</p>
              <p className="text-white text-2xl font-bold">{revenueData.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue Trend */}
        <div className="glass-card p-6">
          <h2 className="text-xl font-bold text-white mb-6">Revenue Trend</h2>
          {loading ? (
            <div className="text-center py-8 text-white">Loading...</div>
          ) : revenueData.length === 0 ? (
            <div className="text-center py-8 text-white/40">No data available</div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={revenueData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                <XAxis dataKey="date" stroke="rgba(255,255,255,0.6)" />
                <YAxis stroke="rgba(255,255,255,0.6)" />
                <Tooltip
                  contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', border: '1px solid rgba(255,255,255,0.2)' }}
                  itemStyle={{ color: 'white' }}
                />
                <Legend />
                <Line type="monotone" dataKey="fare" stroke="#f97316" name="Fare" strokeWidth={2} />
                <Line type="monotone" dataKey="baggage" stroke="#8b5cf6" name="Baggage" strokeWidth={2} />
                <Line type="monotone" dataKey="penalty" stroke="#ef4444" name="Penalty" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Revenue by Type */}
        <div className="glass-card p-6">
          <h2 className="text-xl font-bold text-white mb-6">Revenue by Type</h2>
          {loading ? (
            <div className="text-center py-8 text-white">Loading...</div>
          ) : typeDistribution.filter(d => d.value > 0).length === 0 ? (
            <div className="text-center py-8 text-white/40">No data available</div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <RechartsPieChart>
                <Pie
                  data={typeDistribution}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${percent ? (percent * 100).toFixed(0) : 0}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {typeDistribution.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', border: '1px solid rgba(255,255,255,0.2)' }}
                  itemStyle={{ color: 'white' }}
                  formatter={(value: any) => `₱${Number(value || 0).toLocaleString()}`}
                />
              </RechartsPieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Daily Revenue Bar Chart */}
        <div className="glass-card p-6 lg:col-span-2">
          <h2 className="text-xl font-bold text-white mb-6">Daily Revenue</h2>
          {loading ? (
            <div className="text-center py-8 text-white">Loading...</div>
          ) : revenueData.length === 0 ? (
            <div className="text-center py-8 text-white/40">No data available</div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={revenueData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                <XAxis dataKey="date" stroke="rgba(255,255,255,0.6)" />
                <YAxis stroke="rgba(255,255,255,0.6)" />
                <Tooltip
                  contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', border: '1px solid rgba(255,255,255,0.2)' }}
                  itemStyle={{ color: 'white' }}
                  formatter={(value: any) => `₱${Number(value || 0).toLocaleString()}`}
                />
                <Legend />
                <Bar dataKey="fare" fill="#f97316" name="Fare" />
                <Bar dataKey="baggage" fill="#8b5cf6" name="Baggage" />
                <Bar dataKey="penalty" fill="#ef4444" name="Penalty" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}
