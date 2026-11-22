import { useState, useEffect, useCallback, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
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
  ArrowLeft,
  Plus,
  Edit,
  Trash2,
  User,
  Wrench,
  ShieldAlert
} from 'lucide-react';
import toast from 'react-hot-toast';
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

export interface BusItem {
  id: string;
  bus_number: number | string | null;
  plate_number: string;
  route: string;
  seat_capacity: number;
  capacity?: number;
  status: 'active' | 'maintenance' | 'inactive' | string;
  bus_type?: string;
  assigned_conductor_id?: string | null;
  assigned_driver_id?: string | null;
  conductor?: { id: string; full_name: string } | null;
  driver?: { id: string; full_name: string } | null;
  created_at?: string;
}

interface StaffUser {
  id: string;
  full_name: string;
  role: string;
}

type PeriodType = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom' | 'all';
type PageSizeOption = '10' | '25' | '50' | '100' | 'all';
type ActiveTab = 'active' | 'fleet' | 'history';

const resolveVideoUrl = (fileNameOrUrl: string | null | undefined): string => {
  if (!fileNameOrUrl) return '';
  if (fileNameOrUrl.startsWith('http://') || fileNameOrUrl.startsWith('https://')) {
    return fileNameOrUrl;
  }
  const backendUrl = (import.meta.env.VITE_BACKEND_URL || 'https://sys-admin-62ro.onrender.com').replace(/\/$/, '');
  const cleanName = fileNameOrUrl.split('/').pop() || fileNameOrUrl;
  return `${backendUrl}/api/video-processing/download-video/${cleanName}`;
};

