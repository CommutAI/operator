import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { FileText, Download, Calendar, Filter, DollarSign, Users, Bus } from 'lucide-react';

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
  const [dateRange, setDateRange] = useState('month');
  const [selectedReport, setSelectedReport] = useState('revenue');

  useEffect(() => {
    fetchReportData();
  }, [dateRange, selectedReport]);

  const fetchReportData = async () => {
    try {
      const now = new Date();
      let startDate: Date;
      
      if (dateRange === 'week') {
        startDate = new Date(now.setDate(now.getDate() - 7));
      } else if (dateRange === 'month') {
        startDate = new Date(now.setDate(now.getDate() - 30));
      } else if (dateRange === 'quarter') {
        startDate = new Date(now.setDate(now.getDate() - 90));
      } else {
        startDate = new Date(now.setFullYear(now.getFullYear() - 1));
      }

      const { data: tripsData } = await supabase
        .from('trips')
        .select('created_at, status')
        .gte('created_at', startDate.toISOString());

      const { data: passengersData } = await supabase
        .from('passenger_counts')
        .select('recorded_at, count')
        .gte('recorded_at', startDate.toISOString());

      const { data: transactionsData } = await supabase
        .from('transactions')
        .select('created_at, amount, type')
        .gte('created_at', startDate.toISOString());

      // Group by date
      const groupedData: Record<string, ReportData> = {};

      (tripsData || []).forEach((trip: any) => {
        const date = new Date(trip.created_at).toLocaleDateString();
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

  const exportToCSV = () => {
    const headers = ['Date', 'Trips', 'Passengers', 'Revenue', 'Baggage Fees'];
    const rows = reportData.map(d => [
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

  const totalTrips = reportData.reduce((sum, d) => sum + d.trips, 0);
  const totalPassengers = reportData.reduce((sum, d) => sum + d.passengers, 0);
  const totalRevenue = reportData.reduce((sum, d) => sum + d.revenue, 0);
  const totalBaggage = reportData.reduce((sum, d) => sum + d.baggage_fees, 0);

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

      {/* Filters */}
      <div className="glass-card p-4 flex items-center gap-4">
        <Calendar className="text-white/40" size={20} />
        <select
          value={dateRange}
          onChange={(e) => setDateRange(e.target.value)}
          className="px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:border-orange-500"
        >
          <option value="week">Last Week</option>
          <option value="month">Last Month</option>
          <option value="quarter">Last Quarter</option>
          <option value="year">Last Year</option>
        </select>
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
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">Daily Report</h2>
          <span className="text-white/60">{reportData.length} days</span>
        </div>

        {loading ? (
          <div className="text-center py-8">
            <div className="text-white">Loading report data...</div>
          </div>
        ) : reportData.length === 0 ? (
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
                {reportData.map((row, index) => (
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
