import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { FileText, Download, DollarSign, Users, Bus, Search } from 'lucide-react';

interface ReportData {
  date: string;
  trips: number;
  passengers: number;
  revenue: number;
  baggage_fees: number;
}

export default function Reports() {
  const [reportData, setReportData] = useState<ReportData[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState('monthly');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchReportData();
  }, [dateRange, customStartDate, customEndDate]);

  const fetchReportData = async () => {
    try {
      const now = new Date();
      let startDate: Date;
      let applyDateFilter = true;

      switch (dateRange) {
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

      const endDate = customEndDate ? new Date(customEndDate) : now;

      let tripsQuery = supabase.from('trips').select('started_at, status').limit(1000);
      let passengersQuery = supabase.from('passenger_counts').select('recorded_at, count').limit(1000);
      let transactionsQuery = supabase.from('transactions').select('created_at, amount, type').limit(1000);

      if (applyDateFilter) {
        tripsQuery = tripsQuery.gte('started_at', startDate.toISOString()).lte('started_at', endDate.toISOString());
        passengersQuery = passengersQuery.gte('recorded_at', startDate.toISOString()).lte('recorded_at', endDate.toISOString());
        transactionsQuery = transactionsQuery.gte('created_at', startDate.toISOString()).lte('created_at', endDate.toISOString());
      }

      const { data: tripsData, error: tripsError } = await tripsQuery;
      const { data: passengersData, error: passengersError } = await passengersQuery;
      const { data: transactionsData, error: transactionsError } = await transactionsQuery;

      if (tripsError) console.error('Trips error:', tripsError);
      if (passengersError) console.error('Passengers error:', passengersError);
      if (transactionsError) console.error('Transactions error:', transactionsError);

      // Group by date
      const groupedData: Record<string, ReportData> = {};

      (tripsData || []).forEach((trip: any) => {
        const date = new Date(trip.started_at).toLocaleDateString();
        if (!groupedData[date]) {
          groupedData[date] = { date, trips: 0, passengers: 0, revenue: 0, baggage_fees: 0 };
        }
        if (trip.status === 'completed') {
          groupedData[date].trips++;
        }
      });

      (passengersData || []).forEach((pc: any) => {
        const date = new Date(pc.recorded_at).toLocaleDateString();
        if (!groupedData[date]) {
          groupedData[date] = { date, trips: 0, passengers: 0, revenue: 0, baggage_fees: 0 };
        }
        groupedData[date].passengers += pc.count;
      });

      (transactionsData || []).forEach((tx: any) => {
        const date = new Date(tx.created_at).toLocaleDateString();
        if (!groupedData[date]) {
          groupedData[date] = { date, trips: 0, passengers: 0, revenue: 0, baggage_fees: 0 };
        }
        const amount = Number(tx.amount);
        groupedData[date].revenue += amount;
        if (tx.type === 'baggage') {
          groupedData[date].baggage_fees += amount;
        }
      });

      const data = Object.values(groupedData).sort((a, b) =>
        new Date(a.date).getTime() - new Date(b.date).getTime()
      );

      setReportData(data);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching report data:', error);
      setLoading(false);
    }
  };

  const filteredReportData = reportData.filter(row => {
    return row.date.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const exportToCSV = () => {
    const headers = ['Date', 'Trips', 'Passengers', 'Revenue', 'Baggage Fees'];
    const rows = filteredReportData.map(d => [
      d.date,
      d.trips,
      d.passengers,
      d.revenue.toFixed(2),
      d.baggage_fees.toFixed(2)
    ]);

    const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `report-${dateRange}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const totalTrips = filteredReportData.reduce((sum, d) => sum + d.trips, 0);
  const totalPassengers = filteredReportData.reduce((sum, d) => sum + d.passengers, 0);
  const totalRevenue = filteredReportData.reduce((sum, d) => sum + d.revenue, 0);
  const totalBaggage = filteredReportData.reduce((sum, d) => sum + d.baggage_fees, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Reports</h1>
          <p className="text-white/60">Generate and export operational reports</p>
        </div>
        <button
          onClick={exportToCSV}
          className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
        >
          <Download size={20} />
          Export CSV
        </button>
      </div>



      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="glass-card p-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-lg bg-blue-500/20 text-blue-400">
              <Bus size={24} />
            </div>
            <div>
              <p className="text-white/60 text-sm">Total Trips</p>
              <p className="text-white text-2xl font-bold">{totalTrips}</p>
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
              <p className="text-white text-2xl font-bold">{totalPassengers}</p>
            </div>
          </div>
        </div>

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
            <div className="p-3 rounded-lg bg-orange-500/20 text-orange-400">
              <FileText size={24} />
            </div>
            <div>
              <p className="text-white/60 text-sm">Baggage Fees</p>
              <p className="text-white text-2xl font-bold">₱{totalBaggage.toLocaleString()}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Report Table */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-white">
            {dateRange === 'custom' ? 'Custom Range' : dateRange === 'all' ? 'All Time' : dateRange.charAt(0).toUpperCase() + dateRange.slice(1)} Report
          </h2>
          <span className="text-white/60">{filteredReportData.length} records</span>
        </div>

        {/* Search Bar and Date Filter */}
        <div className="mb-6 flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/40" size={20} />
            <input
              type="text"
              placeholder="Search by date..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-orange-500"
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setDateRange('daily')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                dateRange === 'daily'
                  ? 'bg-orange-500 text-white'
                  : 'bg-white/10 text-white/60 hover:bg-white/20'
              }`}
            >
              Daily
            </button>
            <button
              onClick={() => setDateRange('weekly')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                dateRange === 'weekly'
                  ? 'bg-orange-500 text-white'
                  : 'bg-white/10 text-white/60 hover:bg-white/20'
              }`}
            >
              Weekly
            </button>
            <button
              onClick={() => setDateRange('monthly')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                dateRange === 'monthly'
                  ? 'bg-orange-500 text-white'
                  : 'bg-white/10 text-white/60 hover:bg-white/20'
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setDateRange('yearly')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                dateRange === 'yearly'
                  ? 'bg-orange-500 text-white'
                  : 'bg-white/10 text-white/60 hover:bg-white/20'
              }`}
            >
              Yearly
            </button>
            <button
              onClick={() => setDateRange('custom')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                dateRange === 'custom'
                  ? 'bg-orange-500 text-white'
                  : 'bg-white/10 text-white/60 hover:bg-white/20'
              }`}
            >
              Custom
            </button>
            <button
              onClick={() => setDateRange('all')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                dateRange === 'all'
                  ? 'bg-orange-500 text-white'
                  : 'bg-white/10 text-white/60 hover:bg-white/20'
              }`}
            >
              All Time
            </button>
          </div>
        </div>

        {dateRange === 'custom' && (
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
            <div className="text-white">Loading report data...</div>
          </div>
        ) : filteredReportData.length === 0 ? (
          <div className="text-center py-8">
            <FileText className="text-white/20 mx-auto mb-2" size={48} />
            <p className="text-white/40">No report data available</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left py-3 px-4 text-white/60 font-medium">Date</th>
                  <th className="text-left py-3 px-4 text-white/60 font-medium">Trips</th>
                  <th className="text-left py-3 px-4 text-white/60 font-medium">Passengers</th>
                  <th className="text-left py-3 px-4 text-white/60 font-medium">Revenue</th>
                  <th className="text-left py-3 px-4 text-white/60 font-medium">Baggage Fees</th>
                </tr>
              </thead>
              <tbody>
                {filteredReportData.map((row, index) => (
                  <tr key={index} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                    <td className="py-4 px-4 text-white font-medium">{row.date}</td>
                    <td className="py-4 px-4 text-white">{row.trips}</td>
                    <td className="py-4 px-4 text-white">{row.passengers}</td>
                    <td className="py-4 px-4 text-white">₱{row.revenue.toFixed(2)}</td>
                    <td className="py-4 px-4 text-white">₱{row.baggage_fees.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-white/20 bg-white/5">
                  <td className="py-4 px-4 text-white font-bold">Total</td>
                  <td className="py-4 px-4 text-white font-bold">{totalTrips}</td>
                  <td className="py-4 px-4 text-white font-bold">{totalPassengers}</td>
                  <td className="py-4 px-4 text-white font-bold">₱{totalRevenue.toFixed(2)}</td>
                  <td className="py-4 px-4 text-white font-bold">₱{totalBaggage.toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
