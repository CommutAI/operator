import { useState, useEffect, useMemo } from 'react';
import {
  Calendar,
  Clock,
  Bus,
  Users,
  TrendingUp,
  Search,
  Filter,
  Download,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Video,
  X,
  Receipt,
  AlertTriangle,
  MapPin,
  CheckCircle,
  FileText
} from 'lucide-react';
import { supabase } from '../lib/supabase';

interface TripItem {
  id: string;
  status: string;
  started_at: string;
  ended_at: string | null;
  bus_id: string | null;
  conductor_id: string | null;
  driver_id: string | null;
  total_passengers?: number | null;
  total_fares?: number | null;
  current_lat?: number | null;
  current_lng?: number | null;
  buses?: {
    id?: string;
    plate_number: string;
    bus_number: number | string;
    route: string;
  } | null;
  conductor?: {
    id?: string;
    full_name: string;
  } | null;
  driver?: {
    id?: string;
    full_name: string;
  } | null;
  video_recording_url?: string | null;
  video_recording_status?: string | null;
  video_recording_duration?: number | null;
}

interface TripVideo {
  id: string;
  trip_id: string;
  storage_type: string;
  file_path: string | null;
  file_size: number | null;
  duration_seconds: number | null;
  start_time: string;
  end_time: string | null;
  storage_url: string | null;
  status: string;
  created_at: string;
}

type PeriodType = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom' | 'all';