export default function TripManagement({ defaultTab }: { defaultTab?: ActiveTab }) {
  const location = useLocation();

  // Navigation tabs: active trips, bus fleet CRUD, trip history
  const [activeTab, setActiveTab] = useState<ActiveTab>(() => {
    if (defaultTab) return defaultTab;
    if (location.pathname.includes('buses')) return 'fleet';
    return 'active';
  });

  const [trips, setTrips] = useState<Trip[]>([]);
  const [recordingsByTrip, setRecordingsByTrip] = useState<Record<string, VideoRecording[]>>({});
  const [loading, setLoading] = useState(true);

  // Active trips view state
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [currentPage, setCurrentPage] = useState(0);
  const itemsPerPage = 10;

  // History view state
  const [historyPeriod, setHistoryPeriod] = useState<PeriodType>('daily');
  const [customDateRange, setCustomDateRange] = useState({ startDate: '', endDate: '' });
  const [historySearchTerm, setHistorySearchTerm] = useState('');
  const [historyStatusFilter, setHistoryStatusFilter] = useState('all');
  const [historyCurrentPage, setHistoryCurrentPage] = useState(1);
  const [historyPageSize, setHistoryPageSize] = useState<PageSizeOption>('10');

  // Bus Fleet (CRUD) state
  const [buses, setBuses] = useState<BusItem[]>([]);
  const [busesLoading, setBusesLoading] = useState(false);
  const [busSearchTerm, setBusSearchTerm] = useState('');
  const [busStatusFilter, setBusStatusFilter] = useState('all');
  const [busCurrentPage, setBusCurrentPage] = useState(1);
  const [busPageSize, setBusPageSize] = useState<PageSizeOption>('10');
  const [drivers, setDrivers] = useState<StaffUser[]>([]);
  const [conductors, setConductors] = useState<StaffUser[]>([]);

  // Bus Add/Edit Modal state
  const [showAddBusModal, setShowAddBusModal] = useState(false);
  const [editingBus, setEditingBus] = useState<BusItem | null>(null);
  const [busSaving, setBusSaving] = useState(false);
  const [busFormData, setBusFormData] = useState({
    bus_number: '',
    plate_number: '',
    route: 'Manolo Fortich Terminal ↔ Agora Terminal',
    seat_capacity: 35,
    status: 'active',
    driver_id: '',
    conductor_id: ''
  });

  // Trip Details & Video Modal states
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

  // ── Fetch Trips with both Conductor AND Driver ───────────────────────────
  const fetchTrips = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('trips')
        .select('*, buses!fk_trips_bus_id(*), conductor:staff_users!fk_trips_conductor_id(*), driver:staff_users!fk_trips_driver_id(*)')
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

  // ── Fetch Buses for Fleet CRUD ───────────────────────────────────────────
  const fetchBuses = useCallback(async () => {
    try {
      setBusesLoading(true);
      const { data, error } = await supabase
        .from('buses')
        .select('*, conductor:staff_users!buses_assigned_conductor_id_fkey(id, full_name), driver:staff_users!buses_assigned_driver_id_fkey(id, full_name)')
        .order('bus_number', { ascending: true });

      if (error) throw error;
      setBuses(data || []);
    } catch (error) {
      console.error('Error fetching buses:', error);
    } finally {
      setBusesLoading(false);
    }
  }, []);

  // ── Fetch Staff for Driver & Conductor assignment ────────────────────────
  const fetchStaff = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('staff_users')
        .select('id, full_name, role');

      if (error) throw error;
      const allStaff = data || [];
      setDrivers(allStaff.filter(s => s.role === 'driver'));
      setConductors(allStaff.filter(s => s.role === 'conductor'));
    } catch (error) {
      console.error('Error fetching staff users:', error);
    }
  }, []);

  useEffect(() => {
    fetchTrips();
    fetchBuses();
    fetchStaff();

    const tripsSub = supabase
      .channel('trips-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trips' }, fetchTrips)
      .subscribe();

    const busesSub = supabase
      .channel('buses-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'buses' }, fetchBuses)
      .subscribe();

    return () => {
      tripsSub.unsubscribe();
      busesSub.unsubscribe();
    };
  }, [fetchTrips, fetchBuses, fetchStaff]);

  // ── Bus CRUD Operations ──────────────────────────────────────────────────
  const handleOpenAddBus = () => {
    setEditingBus(null);
    setBusFormData({
      bus_number: '',
      plate_number: '',
      route: 'Manolo Fortich Terminal ↔ Agora Terminal',
      seat_capacity: 35,
      status: 'active',
      driver_id: '',
      conductor_id: ''
    });
    setShowAddBusModal(true);
  };

  const handleOpenEditBus = (bus: BusItem) => {
    setEditingBus(bus);
    setBusFormData({
      bus_number: bus.bus_number ? String(bus.bus_number) : '',
      plate_number: bus.plate_number || '',
      route: bus.route || 'Manolo Fortich Terminal ↔ Agora Terminal',
      seat_capacity: bus.seat_capacity || 35,
      status: bus.status || 'active',
      driver_id: bus.assigned_driver_id || bus.driver?.id || '',
      conductor_id: bus.assigned_conductor_id || bus.conductor?.id || ''
    });
    setShowAddBusModal(true);
  };

  const handleSaveBus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!busFormData.plate_number.trim()) {
      toast.error('Plate number is required');
      return;
    }

    try {
      setBusSaving(true);
      const payload: any = {
        plate_number: busFormData.plate_number.trim().toUpperCase(),
        bus_number: busFormData.bus_number ? parseInt(busFormData.bus_number, 10) : null,
        route: busFormData.route.trim(),
        seat_capacity: Number(busFormData.seat_capacity) || 35,
        status: busFormData.status,
        assigned_driver_id: busFormData.driver_id || null,
        assigned_conductor_id: busFormData.conductor_id || null
      };

      if (editingBus) {
        const { error } = await supabase
          .from('buses')
          .update(payload)
          .eq('id', editingBus.id);

        if (error) throw error;
        toast.success(`Bus ${payload.plate_number} updated successfully`);
      } else {
        const { error } = await supabase
          .from('buses')
          .insert([payload]);

        if (error) throw error;
        toast.success(`Bus ${payload.plate_number} added successfully`);
      }

      setShowAddBusModal(false);
      setEditingBus(null);
      await fetchBuses();
      await fetchTrips();
    } catch (err: any) {
      console.error('Error saving bus:', err);
      toast.error(err.message || 'Failed to save bus');
    } finally {
      setBusSaving(false);
    }
  };

  const handleDeleteBus = async (bus: BusItem) => {
    const confirmMessage = `Are you sure you want to delete Bus #${bus.bus_number || ''} (${bus.plate_number})? This action cannot be undone.`;
    if (!window.confirm(confirmMessage)) return;

    try {
      const { error } = await supabase
        .from('buses')
        .delete()
        .eq('id', bus.id);

      if (error) {
        if (error.code === '23503' || error.message.toLowerCase().includes('foreign key')) {
          toast.error(`Cannot delete bus ${bus.plate_number} because it has historical trip records. You can set its status to "Inactive" instead.`);
        } else {
          toast.error(error.message || 'Failed to delete bus');
        }
        return;
      }

      toast.success(`Bus ${bus.plate_number} deleted successfully`);
      await fetchBuses();
      await fetchTrips();
    } catch (err: any) {
      console.error('Error deleting bus:', err);
      toast.error(err.message || 'Failed to delete bus');
    }
  };

  const handleUpdateBusStatus = async (busId: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from('buses')
        .update({ status: newStatus })
        .eq('id', busId);

      if (error) throw error;
      toast.success(`Bus status changed to ${newStatus}`);
      await fetchBuses();
      await fetchTrips();
    } catch (err: any) {
      console.error('Error updating status:', err);
      toast.error('Failed to update bus status');
    }
  };

  // ── Trip Details Modal Loader ───────────────────────────────────────────
  const fetchTripDetails = async (tripId: string) => {
    try {
      setDetailsLoading(true);
      const foundTrip = trips.find(t => t.id === tripId) || null;
      setSelectedTrip(foundTrip);
      setTripVideoUrl(null);
      setTripVideoStatus(null);
      setTripVideoRecordings([]);
      setModalVideoPage(1);

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

  // ── Active Trips filtering (Includes Driver) ─────────────────────────────
  const filteredActiveTrips = useMemo(() => {
    return trips.filter(trip => {
      const q = searchTerm.toLowerCase();
      const matchesSearch =
        trip.buses?.plate_number?.toLowerCase().includes(q) ||
        String(trip.buses?.bus_number || '').toLowerCase().includes(q) ||
        trip.buses?.route?.toLowerCase().includes(q) ||
        trip.conductor?.full_name?.toLowerCase().includes(q) ||
        trip.driver?.full_name?.toLowerCase().includes(q);

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

  // ── Bus Fleet filtering (CRUD View) ──────────────────────────────────────
  const filteredBuses = useMemo(() => {
    return buses.filter(bus => {
      const q = busSearchTerm.toLowerCase().trim();
      const matchesSearch =
        !q ||
        bus.plate_number?.toLowerCase().includes(q) ||
        String(bus.bus_number || '').toLowerCase().includes(q) ||
        bus.route?.toLowerCase().includes(q) ||
        bus.driver?.full_name?.toLowerCase().includes(q) ||
        bus.conductor?.full_name?.toLowerCase().includes(q);

      const matchesStatus = busStatusFilter === 'all' || bus.status === busStatusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [buses, busSearchTerm, busStatusFilter]);

  const busTotalPages = useMemo(() => {
    if (busPageSize === 'all') return 1;
    const size = parseInt(busPageSize, 10);
    return Math.max(1, Math.ceil(filteredBuses.length / size));
  }, [filteredBuses.length, busPageSize]);

  const paginatedBuses = useMemo(() => {
    if (busPageSize === 'all') return filteredBuses;
    const size = parseInt(busPageSize, 10);
    const start = (busCurrentPage - 1) * size;
    return filteredBuses.slice(start, start + size);
  }, [filteredBuses, busCurrentPage, busPageSize]);

  // ── History View filtering ───────────────────────────────────────────────
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

  const historyStats = useMemo(() => {
    const totalTrips = periodFilteredHistoryTrips.length;
    const totalPassengers = periodFilteredHistoryTrips.reduce(
      (sum, t) => sum + (Number(t.total_passengers) || 0),
      0
    );
    const avgPassengers = totalTrips > 0 ? Math.round(totalPassengers / totalTrips) : 0;
    return { totalTrips, totalPassengers, avgPassengers };
  }, [periodFilteredHistoryTrips]);

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

  const busStatusColors: Record<string, string> = {
    active: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    maintenance: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    inactive: 'bg-red-500/20 text-red-400 border-red-500/30'
  };

  return (
    <div className="space-y-6">
      {/* ── Top Header and View Tabs ───────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Bus className="text-orange-400" size={26} />
            {activeTab === 'active' && 'Trip Management'}
            {activeTab === 'fleet' && 'Bus Fleet Management'}
            {activeTab === 'history' && 'Trip History Log'}
          </h1>
          <p className="text-white/60 text-sm mt-0.5">
            {activeTab === 'active' && 'Monitor active fleet operations, conductor/driver assignments, and telemetry'}
            {activeTab === 'fleet' && 'Add, edit, assign drivers & conductors, and configure your transit buses'}
            {activeTab === 'history' && 'Historical run records, passenger load metrics, and on-board video feeds'}
          </p>
        </div>

        {/* View Selection Tabs & Add Bus Shortcut */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="bg-white/5 p-1 rounded-xl border border-white/10 flex items-center gap-1">
            <button
              onClick={() => setActiveTab('active')}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'active'
                  ? 'bg-orange-500 text-white shadow-md shadow-orange-500/30'
                  : 'text-white/70 hover:text-white hover:bg-white/5'
              }`}
            >
              <Activity size={15} />
              <span>Active Trips</span>
              <span className="ml-1 px-1.5 py-0.2 rounded-full bg-black/30 text-[10px]">
                {trips.filter(t => t.status === 'in_progress').length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('fleet')}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'fleet'
                  ? 'bg-orange-500 text-white shadow-md shadow-orange-500/30'
                  : 'text-white/70 hover:text-white hover:bg-white/5'
              }`}
            >
              <Bus size={15} />
              <span>Bus Fleet</span>
              <span className="ml-1 px-1.5 py-0.2 rounded-full bg-black/30 text-[10px]">
                {buses.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('history')}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'history'
                  ? 'bg-orange-500 text-white shadow-md shadow-orange-500/30'
                  : 'text-white/70 hover:text-white hover:bg-white/5'
              }`}
            >
              <Clock size={15} />
              <span>Trip History</span>
            </button>
          </div>

          {/* Quick Add Bus Button */}
          <button
            onClick={handleOpenAddBus}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-xs sm:text-sm font-semibold transition-all shadow-lg shadow-orange-500/20 cursor-pointer"
          >
            <Plus size={16} />
            <span>Add Bus</span>
          </button>
        </div>
      </div>

      {/* ── TAB 1: ACTIVE TRIPS VIEW (Includes Driver column) ───────────────── */}
      {activeTab === 'active' && (
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
                  <p className="text-white/60 text-sm">Active Buses in Transit</p>
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
              <div className="relative w-full sm:w-80">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" size={18} />
                <input
                  type="text"
                  placeholder="Search by bus, route, driver, conductor..."
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
                <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                <div className="text-white/60 text-sm">Loading trips...</div>
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
                        <th className="py-3 px-4 text-white/60 font-medium text-sm">Driver</th>
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
                          <td className="py-4 px-4 text-white/90 font-medium">{trip.driver?.full_name || 'Unassigned'}</td>
                          <td className="py-4 px-4 text-white/80">{trip.conductor?.full_name || 'Unassigned'}</td>
                          <td className="py-4 px-4 text-white/80 font-bold">{trip.total_passengers || 0}</td>
                          <td className="py-4 px-4 text-white/60 text-sm">
                            {new Date(trip.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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

      {/* ── TAB 2: BUS FLEET MANAGEMENT (CRUD VIEW) ────────────────────────── */}
      {activeTab === 'fleet' && (
        <div className="space-y-6">
          {/* Fleet Statistics Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="glass-card p-4 border border-white/10 flex items-center justify-between">
              <div>
                <p className="text-white/60 text-xs uppercase tracking-wider font-semibold">Total Fleet</p>
                <p className="text-2xl font-bold text-white mt-1">{buses.length}</p>
              </div>
              <div className="p-2.5 rounded-xl bg-orange-500/15 text-orange-400">
                <Bus size={22} />
              </div>
            </div>

            <div className="glass-card p-4 border border-emerald-500/30 flex items-center justify-between">
              <div>
                <p className="text-white/60 text-xs uppercase tracking-wider font-semibold">Active Buses</p>
                <p className="text-2xl font-bold text-emerald-400 mt-1">
                  {buses.filter(b => b.status === 'active').length}
                </p>
              </div>
              <div className="p-2.5 rounded-xl bg-emerald-500/15 text-emerald-400">
                <CheckCircle size={22} />
              </div>
            </div>

            <div className="glass-card p-4 border border-amber-500/30 flex items-center justify-between">
              <div>
                <p className="text-white/60 text-xs uppercase tracking-wider font-semibold">Under Maintenance</p>
                <p className="text-2xl font-bold text-amber-400 mt-1">
                  {buses.filter(b => b.status === 'maintenance').length}
                </p>
              </div>
              <div className="p-2.5 rounded-xl bg-amber-500/15 text-amber-400">
                <Wrench size={22} />
              </div>
            </div>

            <div className="glass-card p-4 border border-red-500/30 flex items-center justify-between">
              <div>
                <p className="text-white/60 text-xs uppercase tracking-wider font-semibold">Inactive Buses</p>
                <p className="text-2xl font-bold text-red-400 mt-1">
                  {buses.filter(b => b.status === 'inactive').length}
                </p>
              </div>
              <div className="p-2.5 rounded-xl bg-red-500/15 text-red-400">
                <ShieldAlert size={22} />
              </div>
            </div>
          </div>

          {/* Bus Fleet Table Card */}
          <div className="glass-card p-6 border border-white/10 rounded-2xl space-y-4">
            <div className="flex flex-col sm:flex-row gap-3 justify-between items-center">
              <div className="relative w-full sm:w-80">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" size={18} />
                <input
                  type="text"
                  placeholder="Search by bus #, plate, route, driver..."
                  value={busSearchTerm}
                  onChange={(e) => {
                    setBusSearchTerm(e.target.value);
                    setBusCurrentPage(1);
                  }}
                  className="w-full pl-10 pr-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-orange-500 text-sm"
                />
              </div>

              <div className="flex items-center gap-2.5 w-full sm:w-auto">
                <Filter size={16} className="text-white/50 hidden sm:block" />
                <select
                  value={busStatusFilter}
                  onChange={(e) => {
                    setBusStatusFilter(e.target.value);
                    setBusCurrentPage(1);
                  }}
                  className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500 w-full sm:w-auto"
                >
                  <option value="all" className="bg-gray-800">All Status</option>
                  <option value="active" className="bg-gray-800">Active</option>
                  <option value="maintenance" className="bg-gray-800">Maintenance</option>
                  <option value="inactive" className="bg-gray-800">Inactive</option>
                </select>

                <button
                  onClick={handleOpenAddBus}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-semibold transition-colors shrink-0 shadow-md shadow-orange-500/20"
                >
                  <Plus size={16} />
                  <span>Add Bus</span>
                </button>
              </div>
            </div>

            {/* Table */}
            {busesLoading ? (
              <div className="text-center py-12">
                <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                <p className="text-white/60 text-sm">Loading bus fleet...</p>
              </div>
            ) : filteredBuses.length === 0 ? (
              <div className="text-center py-12 border border-white/10 rounded-xl bg-white/[0.02]">
                <Bus size={40} className="text-white/20 mx-auto mb-2" />
                <p className="text-white font-medium">No buses match your criteria</p>
                <p className="text-white/40 text-xs mt-1">Try adjusting your search or add a new bus</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto rounded-xl border border-white/10">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-white/5 border-b border-white/10 text-left text-xs uppercase tracking-wider text-white/60">
                        <th className="py-3 px-4 font-semibold">Bus #</th>
                        <th className="py-3 px-4 font-semibold">Plate Number</th>
                        <th className="py-3 px-4 font-semibold">Route</th>
                        <th className="py-3 px-4 font-semibold">Capacity</th>
                        <th className="py-3 px-4 font-semibold">Driver</th>
                        <th className="py-3 px-4 font-semibold">Conductor</th>
                        <th className="py-3 px-4 font-semibold">Status</th>
                        <th className="py-3 px-4 font-semibold text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 text-sm">
                      {paginatedBuses.map((bus) => (
                        <tr key={bus.id} className="hover:bg-white/5 transition-colors">
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-white font-bold text-base">
                                #{bus.bus_number || '—'}
                              </span>
                            </div>
                          </td>
                          <td className="py-3.5 px-4">
                            <span className="font-mono text-orange-400 font-semibold bg-orange-500/10 px-2 py-0.5 rounded border border-orange-500/20 text-xs">
                              {bus.plate_number}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-white/80 max-w-[220px] truncate" title={bus.route}>
                            {bus.route}
                          </td>
                          <td className="py-3.5 px-4 text-white/80">
                            {bus.seat_capacity || 35} seats
                          </td>
                          <td className="py-3.5 px-4 text-white/90 font-medium">
                            {bus.driver?.full_name || 'Unassigned'}
                          </td>
                          <td className="py-3.5 px-4 text-white/80">
                            {bus.conductor?.full_name || 'Unassigned'}
                          </td>
                          <td className="py-3.5 px-4">
                            <select
                              value={bus.status}
                              onChange={(e) => handleUpdateBusStatus(bus.id, e.target.value)}
                              className={`px-2 py-1 rounded-lg text-xs font-medium border bg-gray-900 cursor-pointer ${busStatusColors[bus.status] || 'border-white/20 text-white'}`}
                            >
                              <option value="active">Active</option>
                              <option value="maintenance">Maintenance</option>
                              <option value="inactive">Inactive</option>
                            </select>
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => handleOpenEditBus(bus)}
                                className="p-1.5 bg-white/5 hover:bg-white/15 text-white/80 hover:text-white rounded-lg border border-white/10 transition-colors"
                                title="Edit bus details"
                              >
                                <Edit size={14} />
                              </button>
                              <button
                                onClick={() => handleDeleteBus(bus)}
                                className="p-1.5 bg-red-500/10 hover:bg-red-500/25 text-red-400 rounded-lg border border-red-500/20 transition-colors"
                                title="Delete bus"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Fleet Pagination Toolbar */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pt-3 gap-3 border-t border-white/10">
                  <div className="flex items-center gap-3 text-white/60 text-xs sm:text-sm">
                    <span>
                      Showing {filteredBuses.length === 0 ? 0 : (busPageSize === 'all' ? 1 : (busCurrentPage - 1) * parseInt(busPageSize, 10) + 1)} to{' '}
                      {busPageSize === 'all' ? filteredBuses.length : Math.min(busCurrentPage * parseInt(busPageSize, 10), filteredBuses.length)} of {filteredBuses.length} buses
                    </span>

                    <div className="flex items-center gap-1.5 ml-2">
                      <span className="text-xs text-white/40">Per page:</span>
                      <select
                        value={busPageSize}
                        onChange={(e) => {
                          setBusPageSize(e.target.value as PageSizeOption);
                          setBusCurrentPage(1);
                        }}
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

                  {busPageSize !== 'all' && busTotalPages > 1 && (
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setBusCurrentPage(p => Math.max(1, p - 1))}
                        disabled={busCurrentPage === 1}
                        className="p-1.5 sm:px-2.5 sm:py-1 bg-white/5 hover:bg-white/10 text-white disabled:opacity-30 disabled:cursor-not-allowed rounded-lg border border-white/10 transition-colors text-xs flex items-center gap-1"
                      >
                        <ChevronLeft size={14} />
                        <span className="hidden sm:inline">Prev</span>
                      </button>

                      <span className="px-2.5 py-1 rounded-lg bg-white/5 text-white/70 text-xs font-mono">
                        Page {busCurrentPage} of {busTotalPages}
                      </span>

                      <button
                        onClick={() => setBusCurrentPage(p => Math.min(busTotalPages, p + 1))}
                        disabled={busCurrentPage === busTotalPages}
                        className="p-1.5 sm:px-2.5 sm:py-1 bg-white/5 hover:bg-white/10 text-white disabled:opacity-30 disabled:cursor-not-allowed rounded-lg border border-white/10 transition-colors text-xs flex items-center gap-1"
                      >
                        <span className="hidden sm:inline">Next</span>
                        <ChevronRight size={14} />
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── TAB 3: TRIP HISTORY VIEW ───────────────────────────────────────── */}
      {activeTab === 'history' && (
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

              <div className="flex items-center gap-2">
                <span className="text-xs text-white/50">Historical Trip Logs</span>
              </div>
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
                        <th className="text-left py-3.5 px-4 font-semibold">Driver</th>
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
                            <td className="py-3.5 px-4 text-white/90 text-sm font-medium">
                              {trip.driver?.full_name || '—'}
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
                      Showing {finalFilteredHistoryTrips.length === 0 ? 0 : (historyPageSize === 'all' ? 1 : (historyCurrentPage - 1) * parseInt(historyPageSize, 10) + 1)} to{' '}
                      {historyPageSize === 'all' ? finalFilteredHistoryTrips.length : Math.min(historyCurrentPage * parseInt(historyPageSize, 10), finalFilteredHistoryTrips.length)} of {finalFilteredHistoryTrips.length} trips
                    </span>

                    <div className="flex items-center gap-1.5 ml-2">
                      <span className="text-xs text-white/40">Per page:</span>
                      <select
                        value={historyPageSize}
                        onChange={e => {
                          setHistoryPageSize(e.target.value as PageSizeOption);
                          setHistoryCurrentPage(1);
                        }}
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
                      >
                        First
                      </button>

                      <button
                        onClick={() => setHistoryCurrentPage(prev => Math.max(1, prev - 1))}
                        disabled={historyCurrentPage === 1}
                        className="p-1.5 sm:px-2.5 sm:py-1.5 bg-white/5 hover:bg-white/10 text-white disabled:opacity-30 disabled:cursor-not-allowed rounded-lg border border-white/10 transition-colors text-xs flex items-center gap-1"
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
                      >
                        <span className="hidden sm:inline">Next</span>
                        <ChevronRight size={14} />
                      </button>

                      <button
                        onClick={() => setHistoryCurrentPage(historyTotalPages)}
                        disabled={historyCurrentPage === historyTotalPages}
                        className="px-2.5 py-1.5 bg-white/5 hover:bg-white/10 text-white disabled:opacity-30 disabled:cursor-not-allowed rounded-lg border border-white/10 transition-colors text-xs"
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
      )}

      {/* ── MODAL 1: ADD / EDIT BUS MODAL (CRUD) ────────────────────────────── */}
      {showAddBusModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="glass-card rounded-2xl w-full max-w-2xl overflow-hidden border border-white/15 flex flex-col my-auto shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-white/10 bg-white/[0.02]">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-orange-500/20 text-orange-400 rounded-xl border border-orange-500/30">
                  <Bus size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">
                    {editingBus ? `Edit Bus #${editingBus.bus_number || ''} (${editingBus.plate_number})` : 'Add New Fleet Bus'}
                  </h2>
                  <p className="text-white/50 text-xs">
                    Configure plate number, route, seat capacity, driver & conductor assignment
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowAddBusModal(false);
                  setEditingBus(null);
                }}
                className="text-white/60 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSaveBus} className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Left: Bus Specs */}
                <div className="space-y-4">
                  <div>
                    <label className="text-white/70 text-xs font-semibold uppercase tracking-wider block mb-1">
                      Bus Number <span className="text-white/40 font-normal lowercase">(optional)</span>
                    </label>
                    <input
                      type="number"
                      placeholder="e.g. 1001"
                      value={busFormData.bus_number}
                      onChange={(e) => setBusFormData({ ...busFormData, bus_number: e.target.value })}
                      className="w-full bg-white/5 border border-white/15 rounded-xl px-3.5 py-2.5 text-white text-sm focus:outline-none focus:border-orange-500 transition-colors"
                    />
                  </div>

                  <div>
                    <label className="text-white/70 text-xs font-semibold uppercase tracking-wider block mb-1">
                      Plate Number <span className="text-orange-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. BUS-001"
                      value={busFormData.plate_number}
                      onChange={(e) => setBusFormData({ ...busFormData, plate_number: e.target.value })}
                      className="w-full bg-white/5 border border-white/15 rounded-xl px-3.5 py-2.5 text-white text-sm focus:outline-none focus:border-orange-500 uppercase font-mono transition-colors"
                    />
                  </div>

                  <div>
                    <label className="text-white/70 text-xs font-semibold uppercase tracking-wider block mb-1">
                      Route Corridor <span className="text-orange-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Manolo Fortich Terminal ↔ Agora Terminal"
                      value={busFormData.route}
                      onChange={(e) => setBusFormData({ ...busFormData, route: e.target.value })}
                      className="w-full bg-white/5 border border-white/15 rounded-xl px-3.5 py-2.5 text-white text-sm focus:outline-none focus:border-orange-500 transition-colors"
                    />
                  </div>
                </div>

                {/* Right: Capacity, Status & Staff Assignment */}
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-white/70 text-xs font-semibold uppercase tracking-wider block mb-1">
                        Seat Capacity
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={100}
                        required
                        value={busFormData.seat_capacity}
                        onChange={(e) => setBusFormData({ ...busFormData, seat_capacity: parseInt(e.target.value, 10) || 35 })}
                        className="w-full bg-white/5 border border-white/15 rounded-xl px-3.5 py-2.5 text-white text-sm focus:outline-none focus:border-orange-500 transition-colors"
                      />
                    </div>

                    <div>
                      <label className="text-white/70 text-xs font-semibold uppercase tracking-wider block mb-1">
                        Status
                      </label>
                      <select
                        value={busFormData.status}
                        onChange={(e) => setBusFormData({ ...busFormData, status: e.target.value })}
                        className="w-full bg-gray-800 border border-white/15 rounded-xl px-3.5 py-2.5 text-white text-sm focus:outline-none focus:border-orange-500 cursor-pointer"
                      >
                        <option value="active">Active</option>
                        <option value="maintenance">Maintenance</option>
                        <option value="inactive">Inactive</option>
                      </select>
                    </div>
                  </div>

                  <div className="bg-white/5 p-4 rounded-xl border border-white/10 space-y-3">
                    <p className="text-white text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5 text-orange-400">
                      <User size={14} />
                      Staff Assignments
                    </p>

                    <div>
                      <label className="text-white/60 text-xs block mb-1">Assigned Driver</label>
                      <select
                        value={busFormData.driver_id}
                        onChange={(e) => setBusFormData({ ...busFormData, driver_id: e.target.value })}
                        className="w-full bg-gray-800 border border-white/15 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-orange-500 cursor-pointer"
                      >
                        <option value="">No Driver Assigned</option>
                        {drivers.map(driver => (
                          <option key={driver.id} value={driver.id}>
                            {driver.full_name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-white/60 text-xs block mb-1">Assigned Conductor</label>
                      <select
                        value={busFormData.conductor_id}
                        onChange={(e) => setBusFormData({ ...busFormData, conductor_id: e.target.value })}
                        className="w-full bg-gray-800 border border-white/15 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-orange-500 cursor-pointer"
                      >
                        <option value="">No Conductor Assigned</option>
                        {conductors.map(conductor => (
                          <option key={conductor.id} value={conductor.id}>
                            {conductor.full_name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddBusModal(false);
                    setEditingBus(null);
                  }}
                  className="px-4 py-2 rounded-xl text-white/70 hover:text-white hover:bg-white/10 transition-colors text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busSaving}
                  className="px-5 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-all shadow-lg shadow-orange-500/20 flex items-center gap-1.5"
                >
                  {busSaving && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  <span>{editingBus ? 'Update Bus' : 'Add Bus to Fleet'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL 2: COMPREHENSIVE TRIP DETAILS & VIDEO PLAYBACK ────────────── */}
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

            {/* Modal Content */}
            <div className="p-4 sm:p-6 overflow-y-auto space-y-6 max-h-[calc(92vh-80px)]">
              {detailsLoading ? (
                <div className="text-center py-16">
                  <div className="w-10 h-10 border-3 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                  <p className="text-white/70 text-sm">Loading trip video recordings and telemetry...</p>
                </div>
              ) : (
                <>
                  {/* Video Section: Player + Segments List */}
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

                  {/* Trip Telemetry & Operations Breakdown */}
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
                        <p className="text-white/50 text-[11px]">Driver</p>
                        <p className="text-white font-medium mt-0.5">{selectedTrip.driver?.full_name || 'Unassigned'}</p>
                      </div>
                      <div className="bg-white/5 p-3 rounded-lg">
                        <p className="text-white/50 text-[11px]">Conductor</p>
                        <p className="text-white font-medium mt-0.5">{selectedTrip.conductor?.full_name || 'Unassigned'}</p>
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

                  {/* Transactions, Irregularities & Alerts */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
