import { useState, useEffect } from 'react';
import { FileText, Download, Calendar, TrendingUp, Users, DollarSign, Bus, Activity, ArrowUp, ArrowDown, Search, ChevronLeft, ChevronRight, Clock, MapPin, CheckCircle, AlertCircle, Settings, X, SortAsc, SortDesc } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface Transaction {
  id: string;
  type: string;
  amount: number;
  channel: string;
  fare?: number;
  baggage?: number;
  created_at: string;
  staff?: {
    full_name: string;
  };
}

interface Trip {
  id: string;
  status: string;
  started_at: string;
  buses?: {
    plate_number: string;
    route: string;
  };
  conductor_staff?: {
    full_name: string;
  };
}

export default function Reports() {
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('trips');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [reportType, setReportType] = useState('trips');
  const [stats, setStats] = useState({
    totalRevenue: 0,
    totalTrips: 0,
    totalPassengers: 0,
    activeBuses: 0,
    avgTripDuration: 0,
    avgRevenuePerTrip: 0,
    avgPassengersPerTrip: 0,
    completedTrips: 0,
    cancelledTrips: 0,
    activeTrips: 0,
  });
  const [recentActivity, setRecentActivity] = useState<Trip[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [transactionSearchTerm, setTransactionSearchTerm] = useState('');
  const [transactionsCurrentPage, setTransactionsCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [transactionSort, setTransactionSort] = useState({ field: 'created_at', direction: 'desc' });
  const [showExportColumns, setShowExportColumns] = useState(false);
  const [selectedExportColumns, setSelectedExportColumns] = useState<string[]>([]);

  const availableColumns = {
    trips: [
      { id: 'id', label: 'Trip ID' },
      { id: 'plate_number', label: 'Bus Plate' },
      { id: 'route', label: 'Route' },
      { id: 'conductor', label: 'Conductor' },
      { id: 'started_at', label: 'Start Time' },
      { id: 'ended_at', label: 'End Time' },
      { id: 'status', label: 'Status' },
      { id: 'duration', label: 'Duration (min)' },
    ],
    revenue: [
      { id: 'id', label: 'Transaction ID' },
      { id: 'type', label: 'Type' },
      { id: 'amount', label: 'Amount' },
      { id: 'fare', label: 'Fare' },
      { id: 'baggage', label: 'Baggage' },
      { id: 'channel', label: 'Channel' },
      { id: 'staff', label: 'Staff' },
      { id: 'created_at', label: 'Created At' },
    ],
  };

  useEffect(() => {
    fetchStats();
    fetchRecentActivity();
    fetchTransactions();
  }, []);

  useEffect(() => {
    setSelectedExportColumns(availableColumns[reportType as keyof typeof availableColumns]?.map(col => col.id) || []);
  }, [reportType]);

  useEffect(() => {
    fetchStats();
    fetchRecentActivity();
    fetchTransactions();
  }, []);

  const fetchStats = async () => {
    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const [revenueData, tripsData, passengersData, busesData] = await Promise.all([
        supabase.from('transactions').select('amount, type, created_at').gte('created_at', sevenDaysAgo),
        supabase.from('trips').select('*, passenger_counts(count)'),
        supabase.from('passenger_counts').select('count'),
        supabase.from('buses').select('*').eq('status', 'active'),
      ]);

      const totalRevenue = (revenueData.data || []).reduce((sum, t) => sum + (t.amount || 0), 0);
      const totalTrips = tripsData.data?.length || 0;
      const totalPassengers = (passengersData.data || []).reduce((sum, p) => sum + (p.count || 0), 0);
      const activeBuses = busesData.data?.length || 0;
      const completedTrips = tripsData.data?.filter(t => t.status === 'completed').length || 0;
      const cancelledTrips = tripsData.data?.filter(t => t.status === 'cancelled').length || 0;
      const activeTrips = tripsData.data?.filter(t => t.status === 'in_progress').length || 0;

      const completedTripsWithDuration = tripsData.data?.filter(t => t.status === 'completed' && t.started_at && t.ended_at) || [];
      const avgTripDuration = completedTripsWithDuration.length > 0
        ? completedTripsWithDuration.reduce((sum, t) => sum + (new Date(t.ended_at).getTime() - new Date(t.started_at).getTime()) / 60000, 0) / completedTripsWithDuration.length
        : 0;

      const avgRevenuePerTrip = totalTrips > 0 ? totalRevenue / totalTrips : 0;
      const avgPassengersPerTrip = totalTrips > 0 ? totalPassengers / totalTrips : 0;

      setStats({
        totalRevenue,
        totalTrips,
        totalPassengers,
        activeBuses,
        avgTripDuration,
        avgRevenuePerTrip,
        avgPassengersPerTrip,
        completedTrips,
        cancelledTrips,
        activeTrips,
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
      setStats({
        totalRevenue: 0,
        totalTrips: 0,
        totalPassengers: 0,
        activeBuses: 0,
        avgTripDuration: 0,
        avgRevenuePerTrip: 0,
        avgPassengersPerTrip: 0,
        completedTrips: 0,
        cancelledTrips: 0,
        activeTrips: 0,
      });
    }
  };

  const fetchRecentActivity = async () => {
    try {
      const { data } = await supabase
        .from('trips')
        .select('*, buses(*), conductor_staff:staff_users(*)')
        .order('started_at', { ascending: false })
        .limit(5);

      setRecentActivity(data || []);
    } catch (error) {
      console.error('Error fetching recent activity:', error);
      setRecentActivity([]);
    }
  };

  const fetchTransactions = async () => {
    try {
      const { data, error } = await supabase
        .from('transactions')
        .select('*, staff:staff_users(*)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setTransactions(data || []);
    } catch (error) {
      console.error('Error fetching transactions:', error);
      setTransactions([]);
    }
  };

  const filteredTransactions = transactions.filter(transaction => {
    const matchesSearch = transaction.channel?.toLowerCase().includes(transactionSearchTerm.toLowerCase()) ||
                         transaction.staff?.full_name?.toLowerCase().includes(transactionSearchTerm.toLowerCase()) ||
                         transaction.fare?.toString().includes(transactionSearchTerm) ||
                         transaction.baggage?.toString().includes(transactionSearchTerm) ||
                         transaction.id?.toLowerCase().includes(transactionSearchTerm.toLowerCase());
    return matchesSearch;
  }).sort((a, b) => {
    const aValue = a[transactionSort.field as keyof Transaction];
    const bValue = b[transactionSort.field as keyof Transaction];
    if (transactionSort.direction === 'asc') {
      return (aValue || '') > (bValue || '') ? 1 : -1;
    }
    return (aValue || '') < (bValue || '') ? 1 : -1;
  });

  const transactionsTotalPages = Math.ceil(filteredTransactions.length / itemsPerPage);
  const paginatedTransactions = filteredTransactions.slice(
    (transactionsCurrentPage - 1) * itemsPerPage,
    transactionsCurrentPage * itemsPerPage
  );

  useEffect(() => {
    setTransactionsCurrentPage(1);
  }, [transactionSearchTerm]);

  const transactionTypeColors = {
    fare_validation: 'bg-blue-500/20 text-blue-400 border-blue-500/50',
    balance_topup: 'bg-green-500/20 text-green-400 border-green-500/50',
    card_issuance: 'bg-purple-500/20 text-purple-400 border-purple-500/50',
  };

  const tabs = [
    { id: 'trips', label: 'Trips', icon: Bus },
    { id: 'transactions', label: 'Transactions', icon: DollarSign },
    { id: 'reports', label: 'Reports', icon: FileText },
  ];

  const handleSort = (field: string) => {
    if (transactionSort.field === field) {
      setTransactionSort({
        field,
        direction: transactionSort.direction === 'asc' ? 'desc' : 'asc'
      });
    } else {
      setTransactionSort({ field, direction: 'asc' });
    }
  };

  const renderSortIcon = (field: string) => {
    if (transactionSort.field !== field) return null;
    return transactionSort.direction === 'asc' ? <SortAsc size={14} /> : <SortDesc size={14} />;
  };

  const exportToCSV = () => {
    let headers: string[] = [];
    let rows: any[] = [];
    let fileName = '';

    if (activeTab === 'reports') {
      if (reportType === 'trips') {
        headers = selectedExportColumns.map(colId => {
          const col = availableColumns.trips.find(c => c.id === colId);
          return col ? col.label : colId;
        });

        rows = recentActivity.map(trip => {
          const row: any = {};
          if (selectedExportColumns.includes('id')) row['Trip ID'] = trip.id;
          if (selectedExportColumns.includes('plate_number')) row['Bus Plate'] = trip.buses?.plate_number || 'N/A';
          if (selectedExportColumns.includes('route')) row['Route'] = trip.buses?.route || 'N/A';
          if (selectedExportColumns.includes('conductor')) row['Conductor'] = trip.conductor_staff?.full_name || 'N/A';
          if (selectedExportColumns.includes('started_at')) row['Start Time'] = new Date(trip.started_at).toLocaleString();
          if (selectedExportColumns.includes('ended_at')) row['End Time'] = 'N/A';
          if (selectedExportColumns.includes('status')) row['Status'] = trip.status;
          if (selectedExportColumns.includes('duration')) row['Duration (min)'] = 'N/A';
          return row;
        });
        fileName = 'trips_report';
      } else if (reportType === 'revenue') {
        headers = selectedExportColumns.map(colId => {
          const col = availableColumns.revenue.find(c => c.id === colId);
          return col ? col.label : colId;
        });

        rows = transactions.map(tx => {
          const row: any = {};
          if (selectedExportColumns.includes('id')) row['Transaction ID'] = tx.id;
          if (selectedExportColumns.includes('type')) row['Type'] = tx.type;
          if (selectedExportColumns.includes('amount')) row['Amount'] = tx.amount;
          if (selectedExportColumns.includes('fare')) row['Fare'] = tx.fare || 0;
          if (selectedExportColumns.includes('baggage')) row['Baggage'] = tx.baggage || 0;
          if (selectedExportColumns.includes('channel')) row['Channel'] = tx.channel;
          if (selectedExportColumns.includes('staff')) row['Staff'] = tx.staff?.full_name || 'N/A';
          if (selectedExportColumns.includes('created_at')) row['Created At'] = new Date(tx.created_at).toLocaleString();
          return row;
        });
        fileName = 'revenue_report';
      }
    } else {
      headers = ['Date', 'Type', 'Amount', 'Channel', 'Staff'];
      rows = filteredTransactions.map(t => [
        new Date(t.created_at).toLocaleString(),
        t.type,
        t.amount,
        t.channel,
        t.staff?.full_name || 'N/A'
      ]);
      fileName = 'transactions';
    }

    const csvContent = [headers, ...rows.map(r => Object.values(r))].map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileName}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-white text-3xl font-bold mb-2">Reports Dashboard</h1>
          <p className="text-white/60">System analytics and report generation</p>
        </div>
        {activeTab === 'reports' && (
          <div className="flex gap-3">
            <button
              onClick={() => setShowExportColumns(!showExportColumns)}
              className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-xl flex items-center gap-2 transition-colors"
            >
              <Settings size={18} />
              Columns
            </button>
            <button
              onClick={exportToCSV}
              className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-xl flex items-center gap-2 transition-colors"
            >
              <Download size={18} />
              Export CSV
            </button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="glass-card p-2">
        <div className="flex gap-2">
          {tabs.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 rounded-xl transition-colors ${
                  activeTab === tab.id
                    ? 'bg-orange-500 text-white'
                    : 'text-white/60 hover:bg-white/10 hover:text-white'
                }`}
              >
                <Icon size={18} />
                <span className="font-medium">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Export Column Selector */}
      {showExportColumns && activeTab === 'reports' && (
        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white text-lg font-bold">Select Export Columns</h3>
            <button
              onClick={() => setShowExportColumns(false)}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            >
              <X size={20} className="text-white/70" />
            </button>
          </div>
          <div className="mb-4">
            <label className="text-white/60 text-sm mb-2 block">Report Type</label>
            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value)}
              className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-orange-500"
            >
              <option value="trips">Trips</option>
              <option value="revenue">Revenue</option>
            </select>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {availableColumns[reportType as keyof typeof availableColumns]?.map(col => (
              <label key={col.id} className="flex items-center gap-2 p-3 bg-white/5 rounded-lg hover:bg-white/10 cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={selectedExportColumns.includes(col.id)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedExportColumns([...selectedExportColumns, col.id]);
                    } else {
                      setSelectedExportColumns(selectedExportColumns.filter(id => id !== col.id));
                    }
                  }}
                  className="w-4 h-4 rounded border-white/20 bg-white/10 text-orange-500 focus:ring-orange-500"
                />
                <span className="text-white/80 text-sm">{col.label}</span>
              </label>
            ))}
          </div>
          <div className="flex gap-2 mt-4">
            <button
              onClick={() => setSelectedExportColumns(availableColumns[reportType as keyof typeof availableColumns]?.map(col => col.id) || [])}
              className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors text-sm"
            >
              Select All
            </button>
            <button
              onClick={() => setSelectedExportColumns([])}
              className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors text-sm"
            >
              Clear All
            </button>
          </div>
        </div>
      )}

      {/* Trips Tab */}
      {activeTab === 'trips' && (
        <div className="glass-card p-6">
          <h2 className="text-white text-xl font-bold mb-4 flex items-center gap-2">
            <Activity className="text-blue-400" />
            Recent Trips
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left py-3 px-4 text-white/60 font-medium">Bus</th>
                  <th className="text-left py-3 px-4 text-white/60 font-medium">Route</th>
                  <th className="text-left py-3 px-4 text-white/60 font-medium">Conductor</th>
                  <th className="text-left py-3 px-4 text-white/60 font-medium">Status</th>
                  <th className="text-left py-3 px-4 text-white/60 font-medium">Started</th>
                </tr>
              </thead>
              <tbody>
                {recentActivity.map((trip) => (
                  <tr key={trip.id} className="border-b border-white/5 hover:bg-white/5">
                    <td className="py-4 px-4 text-white font-medium">{trip.buses?.plate_number || 'N/A'}</td>
                    <td className="py-4 px-4 text-white/80">{trip.buses?.route || 'Unknown'}</td>
                    <td className="py-4 px-4 text-white/80">{trip.conductor_staff?.full_name || 'Unknown'}</td>
                    <td className="py-4 px-4">
                      <span className={`px-3 py-1 rounded-full text-xs ${
                        trip.status === 'in_progress' ? 'bg-blue-500/20 text-blue-400' :
                        trip.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                        'bg-red-500/20 text-red-400'
                      }`}>
                        {trip.status}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-white/60 text-sm">
                      {new Date(trip.started_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Reports Tab */}
      {activeTab === 'reports' && (
        <div className="glass-card p-6">
          <h2 className="text-white text-xl font-bold mb-4 flex items-center gap-2">
            <FileText className="text-orange-400" />
            Generate Reports
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white/5 border border-white/10 rounded-xl p-6 hover:bg-white/10 transition-colors cursor-pointer">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-3 bg-blue-500/20 rounded-lg">
                  <Bus size={24} className="text-blue-400" />
                </div>
                <div>
                  <h3 className="text-white font-bold">Trips Report</h3>
                  <p className="text-white/60 text-sm">Trip records with bus and conductor info</p>
                </div>
              </div>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-xl p-6 hover:bg-white/10 transition-colors cursor-pointer">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-3 bg-green-500/20 rounded-lg">
                  <DollarSign size={24} className="text-green-400" />
                </div>
                <div>
                  <h3 className="text-white font-bold">Revenue Report</h3>
                  <p className="text-white/60 text-sm">Financial transactions and income</p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6">
            <label className="text-white/60 text-sm mb-2 block">Select Report Type</label>
            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value)}
              className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-orange-500"
            >
              <option value="trips">Trips</option>
              <option value="revenue">Revenue</option>
            </select>
          </div>

          <div className="mt-6 flex gap-4">
            <div className="flex-1">
              <label className="text-white/60 text-sm mb-2 block">Start Date</label>
              <input
                type="date"
                value={dateRange.start}
                onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-orange-500"
              />
            </div>
            <div className="flex-1">
              <label className="text-white/60 text-sm mb-2 block">End Date</label>
              <input
                type="date"
                value={dateRange.end}
                onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-orange-500"
              />
            </div>
          </div>
        </div>
      )}

      {/* Transactions Tab */}
      {activeTab === 'transactions' && (
        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-white text-xl font-bold flex items-center gap-2">
              <DollarSign className="text-green-400" />
              Transaction History
            </h2>
            <span className="text-white/60">{filteredTransactions.length} records</span>
          </div>

          <div className="mb-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/40" size={20} />
              <input
                type="text"
                placeholder="Search transactions..."
                value={transactionSearchTerm}
                onChange={(e) => setTransactionSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-orange-500"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left py-3 px-4 text-white/60 font-medium cursor-pointer hover:text-white transition-colors" onClick={() => handleSort('type')}>
                    <div className="flex items-center gap-2">
                      Type
                      {renderSortIcon('type')}
                    </div>
                  </th>
                  <th className="text-left py-3 px-4 text-white/60 font-medium cursor-pointer hover:text-white transition-colors" onClick={() => handleSort('amount')}>
                    <div className="flex items-center gap-2">
                      Amount
                      {renderSortIcon('amount')}
                    </div>
                  </th>
                  <th className="text-left py-3 px-4 text-white/60 font-medium cursor-pointer hover:text-white transition-colors" onClick={() => handleSort('channel')}>
                    <div className="flex items-center gap-2">
                      Channel
                      {renderSortIcon('channel')}
                    </div>
                  </th>
                  <th className="text-left py-3 px-4 text-white/60 font-medium">Staff</th>
                  <th className="text-left py-3 px-4 text-white/60 font-medium cursor-pointer hover:text-white transition-colors" onClick={() => handleSort('created_at')}>
                    <div className="flex items-center gap-2">
                      Time
                      {renderSortIcon('created_at')}
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginatedTransactions.map((tx) => (
                  <tr key={tx.id} className="border-b border-white/5 hover:bg-white/5">
                    <td className="py-4 px-4">
                      <span className={`px-3 py-1 rounded-full text-xs border ${transactionTypeColors[tx.type as keyof typeof transactionTypeColors] || 'bg-gray-500/20 text-gray-400'}`}>
                        {tx.type}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-white font-medium">₱{Number(tx.amount).toFixed(2)}</td>
                    <td className="py-4 px-4 text-white/80">{tx.channel}</td>
                    <td className="py-4 px-4 text-white/80">{tx.staff?.full_name || 'N/A'}</td>
                    <td className="py-4 px-4 text-white/60 text-sm">
                      {new Date(tx.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {transactionsTotalPages > 1 && (
            <div className="flex items-center justify-between pt-4 border-t border-white/10 mt-4">
              <span className="text-white/60 text-sm">
                Showing {((transactionsCurrentPage - 1) * itemsPerPage) + 1} to {Math.min(transactionsCurrentPage * itemsPerPage, filteredTransactions.length)} of {filteredTransactions.length} transactions
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setTransactionsCurrentPage(Math.max(1, transactionsCurrentPage - 1))}
                  disabled={transactionsCurrentPage === 1}
                  className="p-2 rounded-lg bg-white/10 text-white/60 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="text-white/60 text-sm">
                  Page {transactionsCurrentPage} of {transactionsTotalPages}
                </span>
                <button
                  onClick={() => setTransactionsCurrentPage(Math.min(transactionsTotalPages, transactionsCurrentPage + 1))}
                  disabled={transactionsCurrentPage === transactionsTotalPages}
                  className="p-2 rounded-lg bg-white/10 text-white/60 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