export default function TripHistory() {
  const [trips, setTrips] = useState<TripItem[]>([]);
  const [tripVideos, setTripVideos] = useState<Record<string, TripVideo>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [historyPeriod, setHistoryPeriod] = useState<PeriodType>('daily');
  const [customDateRange, setCustomDateRange] = useState({
    startDate: '',
    endDate: ''
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Modal states
  const [selectedTrip, setSelectedTrip] = useState<TripItem | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<TripVideo | null>(null);
  const [tripDetails, setTripDetails] = useState<{
    transactions: any[];
    irregularities: any[];
    emergencyAlerts: any[];
  } | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  useEffect(() => {
    fetchTrips();
  }, []);

  const fetchTrips = async () => {
    try {
      setLoading(true);

      // Fetch trips with limit 1000 for history
      const { data: rawTrips, error: tripsError } = await supabase
        .from('trips')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(1000);

      if (tripsError) throw tripsError;
      const tripsList: any[] = rawTrips || [];

      // Fetch related buses and staff users
      const busIds = [...new Set(tripsList.map(t => t.bus_id).filter(Boolean))];
      const conductorIds = [...new Set(tripsList.map(t => t.conductor_id).filter(Boolean))];
      const driverIds = [...new Set(tripsList.map(t => t.driver_id).filter(Boolean))];
      const allStaffIds = [...new Set([...conductorIds, ...driverIds])];

      const [busesRes, staffRes, videosRes] = await Promise.all([
        busIds.length > 0
          ? supabase.from('buses').select('id, bus_number, plate_number, route').in('id', busIds)
          : Promise.resolve({ data: [] }),
        allStaffIds.length > 0
          ? supabase.from('staff_users').select('id, full_name').in('id', allStaffIds)
          : Promise.resolve({ data: [] }),
        tripsList.length > 0
          ? supabase
              .from('trip_videos')
              .select('*')
              .in('trip_id', tripsList.slice(0, 150).map(t => t.id))
          : Promise.resolve({ data: [] })
      ]);

      const busesMap = new Map((busesRes.data || []).map((b: any) => [b.id, b]));
      const staffMap = new Map((staffRes.data || []).map((s: any) => [s.id, s]));

      const enrichedTrips: TripItem[] = tripsList.map(trip => ({
        ...trip,
        buses: trip.bus_id ? busesMap.get(trip.bus_id) || null : null,
        conductor: trip.conductor_id ? staffMap.get(trip.conductor_id) || null : null,
        driver: trip.driver_id ? staffMap.get(trip.driver_id) || null : null,
      }));

      setTrips(enrichedTrips);

      if (videosRes.data) {
        const vMap: Record<string, TripVideo> = {};
        videosRes.data.forEach((v: any) => {
          if (!vMap[v.trip_id] || new Date(v.created_at) > new Date(vMap[v.trip_id].created_at)) {
            vMap[v.trip_id] = v;
          }
        });
        setTripVideos(vMap);
      }
    } catch (err) {
      console.error('Error fetching trip history:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchTrips();
  };

  const fetchTripDetails = async (trip: TripItem) => {
    try {
      setSelectedTrip(trip);
      setDetailsLoading(true);

      const [txRes, irrRes, alertsRes] = await Promise.all([
        supabase
          .from('transactions')
          .select('*')
          .eq('trip_id', trip.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('fare_irregularities')
          .select('*')
          .eq('trip_id', trip.id)
          .order('detected_at', { ascending: false }),
        supabase
          .from('emergency_alerts')
          .select('*')
          .eq('trip_id', trip.id)
          .order('created_at', { ascending: false }),
      ]);

      setTripDetails({
        transactions: txRes.data || [],
        irregularities: irrRes.data || [],
        emergencyAlerts: alertsRes.data || [],
      });
    } catch (error) {
      console.error('Error fetching trip details:', error);
    } finally {
      setDetailsLoading(false);
    }
  };

  // Period filtering
  const periodFilteredTrips = useMemo(() => {
    if (historyPeriod === 'all') return trips;

    let startDate: Date | null = null;
    let endDate: Date | null = null;
    const now = new Date();

    switch (historyPeriod) {
      case 'daily': {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        startDate = d;
        endDate = now;
        break;
      }
      case 'weekly': {
        const d = new Date();
        d.setDate(d.getDate() - 7);
        startDate = d;
        endDate = now;
        break;
      }
      case 'monthly': {
        const d = new Date();
        d.setMonth(d.getMonth() - 1);
        startDate = d;
        endDate = now;
        break;
      }
      case 'yearly': {
        const d = new Date();
        d.setFullYear(d.getFullYear() - 1);
        startDate = d;
        endDate = now;
        break;
      }
      case 'custom': {
        if (customDateRange.startDate && customDateRange.endDate) {
          startDate = new Date(customDateRange.startDate);
          startDate.setHours(0, 0, 0, 0);
          endDate = new Date(customDateRange.endDate);
          endDate.setHours(23, 59, 59, 999);
        }
        break;
      }
      default:
        break;
    }

    if (!startDate) return trips;

    return trips.filter(trip => {
      if (!trip.started_at) return false;
      const t = new Date(trip.started_at);
      return t >= startDate! && (!endDate || t <= endDate);
    });
  }, [trips, historyPeriod, customDateRange]);

  // Statistics for current period
  const historyStats = useMemo(() => {
    const totalTrips = periodFilteredTrips.length;
    const totalPassengers = periodFilteredTrips.reduce(
      (sum, t) => sum + (Number(t.total_passengers) || 0),
      0
    );
    const avgPassengers = totalTrips > 0 ? Math.round(totalPassengers / totalTrips) : 0;
    return { totalTrips, totalPassengers, avgPassengers };
  }, [periodFilteredTrips]);

  // Search & Status filtering
  const finalFilteredTrips = useMemo(() => {
    return periodFilteredTrips.filter(trip => {
      const q = searchTerm.toLowerCase().trim();
      const matchesSearch =
        !q ||
        trip.buses?.plate_number?.toLowerCase().includes(q) ||
        String(trip.buses?.bus_number || '').toLowerCase().includes(q) ||
        trip.buses?.route?.toLowerCase().includes(q) ||
        trip.conductor?.full_name?.toLowerCase().includes(q) ||
        trip.driver?.full_name?.toLowerCase().includes(q);

      const matchesStatus = statusFilter === 'all' || trip.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [periodFilteredTrips, searchTerm, statusFilter]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(finalFilteredTrips.length / itemsPerPage));
  const paginatedTrips = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return finalFilteredTrips.slice(start, start + itemsPerPage);
  }, [finalFilteredTrips, currentPage, itemsPerPage]);

  const handlePeriodChange = (p: PeriodType) => {
    setHistoryPeriod(p);
    setCurrentPage(1);
  };

  // Export CSV
  const handleExportCSV = () => {
    const headers = [
      'Trip ID',
      'Bus Number',
      'Plate Number',
      'Route',
      'Conductor',
      'Driver',
      'Passengers',
      'Status',
      'Started At',
      'Ended At',
      'Duration (min)'
    ];

    const rows = finalFilteredTrips.map(trip => {
      const dur = trip.ended_at
        ? Math.round((new Date(trip.ended_at).getTime() - new Date(trip.started_at).getTime()) / 60000)
        : '';
      return [
        `"${trip.id}"`,
        `"${trip.buses?.bus_number || ''}"`,
        `"${trip.buses?.plate_number || ''}"`,
        `"${trip.buses?.route || ''}"`,
        `"${trip.conductor?.full_name || ''}"`,
        `"${trip.driver?.full_name || ''}"`,
        trip.total_passengers || 0,
        `"${trip.status}"`,
        `"${new Date(trip.started_at).toLocaleString()}"`,
        trip.ended_at ? `"${new Date(trip.ended_at).toLocaleString()}"` : '""',
        dur
      ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `trip_history_${historyPeriod}_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const statusColors: Record<string, string> = {
    completed: 'bg-green-500/20 text-green-400 border-green-500/30',
    in_progress: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    cancelled: 'bg-red-500/20 text-red-400 border-red-500/30',
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-white text-3xl font-bold mb-2 flex items-center gap-3">
          <Calendar className="text-orange-400" />
          Trip History
        </h1>
        <div className="glass-card p-12 text-center">
          <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-white/60">Fetching trip history logs...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-white text-2xl lg:text-3xl font-bold mb-1 flex items-center gap-3">
            <Calendar className="text-orange-400" />
            Trip History
          </h1>
          <p className="text-white/60 text-sm">
            Comprehensive historical log of completed and recorded bus trips
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={handleExportCSV}
            className="bg-white/5 hover:bg-white/10 text-white/90 hover:text-white border border-white/15 px-3.5 py-2 rounded-xl flex items-center gap-2 text-sm font-medium transition-all shadow-sm"
            title="Export trip history to CSV"
          >
            <Download size={16} className="text-orange-400" />
            <span>Export CSV</span>
          </button>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 hover:text-white border border-white/10 transition-colors"
            title="Refresh trips"
          >
            <RefreshCw size={17} className={refreshing ? 'animate-spin text-orange-400' : ''} />
          </button>
        </div>
      </div>

      {/* Main Container */}
      <div className="glass-card p-4 sm:p-6 space-y-6">
        {/* Period Selector Tabs */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/10">
          <div className="flex items-center gap-2 text-white text-sm font-bold">
            <Clock className="text-orange-400" size={18} />
            <span>Filter Period:</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {(['daily', 'weekly', 'monthly', 'yearly', 'custom', 'all'] as PeriodType[]).map(p => (
              <button
                key={p}
                onClick={() => handlePeriodChange(p)}
                className={`px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold capitalize transition-all ${
                  historyPeriod === p
                    ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/25 ring-2 ring-orange-500/40'
                    : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white border border-white/10'
                }`}
              >
                {p === 'daily' ? 'Today' : p === 'all' ? 'All Time' : p}
              </button>
            ))}
          </div>
        </div>

        {/* Custom Date Range Picker */}
        {historyPeriod === 'custom' && (
          <div className="p-4 rounded-xl bg-white/5 border border-white/10 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-white/60 text-xs mb-1.5 block">Start Date</label>
              <input
                type="date"
                value={customDateRange.startDate}
                onChange={e => setCustomDateRange({ ...customDateRange, startDate: e.target.value })}
                className="w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-orange-500 text-sm"
              />
            </div>
            <div>
              <label className="text-white/60 text-xs mb-1.5 block">End Date</label>
              <input
                type="date"
                value={customDateRange.endDate}
                onChange={e => setCustomDateRange({ ...customDateRange, endDate: e.target.value })}
                className="w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-orange-500 text-sm"
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={() => setCurrentPage(1)}
                className="w-full px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl transition-colors text-sm font-medium shadow-md shadow-orange-500/20"
              >
                Apply Range
              </button>
            </div>
          </div>
        )}

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-white/5 border border-white/10 p-4 rounded-xl flex items-center justify-between">
            <div>
              <span className="text-white/60 text-xs block mb-1">Total Trips</span>
              <p className="text-white text-2xl font-bold">{historyStats.totalTrips}</p>
            </div>
            <div className="p-2.5 rounded-xl bg-orange-500/15 text-orange-400">
              <Bus size={20} />
            </div>
          </div>

          <div className="bg-white/5 border border-white/10 p-4 rounded-xl flex items-center justify-between">
            <div>
              <span className="text-white/60 text-xs block mb-1">Total Passengers</span>
              <p className="text-white text-2xl font-bold">{historyStats.totalPassengers}</p>
            </div>
            <div className="p-2.5 rounded-xl bg-green-500/15 text-green-400">
              <Users size={20} />
            </div>
          </div>

          <div className="bg-white/5 border border-white/10 p-4 rounded-xl flex items-center justify-between">
            <div>
              <span className="text-white/60 text-xs block mb-1">Avg Passengers / Trip</span>
              <p className="text-white text-2xl font-bold">{historyStats.avgPassengers}</p>
            </div>
            <div className="p-2.5 rounded-xl bg-blue-500/15 text-blue-400">
              <TrendingUp size={20} />
            </div>
          </div>

          <div className="bg-white/5 border border-white/10 p-4 rounded-xl flex items-center justify-between">
            <div>
              <span className="text-white/60 text-xs block mb-1">Active Period</span>
              <p className="text-white text-lg font-bold capitalize">
                {historyPeriod === 'daily' ? 'Today' : historyPeriod}
              </p>
            </div>
            <div className="p-2.5 rounded-xl bg-purple-500/15 text-purple-400">
              <Clock size={20} />
            </div>
          </div>
        </div>

        {/* Search Bar & Status Filter */}
        <div className="flex flex-col md:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/40" size={18} />
            <input
              type="text"
              placeholder="Search by bus, route, conductor, or driver..."
              value={searchTerm}
              onChange={e => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-10 pr-10 py-2.5 bg-white/5 border border-white/15 rounded-xl text-white text-sm placeholder-white/40 focus:outline-none focus:border-orange-500 transition-colors"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-white/40 hover:text-white p-1"
              >
                <X size={16} />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Filter size={16} className="text-white/50" />
            <select
              value={statusFilter}
              onChange={e => {
                setStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="px-3 py-2.5 bg-gray-800 border border-white/20 rounded-xl text-white text-sm focus:outline-none focus:border-orange-500 cursor-pointer"
            >
              <option value="all">All Status</option>
              <option value="completed">Completed</option>
              <option value="in_progress">In Progress</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>

        {/* Trip History Table (List View) */}
        {paginatedTrips.length > 0 ? (
          <>
            <div className="overflow-x-auto rounded-xl border border-white/10">
              <table className="w-full">
                <thead>
                  <tr className="bg-white/5 border-b border-white/10 text-xs uppercase tracking-wider text-white/60">
                    <th className="text-left py-3.5 px-4 font-semibold">Bus</th>
                    <th className="text-left py-3.5 px-4 font-semibold">Route</th>
                    <th className="text-left py-3.5 px-4 font-semibold">Conductor</th>
                    <th className="text-left py-3.5 px-4 font-semibold">Driver</th>
                    <th className="text-left py-3.5 px-4 font-semibold">Passengers</th>
                    <th className="text-left py-3.5 px-4 font-semibold">Started</th>
                    <th className="text-left py-3.5 px-4 font-semibold">Duration</th>
                    <th className="text-left py-3.5 px-4 font-semibold">Status</th>
                    <th className="text-left py-3.5 px-4 font-semibold">Video</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {paginatedTrips.map(trip => {
                    const durationMin = trip.ended_at
                      ? Math.round((new Date(trip.ended_at).getTime() - new Date(trip.started_at).getTime()) / 60000)
                      : null;

                    const video = tripVideos[trip.id];
                    const hasVideo = !!(video?.storage_url || trip.video_recording_url);

                    return (
                      <tr
                        key={trip.id}
                        onClick={() => fetchTripDetails(trip)}
                        className="hover:bg-white/5 transition-colors cursor-pointer"
                        title="Click to view full trip details"
                      >
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2">
                            <Bus size={15} className="text-orange-400 shrink-0" />
                            <span className="text-white font-medium text-sm">
                              {trip.buses?.bus_number || trip.buses?.plate_number || 'N/A'}
                            </span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-white/80 text-sm max-w-[200px] truncate">
                          {trip.buses?.route || 'Unknown'}
                        </td>
                        <td className="py-3.5 px-4 text-white/80 text-sm">
                          {trip.conductor?.full_name || '—'}
                        </td>
                        <td className="py-3.5 px-4 text-white/80 text-sm">
                          {trip.driver?.full_name || '—'}
                        </td>
                        <td className="py-3.5 px-4 text-white/80 text-sm font-semibold">
                          {trip.total_passengers ?? 0}
                        </td>
                        <td className="py-3.5 px-4 text-white/60 text-xs whitespace-nowrap">
                          {new Date(trip.started_at).toLocaleString([], {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </td>
                        <td className="py-3.5 px-4 text-white/60 text-sm">
                          {durationMin !== null ? `${durationMin} min` : 'In Progress'}
                        </td>
                        <td className="py-3.5 px-4 text-sm">
                          <span
                            className={`px-2.5 py-1 rounded-full text-xs border capitalize font-medium ${
                              statusColors[trip.status] || 'bg-white/10 text-white/60 border-white/20'
                            }`}
                          >
                            {trip.status.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-sm">
                          {hasVideo ? (
                            <button
                              onClick={e => {
                                e.stopPropagation();
                                if (video) setSelectedVideo(video);
                                else if (trip.video_recording_url) {
                                  setSelectedVideo({
                                    id: `vid-${trip.id}`,
                                    trip_id: trip.id,
                                    storage_type: 'cloud',
                                    file_path: null,
                                    file_size: null,
                                    duration_seconds: trip.video_recording_duration || null,
                                    start_time: trip.started_at,
                                    end_time: trip.ended_at,
                                    storage_url: trip.video_recording_url,
                                    status: trip.video_recording_status || 'completed',
                                    created_at: trip.started_at
                                  });
                                }
                              }}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25 transition-all text-xs font-medium"
                            >
                              <Video size={13} />
                              <span>View</span>
                            </button>
                          ) : (
                            <span className="text-white/30 text-xs">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pt-2 gap-3">
                <div className="text-white/60 text-xs sm:text-sm">
                  Showing {(currentPage - 1) * itemsPerPage + 1} to{' '}
                  {Math.min(currentPage * itemsPerPage, finalFilteredTrips.length)} of {finalFilteredTrips.length} trips
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                    className="p-1.5 sm:px-3 sm:py-1.5 bg-white/5 hover:bg-white/10 text-white disabled:opacity-40 disabled:cursor-not-allowed rounded-lg border border-white/10 transition-colors text-sm flex items-center gap-1"
                  >
                    <ChevronLeft size={16} />
                    <span className="hidden sm:inline">Prev</span>
                  </button>

                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                      let pageNum: number;
                      if (totalPages <= 5) pageNum = i + 1;
                      else if (currentPage <= 3) pageNum = i + 1;
                      else if (currentPage >= totalPages - 2) pageNum = totalPages - 4 + i;
                      else pageNum = currentPage - 2 + i;

                      return (
                        <button
                          key={pageNum}
                          onClick={() => setCurrentPage(pageNum)}
                          className={`min-w-[32px] h-8 rounded-lg text-xs font-semibold transition-all ${
                            currentPage === pageNum
                              ? 'bg-orange-500 text-white shadow-md shadow-orange-500/30'
                              : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white border border-white/10'
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                  </div>

                  <button
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                    className="p-1.5 sm:px-3 sm:py-1.5 bg-white/5 hover:bg-white/10 text-white disabled:opacity-40 disabled:cursor-not-allowed rounded-lg border border-white/10 transition-colors text-sm flex items-center gap-1"
                  >
                    <span className="hidden sm:inline">Next</span>
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-12 border border-white/10 rounded-xl bg-white/[0.02]">
            <Bus className="text-white/20 mx-auto mb-3" size={40} />
            <p className="text-white font-medium text-base">No trips found for this period</p>
            <p className="text-white/40 text-xs mt-1">Try switching to a wider period or clearing filters.</p>
          </div>
        )}
      </div>

      {/* Video Modal */}
      {selectedVideo && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-card rounded-2xl w-full max-w-3xl overflow-hidden border border-white/15">
            <div className="flex items-center justify-between p-4 sm:p-5 border-b border-white/10">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Video className="text-orange-400" size={18} />
                Trip Video Playback
              </h2>
              <button
                onClick={() => setSelectedVideo(null)}
                className="text-white/60 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-4 sm:p-6 space-y-4">
              {selectedVideo.storage_url ? (
                <div className="relative bg-black rounded-xl overflow-hidden aspect-video border border-white/10 shadow-2xl">
                  <video src={selectedVideo.storage_url} controls className="w-full h-full" autoPlay />
                </div>
              ) : (
                <div className="p-8 text-center bg-white/5 rounded-xl border border-white/10">
                  <Video size={40} className="text-white/30 mx-auto mb-2" />
                  <p className="text-white/70">Video file not accessible directly</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Trip Details Modal */}
      {selectedTrip && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-card rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden border border-white/15 flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-white/10">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Bus className="text-orange-400" size={18} />
                Trip Information & Log
              </h2>
              <button
                onClick={() => {
                  setSelectedTrip(null);
                  setTripDetails(null);
                }}
                className="text-white/60 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-5">
              {detailsLoading ? (
                <div className="text-center py-8">
                  <div className="w-8 h-8 border-3 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                  <p className="text-white/60 text-sm">Loading trip audit records...</p>
                </div>
              ) : (
                <>
                  {/* Trip Meta Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-4 rounded-xl bg-white/5 border border-white/10 text-xs">
                    <div>
                      <span className="text-white/50 block mb-0.5">Bus</span>
                      <span className="text-white font-semibold text-sm">
                        {selectedTrip.buses?.bus_number || selectedTrip.buses?.plate_number || 'N/A'}
                      </span>
                    </div>
                    <div>
                      <span className="text-white/50 block mb-0.5">Route</span>
                      <span className="text-white font-medium text-sm">{selectedTrip.buses?.route || 'Unknown'}</span>
                    </div>
                    <div>
                      <span className="text-white/50 block mb-0.5">Status</span>
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold capitalize border ${
                          statusColors[selectedTrip.status] || 'bg-white/10 text-white/60 border-white/20'
                        }`}
                      >
                        {selectedTrip.status.replace('_', ' ')}
                      </span>
                    </div>
                    <div>
                      <span className="text-white/50 block mb-0.5">Conductor</span>
                      <span className="text-white font-medium">{selectedTrip.conductor?.full_name || '—'}</span>
                    </div>
                    <div>
                      <span className="text-white/50 block mb-0.5">Driver</span>
                      <span className="text-white font-medium">{selectedTrip.driver?.full_name || '—'}</span>
                    </div>
                    <div>
                      <span className="text-white/50 block mb-0.5">Passengers</span>
                      <span className="text-white font-semibold text-sm">{selectedTrip.total_passengers || 0}</span>
                    </div>
                    <div className="col-span-2 sm:col-span-3 pt-2 border-t border-white/5 flex justify-between text-white/60 text-[11px]">
                      <span>Started: {new Date(selectedTrip.started_at).toLocaleString()}</span>
                      <span>Ended: {selectedTrip.ended_at ? new Date(selectedTrip.ended_at).toLocaleString() : 'In Progress'}</span>
                    </div>
                  </div>

                  {/* Transactions Section */}
                  <div className="space-y-2">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <Receipt className="text-green-400" size={15} />
                      Transactions ({tripDetails?.transactions.length || 0})
                    </h3>
                    {tripDetails && tripDetails.transactions.length > 0 ? (
                      <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                        {tripDetails.transactions.map((tx: any) => (
                          <div
                            key={tx.id}
                            className="p-2.5 rounded-lg bg-white/5 border border-white/10 flex justify-between items-center text-xs"
                          >
                            <div>
                              <span className="text-white font-medium capitalize">{tx.transaction_type || 'Fare'}</span>
                              <span className="text-white/40 text-[10px] block">
                                {new Date(tx.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            <span className="text-green-400 font-bold">₱{Number(tx.amount || 0).toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-white/40 text-xs italic py-2">No transactions recorded for this trip</p>
                    )}
                  </div>

                  {/* Irregularities Section */}
                  <div className="space-y-2">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <AlertTriangle className="text-orange-400" size={15} />
                      Irregularities & Anomalies ({tripDetails?.irregularities.length || 0})
                    </h3>
                    {tripDetails && tripDetails.irregularities.length > 0 ? (
                      <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                        {tripDetails.irregularities.map((irr: any) => (
                          <div
                            key={irr.id}
                            className="p-2.5 rounded-lg bg-orange-500/10 border border-orange-500/30 flex justify-between items-center text-xs"
                          >
                            <div>
                              <span className="text-white font-medium">{irr.type || 'Irregularity'}</span>
                              <span className="text-white/60 text-[11px] block">{irr.description || 'No description'}</span>
                            </div>
                            <span className="text-orange-300 font-semibold text-[11px]">
                              {irr.severity || 'Medium'}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-white/40 text-xs italic py-2">No irregularities flagged for this trip</p>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
