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
  Play,
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
  video_recording_url?: string | null;
  video_recording_status?: string | null;
  video_recording_duration?: number | null;
  video_recording_file_size?: number | null;
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
}

interface VideoRecording {
  id: string;
  trip_id: string;
  file_name: string;
  file_path: string | null;
  file_size: number | null;
  duration: number | null;
  format: string | null;
  recorded_at: string;
  storage_type: string;
  status: string;
  metadata?: any;
}

type PeriodType = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom' | 'all';
type PageSizeOption = '10' | '25' | '50' | '100' | 'all';

const resolveVideoUrl = (fileNameOrUrl: string | null | undefined): string => {
  if (!fileNameOrUrl) return '';
  if (fileNameOrUrl.startsWith('http://') || fileNameOrUrl.startsWith('https://')) {
    return fileNameOrUrl;
  }
  const backendUrl = (import.meta.env.VITE_BACKEND_URL || 'https://sys-admin-62ro.onrender.com').replace(/\/$/, '');
  const cleanName = fileNameOrUrl.split('/').pop() || fileNameOrUrl;
  return `${backendUrl}/api/video-processing/download-video/${cleanName}`;
};

export default function TripManagement() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [recordingsByTrip, setRecordingsByTrip] = useState<Record<string, VideoRecording[]>>({});
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
  const [historyPageSize, setHistoryPageSize] = useState<PageSizeOption>('10');

  // Modal states
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);
  const [tripVideoUrl, setTripVideoUrl] = useState<string | null>(null);
  const [tripVideoStatus, setTripVideoStatus] = useState<'available' | 'processing' | 'not_available' | 'error' | null>(null);
  const [tripVideoRecordings, setTripVideoRecordings] = useState<VideoRecording[]>([]);
  const [modalVideoPage, setModalVideoPage] = useState(1);

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
      const tripsList = data || [];
      setTrips(tripsList);

      // Fetch video recordings in parallel for trips
      if (tripsList.length > 0) {
        const tripIds = tripsList.slice(0, 150).map(t => t.id);
        const { data: recordings } = await supabase
          .from('video_recordings')
          .select('*')
          .in('trip_id', tripIds)
          .order('recorded_at', { ascending: false });

        if (recordings) {
          const rMap: Record<string, VideoRecording[]> = {};
          recordings.forEach((r: any) => {
            if (!rMap[r.trip_id]) rMap[r.trip_id] = [];
            rMap[r.trip_id].push(r);
          });
          setRecordingsByTrip(rMap);
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
      const foundTrip = trips.find(t => t.id === tripId) || null;
      setSelectedTrip(foundTrip);
      setTripVideoUrl(null);
      setTripVideoStatus(null);
      setTripVideoRecordings([]);
      setModalVideoPage(1);

      // Fetch transactions, irregularities, emergency alerts, and video recordings
      const [txRes, irrRes, alertsRes, recordingsRes] = await Promise.all([
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
        supabase
          .from('video_recordings')
          .select('*')
          .eq('trip_id', tripId)
          .order('recorded_at', { ascending: false })
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

      const recs: VideoRecording[] = recordingsRes.data || [];
      setTripVideoRecordings(recs);

      // Resolve Video Stream URL with priority
      const completedRec = recs.find(r => r.status === 'completed' && r.file_name);
      if (foundTrip?.video_recording_url && (foundTrip.video_recording_status === 'available' || !foundTrip.video_recording_status)) {
        setTripVideoUrl(resolveVideoUrl(foundTrip.video_recording_url));
        setTripVideoStatus('available');
      } else if (completedRec) {
        setTripVideoUrl(resolveVideoUrl(completedRec.file_name));
        setTripVideoStatus('available');
      } else if (recs.length > 0) {
        setTripVideoStatus('processing');
      } else if (foundTrip?.video_recording_status === 'not_recorded') {
        setTripVideoStatus('not_available');
      } else if (foundTrip?.video_recording_status === 'error') {
        setTripVideoStatus('error');
      } else {
        setTripVideoStatus('not_available');
      }
    } catch (error) {
      console.error('Error fetching trip details:', error);
      setTripVideoStatus('error');
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

  // Trip History: summary metrics
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

  // Trip History: dynamic pagination
  const historyTotalPages = useMemo(() => {
    if (historyPageSize === 'all') return 1;
    const size = parseInt(historyPageSize, 10);
    return Math.max(1, Math.ceil(finalFilteredHistoryTrips.length / size));
  }, [finalFilteredHistoryTrips.length, historyPageSize]);

  const paginatedHistoryTrips = useMemo(() => {
    if (historyPageSize === 'all') return finalFilteredHistoryTrips;
    const size = parseInt(historyPageSize, 10);
    const start = (historyCurrentPage - 1) * size;
    return finalFilteredHistoryTrips.slice(start, start + size);
  }, [finalFilteredHistoryTrips, historyCurrentPage, historyPageSize]);

  const handleHistoryPageSizeChange = (val: PageSizeOption) => {
    setHistoryPageSize(val);
    setHistoryCurrentPage(1);
  };

  // Export CSV for history
  const handleExportHistoryCSV = () => {
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
      'Duration (min)',
      'Video Recording'
    ];

    const rows = finalFilteredHistoryTrips.map(trip => {
      const dur = trip.ended_at
        ? Math.round((new Date(trip.ended_at).getTime() - new Date(trip.started_at).getTime()) / 60000)
        : '';
      const hasVid = trip.video_recording_url || (recordingsByTrip[trip.id]?.length > 0) ? 'Available' : 'None';
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
        dur,
        `"${hasVid}"`
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

  const statusLabels: Record<string, string> = {
    in_progress: 'In Progress',
    completed: 'Completed',
    cancelled: 'Cancelled'
  };

  const statusColors: Record<string, string> = {
    in_progress: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    completed: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    cancelled: 'bg-red-500/20 text-red-400 border-red-500/30',
  };

  const historyRangeStart = historyPageSize === 'all' ? 1 : (historyCurrentPage - 1) * parseInt(historyPageSize, 10) + 1;
  const historyRangeEnd = historyPageSize === 'all'
    ? finalFilteredHistoryTrips.length
    : Math.min(historyCurrentPage * parseInt(historyPageSize, 10), finalFilteredHistoryTrips.length);

  return (
    <div className="space-y-6">
      {/* Header and Toggle Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Bus className="text-orange-400" size={26} />
            {showHistory ? 'Trip History Log' : 'Trip Management'}
          </h1>
          <p className="text-white/60 text-sm mt-0.5">
            {showHistory
              ? 'Historical run records, passenger load metrics, and on-board video feeds'
              : 'Real-time monitoring of fleet operations, active trips, and driver telemetry'}
          </p>
        </div>

        {/* View Toggle Button */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setShowHistory(!showHistory);
              setHistoryCurrentPage(1);
            }}
            className="flex items-center gap-2 px-4 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-sm font-semibold transition-all shadow-lg shadow-orange-500/20 cursor-pointer"
          >
            {showHistory ? (
              <>
                <ArrowLeft size={16} />
                <span>Back to Active Trips</span>
              </>
            ) : (
              <>
                <Clock size={16} />
                <span>Trip History</span>
              </>
            )}
          </button>
        </div>
      </div>

      {showHistory ? (
        /* ────────────────── VIEW 1: TRIP HISTORY VIEW ────────────────── */
        <div className="space-y-6">
          <div className="glass-card p-5 sm:p-6 border border-white/10 rounded-2xl space-y-6">
            {/* Period Tabs & CSV Export */}
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-white/10">
              <div className="flex flex-wrap items-center gap-1.5 bg-white/5 p-1 rounded-xl border border-white/10">
                {(['daily', 'weekly', 'monthly', 'yearly', 'custom', 'all'] as PeriodType[]).map(p => (
                  <button
                    key={p}
                    onClick={() => {
                      setHistoryPeriod(p);
                      setHistoryCurrentPage(1);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all ${
                      historyPeriod === p
                        ? 'bg-orange-500 text-white shadow-md shadow-orange-500/30'
                        : 'text-white/60 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    {p === 'daily' ? 'Today' : p === 'all' ? 'All Time' : p}
                  </button>
                ))}
              </div>

              <button
                onClick={handleExportHistoryCSV}
                disabled={finalFilteredHistoryTrips.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-medium transition-colors disabled:opacity-50"
              >
                <Download size={14} />
                <span>Export CSV</span>
              </button>
            </div>

            {/* Custom Range Picker */}
            {historyPeriod === 'custom' && (
              <div className="flex items-center gap-2 bg-white/5 p-2 rounded-xl border border-white/10 text-xs w-fit">
                <Calendar size={14} className="text-orange-400" />
                <input
                  type="date"
                  value={customDateRange.startDate}
                  onChange={e => {
                    setCustomDateRange(prev => ({ ...prev, startDate: e.target.value }));
                    setHistoryCurrentPage(1);
                  }}
                  className="bg-transparent text-white focus:outline-none cursor-pointer"
                />
                <span className="text-white/40">to</span>
                <input
                  type="date"
                  value={customDateRange.endDate}
                  onChange={e => {
                    setCustomDateRange(prev => ({ ...prev, endDate: e.target.value }));
                    setHistoryCurrentPage(1);
                  }}
                  className="bg-transparent text-white focus:outline-none cursor-pointer"
                />
              </div>
            )}

            {/* Metric Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="glass-card p-4 rounded-xl border border-white/10 flex items-center justify-between">
                <div>
                  <p className="text-white/60 text-xs uppercase tracking-wider font-semibold">Total Trips</p>
                  <p className="text-2xl font-bold text-white mt-1">{historyStats.totalTrips}</p>
                </div>
                <div className="p-2.5 rounded-xl bg-orange-500/15 text-orange-400">
                  <Bus size={20} />
                </div>
              </div>

              <div className="glass-card p-4 rounded-xl border border-white/10 flex items-center justify-between">
                <div>
                  <p className="text-white/60 text-xs uppercase tracking-wider font-semibold">Total Passengers</p>
                  <p className="text-2xl font-bold text-white mt-1">{historyStats.totalPassengers}</p>
                </div>
                <div className="p-2.5 rounded-xl bg-blue-500/15 text-blue-400">
                  <Users size={20} />
                </div>
              </div>

              <div className="glass-card p-4 rounded-xl border border-white/10 flex items-center justify-between">
                <div>
                  <p className="text-white/60 text-xs uppercase tracking-wider font-semibold">Avg Passengers / Trip</p>
                  <p className="text-2xl font-bold text-white mt-1">{historyStats.avgPassengers}</p>
                </div>
                <div className="p-2.5 rounded-xl bg-purple-500/15 text-purple-400">
                  <TrendingUp size={20} />
                </div>
              </div>
            </div>

            {/* Search and Status Filters */}
            <div className="flex flex-col md:flex-row gap-3">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/40" size={18} />
                <input
                  type="text"
                  placeholder="Search by bus, route, conductor, or driver..."
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
            {loading ? (
              <div className="text-center py-12 border border-white/10 rounded-xl bg-white/[0.02]">
                <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-white/60 text-sm">Loading trip records...</p>
              </div>
            ) : finalFilteredHistoryTrips.length > 0 ? (
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

                        const recs = recordingsByTrip[trip.id] || [];
                        const hasVideo = !!(
                          trip.video_recording_url ||
                          trip.video_recording_status === 'available' ||
                          recs.length > 0
                        );

                        return (
                          <tr
                            key={trip.id}
                            onClick={() => fetchTripDetails(trip.id)}
                            className="hover:bg-white/5 transition-colors cursor-pointer"
                            title="Click to view full trip details and video playback"
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
                                    fetchTripDetails(trip.id);
                                  }}
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25 transition-all text-xs font-medium"
                                  title="Watch trip video recording"
                                >
                                  <Play size={12} fill="currentColor" />
                                  <span>Watch</span>
                                </button>
                              ) : (
                                <span className="text-white/30 text-xs">No video</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Always-Visible History Pagination Toolbar */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pt-3 gap-3 border-t border-white/10">
                  <div className="flex items-center gap-3 text-white/60 text-xs sm:text-sm">
                    <span>
                      Showing {finalFilteredHistoryTrips.length === 0 ? 0 : historyRangeStart} to {historyRangeEnd} of {finalFilteredHistoryTrips.length} trips
                    </span>

                    <div className="flex items-center gap-1.5 ml-2">
                      <span className="text-xs text-white/40">Per page:</span>
                      <select
                        value={historyPageSize}
                        onChange={e => handleHistoryPageSizeChange(e.target.value as PageSizeOption)}
                        className="px-2 py-1 bg-white/5 border border-white/15 rounded-lg text-white text-xs focus:outline-none focus:border-orange-500 cursor-pointer"
                      >
                        <option value="10" className="bg-gray-800">10</option>
                        <option value="25" className="bg-gray-800">25</option>
                        <option value="50" className="bg-gray-800">50</option>
                        <option value="100" className="bg-gray-800">100</option>
                        <option value="all" className="bg-gray-800">All</option>
                      </select>
                    </div>
                  </div>

                  {historyPageSize !== 'all' && (
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setHistoryCurrentPage(1)}
                        disabled={historyCurrentPage === 1}
                        className="px-2.5 py-1.5 bg-white/5 hover:bg-white/10 text-white disabled:opacity-30 disabled:cursor-not-allowed rounded-lg border border-white/10 transition-colors text-xs"
                        title="First page"
                      >
                        First
                      </button>

                      <button
                        onClick={() => setHistoryCurrentPage(prev => Math.max(1, prev - 1))}
                        disabled={historyCurrentPage === 1}
                        className="p-1.5 sm:px-2.5 sm:py-1.5 bg-white/5 hover:bg-white/10 text-white disabled:opacity-30 disabled:cursor-not-allowed rounded-lg border border-white/10 transition-colors text-xs flex items-center gap-1"
                        title="Previous page"
                      >
                        <ChevronLeft size={14} />
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
                              className={`min-w-[30px] h-7.5 rounded-lg text-xs font-semibold transition-all ${
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
                        className="p-1.5 sm:px-2.5 sm:py-1.5 bg-white/5 hover:bg-white/10 text-white disabled:opacity-30 disabled:cursor-not-allowed rounded-lg border border-white/10 transition-colors text-xs flex items-center gap-1"
                        title="Next page"
                      >
                        <span className="hidden sm:inline">Next</span>
                        <ChevronRight size={14} />
                      </button>

                      <button
                        onClick={() => setHistoryCurrentPage(historyTotalPages)}
                        disabled={historyCurrentPage === historyTotalPages}
                        className="px-2.5 py-1.5 bg-white/5 hover:bg-white/10 text-white disabled:opacity-30 disabled:cursor-not-allowed rounded-lg border border-white/10 transition-colors text-xs"
                        title="Last page"
                      >
                        Last
                      </button>
                    </div>
                  )}
                </div>
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
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white/60 text-sm">Active Trips</p>
                  <p className="text-2xl font-bold text-white mt-1">
                    {trips.filter(t => t.status === 'in_progress').length}
                  </p>
                </div>
                <div className="p-3 bg-blue-500/20 rounded-xl text-blue-400">
                  <Activity size={24} />
                </div>
              </div>
            </div>

            <div className="glass-card p-4 border border-green-500/30">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white/60 text-sm">Active Buses</p>
                  <p className="text-2xl font-bold text-white mt-1">
                    {new Set(trips.filter(t => t.status === 'in_progress').map(t => t.buses?.plate_number)).size}
                  </p>
                </div>
                <div className="p-3 bg-green-500/20 rounded-xl text-green-400">
                  <Bus size={24} />
                </div>
              </div>
            </div>

            <div className="glass-card p-4 border border-purple-500/30">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white/60 text-sm">Total Real-time Passengers</p>
                  <p className="text-2xl font-bold text-white mt-1">
                    {trips.filter(t => t.status === 'in_progress').reduce((sum, t) => sum + (Number(t.total_passengers) || 0), 0)}
                  </p>
                </div>
                <div className="p-3 bg-purple-500/20 rounded-xl text-purple-400">
                  <Users size={24} />
                </div>
              </div>
            </div>
          </div>

          {/* Active Trips Filters & Table */}
          <div className="glass-card p-6 border border-white/10 space-y-4">
            <div className="flex flex-col sm:flex-row gap-4 justify-between items-center">
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" size={18} />
                <input
                  type="text"
                  placeholder="Search active trips..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-orange-500 text-sm"
                />
              </div>

              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white text-sm focus:outline-none focus:border-orange-500 w-full sm:w-auto"
              >
                <option value="all" className="bg-gray-800">All Status</option>
                <option value="in_progress" className="bg-gray-800">In Progress</option>
                <option value="completed" className="bg-gray-800">Completed</option>
                <option value="cancelled" className="bg-gray-800">Cancelled</option>
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
                      <tr className="border-b border-white/10 text-left">
                        <th className="py-3 px-4 text-white/60 font-medium text-sm">Bus</th>
                        <th className="py-3 px-4 text-white/60 font-medium text-sm">Route</th>
                        <th className="py-3 px-4 text-white/60 font-medium text-sm">Conductor</th>
                        <th className="py-3 px-4 text-white/60 font-medium text-sm">Passengers</th>
                        <th className="py-3 px-4 text-white/60 font-medium text-sm">Started At</th>
                        <th className="py-3 px-4 text-white/60 font-medium text-sm">Status</th>
                        <th className="py-3 px-4 text-white/60 font-medium text-sm">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedActiveTrips.map((trip) => (
                        <tr key={trip.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                          <td className="py-4 px-4">
                            <div className="flex items-center gap-2">
                              <Bus className="text-orange-400" size={16} />
                              <span className="text-white font-medium">
                                {trip.buses?.bus_number || trip.buses?.plate_number || 'N/A'}
                              </span>
                            </div>
                          </td>
                          <td className="py-4 px-4 text-white/80">{trip.buses?.route || 'Unknown'}</td>
                          <td className="py-4 px-4 text-white/80">{trip.conductor?.full_name || 'Unassigned'}</td>
                          <td className="py-4 px-4 text-white/80">{trip.total_passengers || 0}</td>
                          <td className="py-4 px-4 text-white/60 text-sm">
                            {new Date(trip.started_at).toLocaleTimeString()}
                          </td>
                          <td className="py-4 px-4">
                            <span className={`px-3 py-1 rounded-full text-xs font-medium border ${statusColors[trip.status] || 'bg-white/10 text-white'}`}>
                              {statusLabels[trip.status] || trip.status}
                            </span>
                          </td>
                          <td className="py-4 px-4">
                            <button
                              onClick={() => fetchTripDetails(trip.id)}
                              className="px-3 py-1 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm transition-colors cursor-pointer"
                            >
                              View
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {totalPages > 1 && (
                  <div className="flex items-center justify-between pt-4 border-t border-white/10">
                    <span className="text-white/60 text-sm">
                      Showing {currentPage * itemsPerPage + 1} to {Math.min((currentPage + 1) * itemsPerPage, filteredActiveTrips.length)} of {filteredActiveTrips.length} trips
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

      {/* Comprehensive Trip Details & Video Playback Modal */}
      {selectedTrip && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
          <div className="glass-card rounded-2xl w-full max-w-5xl max-h-[92vh] overflow-hidden border border-white/15 flex flex-col my-auto shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 sm:p-5 border-b border-white/10 bg-white/[0.02]">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-orange-500/20 text-orange-400 rounded-xl border border-orange-500/30">
                  <Bus size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    Trip Details & Recorded Feed
                  </h2>
                  <p className="text-white/50 text-xs">
                    Bus {selectedTrip.buses?.bus_number || selectedTrip.buses?.plate_number || 'N/A'} • {selectedTrip.buses?.route || 'Route'} • Trip ID: <span className="font-mono text-white/70">{selectedTrip.id.slice(0, 8)}...</span>
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setSelectedTrip(null);
                  setTripDetails(null);
                  setTripVideoUrl(null);
                  setTripVideoStatus(null);
                }}
                className="text-white/60 hover:text-white transition-colors p-1.5 rounded-xl hover:bg-white/10"
              >
                <X size={22} />
              </button>
            </div>

            {/* Modal Scrollable Content */}
            <div className="p-4 sm:p-6 overflow-y-auto space-y-6 max-h-[calc(92vh-80px)]">
              {detailsLoading ? (
                <div className="text-center py-16">
                  <div className="w-10 h-10 border-3 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                  <p className="text-white/70 text-sm">Loading trip video recordings and telemetry...</p>
                </div>
              ) : (
                <>
                  {/* ──────────────── Video Section: Player + Segments List ──────────────── */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
                    {/* Left: Video Player Feed */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between px-1">
                        <span className="text-white text-sm font-semibold flex items-center gap-2">
                          <Play size={16} className="text-orange-400 fill-orange-400" />
                          Recorded Feed
                        </span>
                        {selectedTrip.video_recording_duration ? (
                          <span className="text-xs text-white/50 font-mono">
                            {Math.floor(selectedTrip.video_recording_duration / 60)}m {selectedTrip.video_recording_duration % 60}s
                            {selectedTrip.video_recording_file_size ? ` • ${(selectedTrip.video_recording_file_size / (1024 * 1024)).toFixed(1)} MB` : ''}
                          </span>
                        ) : null}
                      </div>

                      <div className="bg-black/60 rounded-xl overflow-hidden aspect-video relative border border-white/10 shadow-lg flex items-center justify-center">
                        {tripVideoUrl ? (
                          <div className="relative w-full h-full flex items-center justify-center bg-black">
                            {tripVideoUrl.endsWith('.avi') ? (
                              <div className="text-center px-6">
                                <Activity className="w-12 h-12 text-green-400 mx-auto mb-2" />
                                <p className="text-green-400 font-medium text-sm mb-1">Recording Available (AVI)</p>
                                <p className="text-white/50 text-xs mb-3">AVI recordings require download to play</p>
                                <a
                                  href={tripVideoUrl}
                                  download
                                  className="px-3.5 py-1.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-xs transition-colors inline-flex items-center gap-1.5 font-medium"
                                >
                                  <Download size={14} />
                                  Download Recording
                                </a>
                              </div>
                            ) : (
                              <video
                                controls
                                className="w-full h-full object-contain"
                                src={tripVideoUrl}
                              >
                                Your browser does not support the video tag.
                              </video>
                            )}
                          </div>
                        ) : tripVideoStatus === 'processing' ? (
                          <div className="text-center px-6">
                            <div className="w-9 h-9 border-2 border-orange-500/30 border-t-orange-500 rounded-full animate-spin mx-auto mb-2" />
                            <p className="text-orange-400 text-sm font-medium">Recording Processing</p>
                            <p className="text-white/40 text-xs mt-1">Video is being processed, please check back shortly</p>
                          </div>
                        ) : tripVideoStatus === 'not_available' ? (
                          <div className="text-center px-6">
                            <Video className="w-12 h-12 text-white/20 mx-auto mb-2" />
                            <p className="text-white/60 text-sm font-medium">No Recording Available</p>
                            <p className="text-white/30 text-xs mt-1">Video recording was not uploaded for this trip</p>
                          </div>
                        ) : tripVideoStatus === 'error' ? (
                          <div className="text-center px-6">
                            <AlertTriangle className="w-12 h-12 text-red-400 mx-auto mb-2" />
                            <p className="text-red-400 text-sm font-medium">Error Loading Video</p>
                            <p className="text-white/40 text-xs mt-1">Could not fetch video recording stream</p>
                          </div>
                        ) : (
                          <div className="text-center px-6">
                            <Video className="w-12 h-12 text-white/20 mx-auto mb-2" />
                            <p className="text-white/50 text-sm">No video selected</p>
                          </div>
                        )}
                      </div>

                      {tripVideoUrl && (
                        <div className="flex justify-end pt-1">
                          <a
                            href={tripVideoUrl}
                            download
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 text-white/80 hover:text-white rounded-lg text-xs border border-white/10 transition-colors"
                          >
                            <Download size={13} />
                            <span>Download Full Recording</span>
                          </a>
                        </div>
                      )}
                    </div>

                    {/* Right: Video Segments List */}
                    <div className="glass-card p-4 rounded-xl flex flex-col border border-white/10 space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-white font-semibold flex items-center gap-2 text-sm">
                          <Activity className="text-orange-400" size={16} />
                          Video Segments ({tripVideoRecordings.length})
                        </h3>
                        {tripVideoRecordings.length > 0 && (
                          <span className="text-xs text-white/40">
                            {tripVideoRecordings.length} clip{tripVideoRecordings.length > 1 ? 's' : ''}
                          </span>
                        )}
                      </div>

                      {tripVideoRecordings.length > 0 ? (
                        <>
                          <div className="space-y-2.5 overflow-y-auto max-h-[260px] pr-1">
                            {tripVideoRecordings.slice((modalVideoPage - 1) * 3, modalVideoPage * 3).map(rec => (
                              <div
                                key={rec.id}
                                className="bg-white/5 hover:bg-white/[0.08] p-3 rounded-lg border border-white/5 transition-colors space-y-2"
                              >
                                <div className="flex justify-between items-start gap-2">
                                  <div className="flex-1 min-w-0">
                                    <p className="text-white font-medium text-xs truncate" title={rec.file_name}>
                                      {rec.file_name}
                                    </p>
                                    <p className="text-white/40 text-[11px] capitalize">
                                      {rec.storage_type} storage {rec.format ? `• ${rec.format.toUpperCase()}` : ''}
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <span
                                      className={`text-[10px] px-2 py-0.5 rounded font-medium ${
                                        rec.status === 'completed'
                                          ? 'bg-emerald-500/20 text-emerald-300'
                                          : rec.status === 'recording'
                                          ? 'bg-amber-500/20 text-amber-300'
                                          : 'bg-red-500/20 text-red-300'
                                      }`}
                                    >
                                      {rec.status}
                                    </span>
                                    {rec.status === 'completed' && (
                                      <div className="flex items-center gap-1">
                                        <button
                                          onClick={() => {
                                            setTripVideoUrl(resolveVideoUrl(rec.file_name));
                                            setTripVideoStatus('available');
                                          }}
                                          className="p-1 rounded bg-orange-500/20 text-orange-400 hover:bg-orange-500/30 transition-colors"
                                          title="Play this segment"
                                        >
                                          <Play size={12} fill="currentColor" />
                                        </button>
                                        <button
                                          onClick={() => window.open(resolveVideoUrl(rec.file_name), '_blank')}
                                          className="p-1 rounded bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-colors"
                                          title="Download segment"
                                        >
                                          <Download size={12} />
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                </div>

                                <div className="grid grid-cols-3 gap-2 text-[11px] pt-1 border-t border-white/5">
                                  <div>
                                    <p className="text-white/40 text-[10px]">Duration</p>
                                    <p className="text-white">
                                      {rec.duration ? `${Math.floor(rec.duration / 60)}m ${rec.duration % 60}s` : 'N/A'}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-white/40 text-[10px]">Size</p>
                                    <p className="text-white">
                                      {rec.file_size ? `${(rec.file_size / (1024 * 1024)).toFixed(1)} MB` : 'N/A'}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-white/40 text-[10px]">Recorded At</p>
                                    <p className="text-white truncate">
                                      {rec.recorded_at ? new Date(rec.recorded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'N/A'}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>

                          {/* Video Segments Pagination */}
                          {Math.ceil(tripVideoRecordings.length / 3) > 1 && (
                            <div className="flex items-center justify-between pt-2 border-t border-white/10 text-xs">
                              <span className="text-white/40 text-[11px]">
                                {((modalVideoPage - 1) * 3) + 1}–{Math.min(modalVideoPage * 3, tripVideoRecordings.length)} of {tripVideoRecordings.length}
                              </span>
                              <div className="flex items-center gap-1.5">
                                <button
                                  onClick={() => setModalVideoPage(p => Math.max(p - 1, 1))}
                                  disabled={modalVideoPage === 1}
                                  className="p-1 rounded bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed text-white transition-colors"
                                  title="Previous segments"
                                >
                                  <ChevronLeft size={13} />
                                </button>
                                <span className="px-2 py-0.5 rounded bg-white/5 text-white/70 font-mono text-[11px]">
                                  {modalVideoPage} / {Math.ceil(tripVideoRecordings.length / 3)}
                                </span>
                                <button
                                  onClick={() => setModalVideoPage(p => Math.min(p + 1, Math.ceil(tripVideoRecordings.length / 3)))}
                                  disabled={modalVideoPage === Math.ceil(tripVideoRecordings.length / 3)}
                                  className="p-1 rounded bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed text-white transition-colors"
                                  title="Next segments"
                                >
                                  <ChevronRight size={13} />
                                </button>
                              </div>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="py-8 text-center text-white/40">
                          <Activity size={24} className="text-white/20 mx-auto mb-1.5" />
                          <p className="text-xs">No recording segments found for this trip</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* ──────────────── Trip Telemetry & Operations Breakdown ──────────────── */}
                  <div className="glass-card p-4 rounded-xl border border-white/10">
                    <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                      <Bus className="text-orange-400" size={16} />
                      Trip Information & Summary
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      <div className="bg-white/5 p-3 rounded-lg">
                        <p className="text-white/50 text-[11px]">Bus Number</p>
                        <p className="text-white font-semibold text-sm mt-0.5">{selectedTrip.buses?.bus_number || 'N/A'}</p>
                      </div>
                      <div className="bg-white/5 p-3 rounded-lg">
                        <p className="text-white/50 text-[11px]">Plate Number</p>
                        <p className="text-white font-semibold text-sm mt-0.5">{selectedTrip.buses?.plate_number || 'N/A'}</p>
                      </div>
                      <div className="bg-white/5 p-3 rounded-lg">
                        <p className="text-white/50 text-[11px]">Route</p>
                        <p className="text-white font-semibold text-sm mt-0.5 truncate">{selectedTrip.buses?.route || 'Unknown'}</p>
                      </div>
                      <div className="bg-white/5 p-3 rounded-lg">
                        <p className="text-white/50 text-[11px]">Status</p>
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold capitalize mt-1 border ${statusColors[selectedTrip.status] || 'bg-white/10 text-white'}`}>
                          {statusLabels[selectedTrip.status] || selectedTrip.status}
                        </span>
                      </div>
                      <div className="bg-white/5 p-3 rounded-lg">
                        <p className="text-white/50 text-[11px]">Conductor</p>
                        <p className="text-white font-medium mt-0.5">{selectedTrip.conductor?.full_name || '—'}</p>
                      </div>
                      <div className="bg-white/5 p-3 rounded-lg">
                        <p className="text-white/50 text-[11px]">Driver</p>
                        <p className="text-white font-medium mt-0.5">{selectedTrip.driver?.full_name || '—'}</p>
                      </div>
                      <div className="bg-white/5 p-3 rounded-lg">
                        <p className="text-white/50 text-[11px]">Passengers Count</p>
                        <p className="text-white font-bold text-sm mt-0.5">{selectedTrip.total_passengers || 0}</p>
                      </div>
                      <div className="bg-white/5 p-3 rounded-lg">
                        <p className="text-white/50 text-[11px]">Video Status</p>
                        <p className="text-white font-medium mt-0.5 capitalize">{selectedTrip.video_recording_status || 'not_recorded'}</p>
                      </div>
                    </div>

                    <div className="mt-3 pt-3 border-t border-white/5 flex flex-col sm:flex-row justify-between text-white/50 text-xs gap-1">
                      <span>Started: {new Date(selectedTrip.started_at).toLocaleString()}</span>
                      <span>Ended: {selectedTrip.ended_at ? new Date(selectedTrip.ended_at).toLocaleString() : 'In Progress'}</span>
                    </div>
                  </div>

                  {/* ──────────────── Transactions, Irregularities & Alerts ──────────────── */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Transactions */}
                    <div className="glass-card p-4 rounded-xl border border-white/10 space-y-2">
                      <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        <Receipt className="text-emerald-400" size={16} />
                        Passenger Transactions ({tripDetails?.transactions?.length || 0})
                      </h3>
                      {tripDetails?.transactions && tripDetails.transactions.length > 0 ? (
                        <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                          {tripDetails.transactions.map((tx: any) => (
                            <div key={tx.id} className="bg-white/5 p-2.5 rounded-lg border border-white/5 flex justify-between items-center text-xs">
                              <div>
                                <p className="text-white font-medium">{tx.transaction_type || 'Fare Payment'}</p>
                                <p className="text-white/40 text-[11px]">{new Date(tx.created_at).toLocaleTimeString()}</p>
                              </div>
                              <span className="text-emerald-400 font-semibold text-sm">₱{Number(tx.amount || 0).toFixed(2)}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-white/40 text-xs py-4 text-center">No passenger transactions recorded</p>
                      )}
                    </div>

                    {/* Irregularities & Anomalies */}
                    <div className="glass-card p-4 rounded-xl border border-white/10 space-y-2">
                      <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        <AlertTriangle className="text-amber-400" size={16} />
                        Irregularities & Anomalies ({((tripDetails?.irregularities?.length || 0) + (tripDetails?.anomalies?.length || 0))})
                      </h3>
                      {((tripDetails?.irregularities?.length || 0) + (tripDetails?.anomalies?.length || 0)) > 0 ? (
                        <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                          {tripDetails?.irregularities?.map((irr: any) => (
                            <div key={irr.id} className="bg-amber-500/10 p-2.5 rounded-lg border border-amber-500/20 text-xs">
                              <p className="text-amber-300 font-medium">{irr.type || 'Fare Discrepancy'}</p>
                              <p className="text-white/70 text-[11px] mt-0.5">{irr.description || 'Discrepancy detected'}</p>
                            </div>
                          ))}
                          {tripDetails?.anomalies?.map((ano: any) => (
                            <div key={ano.id} className="bg-purple-500/10 p-2.5 rounded-lg border border-purple-500/20 text-xs">
                              <p className="text-purple-300 font-medium">{ano.anomaly_type || 'Anomaly Detection'}</p>
                              <p className="text-white/70 text-[11px] mt-0.5">{ano.description || 'Automated anomaly'}</p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-white/40 text-xs py-4 text-center">No irregularities or anomalies recorded</p>
                      )}
                    </div>
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
