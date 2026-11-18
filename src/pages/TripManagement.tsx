import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Search,
  Bus,
  MapPin,
  CheckCircle,
  Clock,
  ChevronLeft,
  ChevronRight,
  Video,
  Download,
  X,
  AlertTriangle,
  Receipt,
  Activity,
  Calendar,
  Users,
  TrendingUp,
  Filter,
  ArrowLeft
} from 'lucide-react';
import { supabase } from '../lib/supabase';

interface Trip {
  id: string;
  status: string;
  started_at: string;
  ended_at: string | null;
  current_lat: number | null;
  current_lng: number | null;
  total_passengers?: number | null;
  total_fares?: number | null;
  buses: {
    plate_number: string;
    bus_number: number | string;
    route: string;
  } | null;
  conductor: {
    full_name: string;
  } | null;
  driver?: {
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
  frame_count: number | null;
  storage_url: string | null;
  status: string;
  upload_progress: number;
  error_message: string | null;
  created_at: string;
}

type PeriodType = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom' | 'all';

export default function TripManagement() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [tripVideos, setTripVideos] = useState<Record<string, TripVideo>>({});
  const [loading, setLoading] = useState(true);

  // Active trips view state
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [currentPage, setCurrentPage] = useState(0);
  const itemsPerPage = 10;

  // History view toggle state (mirroring sys-admin)
  const [showHistory, setShowHistory] = useState(false);
  const [historyPeriod, setHistoryPeriod] = useState<PeriodType>('daily');
  const [customDateRange, setCustomDateRange] = useState({ startDate: '', endDate: '' });
  const [historySearchTerm, setHistorySearchTerm] = useState('');
  const [historyStatusFilter, setHistoryStatusFilter] = useState('all');
  const [historyCurrentPage, setHistoryCurrentPage] = useState(1);
  const historyItemsPerPage = 10;

  // Modal states
  const [selectedVideo, setSelectedVideo] = useState<TripVideo | null>(null);
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);
  const [tripDetails, setTripDetails] = useState<{
    transactions: any[];
    irregularities: any[];
    emergencyAlerts: any[];
    anomalies: any[];
  } | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  const fetchTrips = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('trips')
        .select('*, buses!fk_trips_bus_id(*), conductor:staff_users!fk_trips_conductor_id(*)')
        .order('started_at', { ascending: false });

      if (error) throw error;
      setTrips(data || []);

      // Fetch videos for all trips
      if (data && data.length > 0) {
        const tripIds = data.map(t => t.id);
        const { data: videos } = await supabase
          .from('trip_videos')
          .select('*')
          .in('trip_id', tripIds);

        if (videos) {
          const videoMap: Record<string, TripVideo> = {};
          videos.forEach(video => {
            if (!videoMap[video.trip_id] || new Date(video.created_at) > new Date(videoMap[video.trip_id].created_at)) {
              videoMap[video.trip_id] = video;
            }
          });
          setTripVideos(videoMap);
        }
      }
    } catch (error) {
      console.error('Error fetching trips:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTrips();

    const subscription = supabase
      .channel('trips-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trips' }, fetchTrips)
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [fetchTrips]);

  const fetchTripDetails = async (tripId: string) => {
    try {
      setDetailsLoading(true);
      setSelectedTrip(trips.find(t => t.id === tripId) || null);

      // Fetch transactions, irregularities, emergency alerts
      const [txRes, irrRes, alertsRes] = await Promise.all([
        supabase
          .from('transactions')
          .select('*')
          .eq('trip_id', tripId)
          .order('created_at', { ascending: false }),
        supabase
          .from('fare_irregularities')
          .select('*')
          .eq('trip_id', tripId)
          .order('detected_at', { ascending: false }),
        supabase
          .from('emergency_alerts')
          .select('*')
          .eq('trip_id', tripId)
          .order('created_at', { ascending: false }),
      ]);

      const allIrregularities = irrRes.data || [];
      const anomalies = allIrregularities.filter((i: any) => i.anomaly_type);
      const regularIrregularities = allIrregularities.filter((i: any) => !i.anomaly_type);

      setTripDetails({
        transactions: txRes.data || [],
        irregularities: regularIrregularities,
        emergencyAlerts: alertsRes.data || [],
        anomalies
      });
    } catch (error) {
      console.error('Error fetching trip details:', error);
    } finally {
      setDetailsLoading(false);
    }
  };

  // Active trips filtering
  const filteredActiveTrips = useMemo(() => {
    return trips.filter(trip => {
      const q = searchTerm.toLowerCase();
      const matchesSearch =
        trip.buses?.plate_number?.toLowerCase().includes(q) ||
        String(trip.buses?.bus_number || '').toLowerCase().includes(q) ||
        trip.buses?.route?.toLowerCase().includes(q) ||
        trip.conductor?.full_name?.toLowerCase().includes(q);

      const matchesStatus = filterStatus === 'all' || trip.status === filterStatus;
      return matchesSearch && matchesStatus;
    });
  }, [trips, searchTerm, filterStatus]);

  const totalPages = Math.max(1, Math.ceil(filteredActiveTrips.length / itemsPerPage));
  const paginatedActiveTrips = useMemo(() => {
    return filteredActiveTrips.slice(
      currentPage * itemsPerPage,
      (currentPage + 1) * itemsPerPage
    );
  }, [filteredActiveTrips, currentPage, itemsPerPage]);

  // Trip History: period filtering
  const periodFilteredHistoryTrips = useMemo(() => {
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

  // Trip History: statistics
  const historyStats = useMemo(() => {
    const totalTrips = periodFilteredHistoryTrips.length;
    const totalPassengers = periodFilteredHistoryTrips.reduce(
      (sum, t) => sum + (Number(t.total_passengers) || 0),
      0
    );
    const avgPassengers = totalTrips > 0 ? Math.round(totalPassengers / totalTrips) : 0;
    return { totalTrips, totalPassengers, avgPassengers };
  }, [periodFilteredHistoryTrips]);

  // Trip History: search and status filter
  const finalFilteredHistoryTrips = useMemo(() => {
    return periodFilteredHistoryTrips.filter(trip => {
      const q = historySearchTerm.toLowerCase().trim();
      const matchesSearch =
        !q ||
        trip.buses?.plate_number?.toLowerCase().includes(q) ||
        String(trip.buses?.bus_number || '').toLowerCase().includes(q) ||
        trip.buses?.route?.toLowerCase().includes(q) ||
        trip.conductor?.full_name?.toLowerCase().includes(q) ||
        trip.driver?.full_name?.toLowerCase().includes(q);

      const matchesStatus = historyStatusFilter === 'all' || trip.status === historyStatusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [periodFilteredHistoryTrips, historySearchTerm, historyStatusFilter]);

  const historyTotalPages = Math.max(1, Math.ceil(finalFilteredHistoryTrips.length / historyItemsPerPage));
  const paginatedHistoryTrips = useMemo(() => {
    const start = (historyCurrentPage - 1) * historyItemsPerPage;
    return finalFilteredHistoryTrips.slice(start, start + historyItemsPerPage);
  }, [finalFilteredHistoryTrips, historyCurrentPage, historyItemsPerPage]);

  // Export history to CSV
  const handleExportCSV = () => {
    const headers = [
      'Trip ID',
      'Bus Number',
      'Plate Number',
      'Route',
      'Conductor',
      'Passengers',
      'Status',
      'Started At',
      'Ended At',
      'Duration (min)'
    ];

    const rows = finalFilteredHistoryTrips.map(trip => {
      const dur = trip.ended_at
        ? Math.round((new Date(trip.ended_at).getTime() - new Date(trip.started_at).getTime()) / 60000)
        : '';
      return [
        `"${trip.id}"`,
        `"${trip.buses?.bus_number || ''}"`,
        `"${trip.buses?.plate_number || ''}"`,
        `"${trip.buses?.route || ''}"`,
        `"${trip.conductor?.full_name || ''}"`,
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
    in_progress: 'bg-blue-500/20 text-blue-400 border-blue-500/50',
    completed: 'bg-green-500/20 text-green-400 border-green-500/30',
    cancelled: 'bg-red-500/20 text-red-400 border-red-500/30',
  };

  const statusLabels: Record<string, string> = {
    in_progress: 'In Progress',
    completed: 'Completed',
    cancelled: 'Cancelled',
  };

  return (
    <div className="space-y-6">
      {/* Header with sys-admin style toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-white mb-1">
            {showHistory ? 'Trip History' : 'Trip Management'}
          </h1>
          <p className="text-white/60 text-sm">
            {showHistory
              ? 'Comprehensive historical logs and passenger records'
              : 'Monitor and manage active bus trips in real time'}
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          {showHistory && (
            <button
              onClick={handleExportCSV}
              className="bg-white/5 hover:bg-white/10 text-white/90 hover:text-white border border-white/15 px-3.5 py-2 rounded-xl flex items-center gap-2 text-sm font-medium transition-all shadow-sm"
              title="Export trip history to CSV"
            >
              <Download size={16} className="text-orange-400" />
              <span>Export CSV</span>
            </button>
          )}

          {/* Toggle View Button (mirrors sys-admin toggleHistoryView) */}
          <button
            onClick={() => {
              setShowHistory(!showHistory);
              setHistoryCurrentPage(1);
            }}
            className={`px-4 py-2.5 rounded-xl flex items-center gap-2 text-sm font-semibold transition-all shadow-md ${
              showHistory
                ? 'bg-orange-500 hover:bg-orange-600 text-white shadow-orange-500/25 ring-2 ring-orange-500/40'
                : 'bg-white/10 hover:bg-white/20 text-white border border-white/15'
            }`}
          >
            {showHistory ? <ArrowLeft size={16} /> : <Calendar size={16} className="text-orange-400" />}
            <span>{showHistory ? 'Back to Active Trips' : 'Trip History'}</span>
          </button>
        </div>
      </div>

      {/* ────────────────── VIEW 1: TRIP HISTORY VIEW ────────────────── */}
      {showHistory ? (
        <div className="space-y-6">
          {/* Period Selector Card */}
          <div className="glass-card p-4 sm:p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/10">
              <div className="flex items-center gap-2 text-white text-sm font-bold">
                <Clock className="text-orange-400" size={18} />
                <span>Filter Period:</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {(['daily', 'weekly', 'monthly', 'yearly', 'custom', 'all'] as PeriodType[]).map(p => (
                  <button
                    key={p}
                    onClick={() => {
                      setHistoryPeriod(p);
                      setHistoryCurrentPage(1);
                    }}
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
                    onClick={() => setHistoryCurrentPage(1)}
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
                  placeholder="Search by bus, route, conductor..."
                  value={historySearchTerm}
                  onChange={e => {
                    setHistorySearchTerm(e.target.value);
                    setHistoryCurrentPage(1);
                  }}
                  className="w-full pl-10 pr-10 py-2.5 bg-white/5 border border-white/15 rounded-xl text-white text-sm placeholder-white/40 focus:outline-none focus:border-orange-500 transition-colors"
                />
                {historySearchTerm && (
                  <button
                    onClick={() => setHistorySearchTerm('')}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-white/40 hover:text-white p-1"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Filter size={16} className="text-white/50" />
                <select
                  value={historyStatusFilter}
                  onChange={e => {
                    setHistoryStatusFilter(e.target.value);
                    setHistoryCurrentPage(1);
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

            {/* History Table */}
            {paginatedHistoryTrips.length > 0 ? (
              <>
                <div className="overflow-x-auto rounded-xl border border-white/10">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-white/5 border-b border-white/10 text-xs uppercase tracking-wider text-white/60">
                        <th className="text-left py-3.5 px-4 font-semibold">Bus</th>
                        <th className="text-left py-3.5 px-4 font-semibold">Route</th>
                        <th className="text-left py-3.5 px-4 font-semibold">Conductor</th>
                        <th className="text-left py-3.5 px-4 font-semibold">Passengers</th>
                        <th className="text-left py-3.5 px-4 font-semibold">Started</th>
                        <th className="text-left py-3.5 px-4 font-semibold">Duration</th>
                        <th className="text-left py-3.5 px-4 font-semibold">Status</th>
                        <th className="text-left py-3.5 px-4 font-semibold">Video</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {paginatedHistoryTrips.map(trip => {
                        const durationMin = trip.ended_at
                          ? Math.round((new Date(trip.ended_at).getTime() - new Date(trip.started_at).getTime()) / 60000)
                          : null;

                        const video = tripVideos[trip.id];
                        const hasVideo = !!(video?.storage_url || trip.video_recording_url);

                        return (
                          <tr
                            key={trip.id}
                            onClick={() => fetchTripDetails(trip.id)}
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
                                {statusLabels[trip.status] || trip.status}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 text-sm">
                              {hasVideo ? (
                                <button
                                  onClick={e => {
                                    e.stopPropagation();
                                    if (video) setSelectedVideo(video);
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

                {/* History Pagination */}
                {historyTotalPages > 1 && (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between pt-2 gap-3">
                    <div className="text-white/60 text-xs sm:text-sm">
                      Showing {(historyCurrentPage - 1) * historyItemsPerPage + 1} to{' '}
                      {Math.min(historyCurrentPage * historyItemsPerPage, finalFilteredHistoryTrips.length)} of {finalFilteredHistoryTrips.length} trips
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setHistoryCurrentPage(prev => Math.max(1, prev - 1))}
                        disabled={historyCurrentPage === 1}
                        className="p-1.5 sm:px-3 sm:py-1.5 bg-white/5 hover:bg-white/10 text-white disabled:opacity-40 disabled:cursor-not-allowed rounded-lg border border-white/10 transition-colors text-sm flex items-center gap-1"
                      >
                        <ChevronLeft size={16} />
                        <span className="hidden sm:inline">Prev</span>
                      </button>

                      <div className="flex items-center gap-1">
                        {Array.from({ length: Math.min(historyTotalPages, 5) }, (_, i) => {
                          let pageNum: number;
                          if (historyTotalPages <= 5) {
                            pageNum = i + 1;
                          } else if (historyCurrentPage <= 3) {
                            pageNum = i + 1;
                          } else if (historyCurrentPage >= historyTotalPages - 2) {
                            pageNum = historyTotalPages - 4 + i;
                          } else {
                            pageNum = historyCurrentPage - 2 + i;
                          }

                          return (
                            <button
                              key={pageNum}
                              onClick={() => setHistoryCurrentPage(pageNum)}
                              className={`min-w-[32px] h-8 rounded-lg text-xs font-semibold transition-all ${
                                historyCurrentPage === pageNum
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
                        onClick={() => setHistoryCurrentPage(prev => Math.min(historyTotalPages, prev + 1))}
                        disabled={historyCurrentPage === historyTotalPages}
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
        </div>
      ) : (
        /* ────────────────── VIEW 2: ACTIVE TRIPS VIEW ────────────────── */
        <div className="space-y-6">
          {/* Active Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="glass-card p-4 border border-blue-500/30">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-lg bg-blue-500/20 text-blue-400">
                  <Bus size={24} />
                </div>
                <div>
                  <p className="text-white/60 text-sm">Active Trips</p>
                  <p className="text-white text-2xl font-bold">
                    {trips.filter(t => t.status === 'in_progress').length}
                  </p>
                </div>
              </div>
            </div>

            <div className="glass-card p-4 border border-green-500/30">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-lg bg-green-500/20 text-green-400">
                  <CheckCircle size={24} />
                </div>
                <div>
                  <p className="text-white/60 text-sm">Completed Today</p>
                  <p className="text-white text-2xl font-bold">
                    {trips.filter(t => t.status === 'completed').length}
                  </p>
                </div>
              </div>
            </div>

            <div className="glass-card p-4 border border-orange-500/30">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-lg bg-orange-500/20 text-orange-400">
                  <Clock size={24} />
                </div>
                <div>
                  <p className="text-white/60 text-sm">Total Trips</p>
                  <p className="text-white text-2xl font-bold">{trips.length}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Active Trips Table Container */}
          <div className="glass-card p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-white">Active Trips</h2>
              <span className="text-white/60">{filteredActiveTrips.length} records</span>
            </div>

            {/* Search Bar and Filters */}
            <div className="mb-6 flex flex-col md:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/40" size={20} />
                <input
                  type="text"
                  placeholder="Search by bus, route, or conductor..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-orange-500"
                />
              </div>

              <select
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value)}
                className="px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:border-orange-500 cursor-pointer"
              >
                <option value="all">All Status</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>

            {loading ? (
              <div className="text-center py-8">
                <div className="text-white">Loading trips...</div>
              </div>
            ) : filteredActiveTrips.length === 0 ? (
              <div className="text-center py-8">
                <Bus className="text-white/20 mx-auto mb-2" size={48} />
                <p className="text-white/40">No trips found</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-white/10">
                        <th className="text-left py-3 px-4 text-white/60 font-medium">Bus</th>
                        <th className="text-left py-3 px-4 text-white/60 font-medium">Route</th>
                        <th className="text-left py-3 px-4 text-white/60 font-medium">Conductor</th>
                        <th className="text-left py-3 px-4 text-white/60 font-medium">Status</th>
                        <th className="text-left py-3 px-4 text-white/60 font-medium">Started</th>
                        <th className="text-left py-3 px-4 text-white/60 font-medium">Duration</th>
                        <th className="text-left py-3 px-4 text-white/60 font-medium">GPS</th>
                        <th className="text-left py-3 px-4 text-white/60 font-medium">Video</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {paginatedActiveTrips.map(trip => (
                        <tr
                          key={trip.id}
                          className="border-b border-white/5 hover:bg-white/5 transition-colors cursor-pointer"
                          onClick={() => fetchTripDetails(trip.id)}
                          title="Click to view trip details"
                        >
                          <td className="py-4 px-4">
                            <div className="flex items-center gap-2">
                              <Bus size={16} className="text-orange-400" />
                              <span className="text-white font-medium">
                                {trip.buses?.bus_number || trip.buses?.plate_number || 'N/A'}
                              </span>
                            </div>
                          </td>
                          <td className="py-4 px-4 text-white/80">{trip.buses?.route || 'Unknown'}</td>
                          <td className="py-4 px-4 text-white/80">{trip.conductor?.full_name || 'Unknown'}</td>
                          <td className="py-4 px-4">
                            <span className={`px-3 py-1 rounded-full text-xs border ${statusColors[trip.status]}`}>
                              {statusLabels[trip.status] || trip.status}
                            </span>
                          </td>
                          <td className="py-4 px-4 text-white/60 text-sm">
                            {new Date(trip.started_at).toLocaleString()}
                          </td>
                          <td className="py-4 px-4 text-white/60 text-sm">
                            {trip.ended_at
                              ? `${Math.round((new Date(trip.ended_at).getTime() - new Date(trip.started_at).getTime()) / 60000)} min`
                              : '-'}
                          </td>
                          <td className="py-4 px-4">
                            {trip.current_lat && trip.current_lng ? (
                              <div className="flex items-center gap-2 text-green-400 text-sm">
                                <MapPin size={14} />
                                <span>Active</span>
                              </div>
                            ) : (
                              <span className="text-white/40 text-sm">-</span>
                            )}
                          </td>
                          <td className="py-4 px-4">
                            {tripVideos[trip.id] ? (
                              <button
                                onClick={e => {
                                  e.stopPropagation();
                                  setSelectedVideo(tripVideos[trip.id]);
                                }}
                                className="flex items-center gap-2 px-3 py-1.5 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded-lg transition-colors text-sm font-medium"
                              >
                                <Video size={14} />
                                <span>View</span>
                              </button>
                            ) : (
                              <span className="text-white/40 text-sm">No video</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between pt-4 border-t border-white/10 mt-4">
                    <span className="text-white/60 text-sm">
                      Showing {currentPage * itemsPerPage + 1} to{' '}
                      {Math.min((currentPage + 1) * itemsPerPage, filteredActiveTrips.length)} of{' '}
                      {filteredActiveTrips.length} trips
                    </span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setCurrentPage(prev => Math.max(0, prev - 1))}
                        disabled={currentPage === 0}
                        className="px-4 py-2 bg-white/10 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors text-sm flex items-center gap-1"
                      >
                        <ChevronLeft size={16} />
                        Previous
                      </button>
                      <button
                        onClick={() => setCurrentPage(prev => Math.min(totalPages - 1, prev + 1))}
                        disabled={currentPage >= totalPages - 1}
                        className="px-4 py-2 bg-white/10 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors text-sm flex items-center gap-1"
                      >
                        Next
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Video Modal */}
      {selectedVideo && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-card rounded-xl max-w-2xl w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Video className="text-orange-400" size={20} />
                Trip Video Recording
              </h2>
              <button
                onClick={() => setSelectedVideo(null)}
                className="text-white/60 hover:text-white transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-white/60">Status</p>
                  <p className={`font-medium ${
                    selectedVideo.status === 'completed' ? 'text-green-400' :
                    selectedVideo.status === 'uploading' ? 'text-yellow-400' :
                    selectedVideo.status === 'recording' ? 'text-blue-400' :
                    'text-red-400'
                  }`}>
                    {selectedVideo.status.charAt(0).toUpperCase() + selectedVideo.status.slice(1)}
                  </p>
                </div>
                <div>
                  <p className="text-white/60">Duration</p>
                  <p className="text-white font-medium">
                    {selectedVideo.duration_seconds
                      ? `${Math.floor(selectedVideo.duration_seconds / 60)}m ${selectedVideo.duration_seconds % 60}s`
                      : '-'}
                  </p>
                </div>
                <div>
                  <p className="text-white/60">Size</p>
                  <p className="text-white font-medium">
                    {selectedVideo.file_size
                      ? `${(selectedVideo.file_size / (1024 * 1024)).toFixed(2)} MB`
                      : '-'}
                  </p>
                </div>
                <div>
                  <p className="text-white/60">Frames</p>
                  <p className="text-white font-medium">
                    {selectedVideo.frame_count?.toLocaleString() || '-'}
                  </p>
                </div>
              </div>

              {selectedVideo.status === 'uploading' && (
                <div className="bg-white/10 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-white/60 text-sm">Uploading to cloud...</span>
                    <span className="text-white font-medium">{selectedVideo.upload_progress}%</span>
                  </div>
                  <div className="w-full bg-white/10 rounded-full h-2">
                    <div
                      className="bg-orange-500 h-2 rounded-full transition-all"
                      style={{ width: `${selectedVideo.upload_progress}%` }}
                    />
                  </div>
                </div>
              )}

              {selectedVideo.status === 'completed' && selectedVideo.storage_url ? (
                <div className="relative bg-black rounded-lg overflow-hidden aspect-video">
                  <video
                    src={selectedVideo.storage_url}
                    controls
                    className="w-full h-full"
                    autoPlay
                  />
                </div>
              ) : selectedVideo.status === 'recording' ? (
                <div className="bg-blue-500/20 border border-blue-500/50 rounded-lg p-8 text-center">
                  <Video size={48} className="text-blue-400 mx-auto mb-4 animate-pulse" />
                  <p className="text-white text-lg font-medium">Recording in progress</p>
                  <p className="text-white/60 text-sm mt-2">Video will be available after trip ends</p>
                </div>
              ) : selectedVideo.status === 'uploading' ? (
                <div className="bg-yellow-500/20 border border-yellow-500/50 rounded-lg p-8 text-center">
                  <Video size={48} className="text-yellow-400 mx-auto mb-4" />
                  <p className="text-white text-lg font-medium">Uploading to cloud</p>
                  <p className="text-white/60 text-sm mt-2">Please wait while video uploads</p>
                </div>
              ) : (
                <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-8 text-center">
                  <Video size={48} className="text-red-400 mx-auto mb-4" />
                  <p className="text-white text-lg font-medium">Video unavailable</p>
                  <p className="text-white/60 text-sm mt-2">{selectedVideo.error_message || 'Failed to process video'}</p>
                </div>
              )}

              {selectedVideo.status === 'completed' && selectedVideo.storage_url && (
                <div className="flex gap-3">
                  <a
                    href={selectedVideo.storage_url}
                    download
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-colors text-sm font-medium"
                  >
                    <Download size={16} />
                    Download Video
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Trip Details Modal */}
      {selectedTrip && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-card rounded-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-white/10">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Bus className="text-orange-400" size={20} />
                Trip Details
              </h2>
              <button
                onClick={() => {
                  setSelectedTrip(null);
                  setTripDetails(null);
                }}
                className="text-white/60 hover:text-white transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto max-h-[calc(90vh-80px)] space-y-6">
              {detailsLoading ? (
                <div className="text-center py-8">
                  <div className="text-white">Loading trip details...</div>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Trip Info */}
                  <div className="glass-card p-4 border border-white/10">
                    <h3 className="text-lg font-bold text-white mb-3">Trip Information</h3>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-white/60">Bus</p>
                        <p className="text-white font-medium">{selectedTrip.buses?.bus_number || selectedTrip.buses?.plate_number || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-white/60">Route</p>
                        <p className="text-white font-medium">{selectedTrip.buses?.route || 'Unknown'}</p>
                      </div>
                      <div>
                        <p className="text-white/60">Conductor</p>
                        <p className="text-white font-medium">{selectedTrip.conductor?.full_name || 'Unknown'}</p>
                      </div>
                      <div>
                        <p className="text-white/60">Status</p>
                        <p className="text-white font-medium">{statusLabels[selectedTrip.status] || selectedTrip.status}</p>
                      </div>
                      <div>
                        <p className="text-white/60">Started</p>
                        <p className="text-white font-medium">{new Date(selectedTrip.started_at).toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-white/60">Ended</p>
                        <p className="text-white font-medium">{selectedTrip.ended_at ? new Date(selectedTrip.ended_at).toLocaleString() : 'In Progress'}</p>
                      </div>
                    </div>
                  </div>

                  {/* Transactions */}
                  <div className="glass-card p-4 border border-white/10">
                    <h3 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
                      <Receipt className="text-green-400" size={18} />
                      Transactions ({tripDetails?.transactions?.length ?? 0})
                    </h3>
                    {tripDetails?.transactions && tripDetails.transactions.length > 0 ? (
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {tripDetails.transactions.map((tx: any) => (
                          <div key={tx.id} className="bg-white/5 rounded-lg p-3 border border-white/10">
                            <div className="flex justify-between items-start mb-2">
                              <div>
                                <p className="text-white font-medium text-sm">{tx.transaction_type}</p>
                                <p className="text-white/60 text-xs">₱{tx.amount || 0}</p>
                              </div>
                              <span className="text-white/60 text-xs">{new Date(tx.created_at).toLocaleString()}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-white/40 text-sm">No transactions for this trip</p>
                    )}
                  </div>

                  {/* Irregularities */}
                  <div className="glass-card p-4 border border-white/10">
                    <h3 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
                      <AlertTriangle className="text-orange-400" size={18} />
                      Fare Irregularities ({tripDetails?.irregularities?.length ?? 0})
                    </h3>
                    {tripDetails?.irregularities && tripDetails.irregularities.length > 0 ? (
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {tripDetails.irregularities.map((irr: any) => (
                          <div key={irr.id} className="bg-orange-500/10 rounded-lg p-3 border border-orange-500/30">
                            <div className="flex justify-between items-start mb-2">
                              <div>
                                <p className="text-white font-medium text-sm">{irr.type}</p>
                                <p className="text-white/80 text-xs">{irr.description || 'No description'}</p>
                              </div>
                              <span className="text-white/60 text-xs">{new Date(irr.detected_at).toLocaleString()}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-white/40 text-sm">No irregularities for this trip</p>
                    )}
                  </div>

                  {/* Emergency Alerts */}
                  <div className="glass-card p-4 border border-white/10">
                    <h3 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
                      <Activity className="text-red-400" size={18} />
                      Emergency Alerts ({tripDetails?.emergencyAlerts?.length ?? 0})
                    </h3>
                    {tripDetails?.emergencyAlerts && tripDetails.emergencyAlerts.length > 0 ? (
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {tripDetails.emergencyAlerts.map((alert: any) => (
                          <div key={alert.id} className="bg-red-500/10 rounded-lg p-3 border border-red-500/30">
                            <div className="flex justify-between items-start mb-2">
                              <div>
                                <p className="text-white font-medium text-sm">{alert.alert_type || 'Emergency'}</p>
                                <p className="text-white/80 text-xs">{alert.message || 'No message'}</p>
                              </div>
                              <span className="text-white/60 text-xs">{new Date(alert.created_at).toLocaleString()}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-white/40 text-sm">No emergency alerts for this trip</p>
                    )}
                  </div>

                  {/* Anomalies */}
                  <div className="glass-card p-4 border border-white/10">
                    <h3 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
                      <Activity className="text-purple-400" size={18} />
                      Anomaly Detections ({tripDetails?.anomalies?.length ?? 0})
                    </h3>
                    {tripDetails?.anomalies && tripDetails.anomalies.length > 0 ? (
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {tripDetails.anomalies.map((anomaly: any) => (
                          <div key={anomaly.id} className="bg-purple-500/10 rounded-lg p-3 border border-purple-500/30">
                            <div className="flex justify-between items-start mb-2">
                              <div>
                                <p className="text-white font-medium text-sm">{anomaly.anomaly_type || 'Anomaly'}</p>
                                <p className="text-white/80 text-xs">{anomaly.description || 'No description'}</p>
                              </div>
                              <span className="text-white/60 text-xs">{new Date(anomaly.detected_at).toLocaleString()}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-white/40 text-sm">No anomaly detections for this trip</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
