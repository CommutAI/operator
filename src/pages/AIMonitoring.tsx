import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { AlertTriangle, Users, Video, Activity, Clock, ChevronLeft, ChevronRight, ArrowUpDown, CheckCircle, XCircle, Filter } from 'lucide-react';
import { useBackendVideo } from '../hooks/useBackendVideo';

interface DetectionEvent {
  id: string;
  bus: string;
  event: string;
  time: string;
  timeValue: number;
  type: 'irregularity' | 'passenger';
  tripId?: string;
  resolved?: boolean;
}

interface Irregularity {
  id: string;
  description: string;
  detected_at: string;
  trip_id: string;
  resolved: boolean;
  resolved_at?: string;
  buses?: {
    plate_number: string;
    route: string;
  };
}

export default function AIMonitoring() {
  const [unresolvedCount, setUnresolvedCount] = useState(0);
  const [totalPassengers, setTotalPassengers] = useState(0);
  const [detectionHistory, setDetectionHistory] = useState<DetectionEvent[]>([]);
  const [historyCount, setHistoryCount] = useState(0);
  const [sortBy, setSortBy] = useState<'time' | 'bus' | 'event'>('time');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [filterType, setFilterType] = useState<'all' | 'irregularity' | 'passenger'>('all');
  const [irregularities, setIrregularities] = useState<Irregularity[]>([]);
  const [passengerCounts, setPassengerCounts] = useState<any[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const itemsPerPage = 5;

  // Backend video streaming
  const {
    isStreaming: videoStreaming,
    passengerCount: videoPassengerCount,
    connectionStatus: videoConnectionStatus,
    videoRef,
    refresh: videoRefresh,
  } = useBackendVideo({ autoConnect: false });

  const totalPages = Math.ceil(
    detectionHistory.filter(item => {
      if (filterType === 'all') return true;
      return item.type === filterType;
    }).length / itemsPerPage
  );

  const goToPage = (page: number) => setCurrentPage(page);
  const nextPage = () => setCurrentPage(prev => Math.min(prev + 1, totalPages - 1));
  const prevPage = () => setCurrentPage(prev => Math.max(prev - 1, 0));

  const getRange = () => ({
    from: currentPage * itemsPerPage,
    to: Math.min((currentPage + 1) * itemsPerPage - 1, historyCount - 1)
  });

  useEffect(() => {
    fetchStats();

    const irregularitySubscription = supabase
      .channel('ai-irregularity-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fare_irregularities' }, fetchStats)
      .subscribe();

    const passengerSubscription = supabase
      .channel('ai-passenger-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'passenger_counts' }, fetchStats)
      .subscribe();

    return () => {
      irregularitySubscription.unsubscribe();
      passengerSubscription.unsubscribe();
    };
  }, [currentPage]);

  const fetchStats = async () => {
    try {
      const [{ count: irregularityCount }, { data: passengerData }, { data: irregularitiesData }] = await Promise.all([
        supabase
          .from('fare_irregularities')
          .select('*', { count: 'exact', head: true })
          .eq('resolved', false),
        supabase
          .from('passenger_counts')
          .select('count, recorded_at, trip_id, trips(*)')
          .order('recorded_at', { ascending: false })
          .limit(100),
        supabase
          .from('fare_irregularities')
          .select('*, trips(*, buses(*))')
          .order('detected_at', { ascending: false })
          .limit(50)
      ]);

      setUnresolvedCount(irregularityCount || 0);

      const total = (passengerData || []).reduce((sum: number, pc: any) => sum + (pc.count || 0), 0);
      setTotalPassengers(total);

      setPassengerCounts(passengerData || []);
      setIrregularities(irregularitiesData || []);

      // Build detection history from actual data
      const history: DetectionEvent[] = [];

      // Add passenger count events
      (passengerData || []).forEach((pc: any) => {
        const minutesAgo = Math.floor((Date.now() - new Date(pc.recorded_at).getTime()) / 60000);
        history.push({
          id: `pc-${pc.id}`,
          bus: pc.trips?.buses?.plate_number || 'Unknown',
          event: `Detected ${pc.count} passengers`,
          time: minutesAgo < 1 ? 'Just now' : `${minutesAgo} min ago`,
          timeValue: minutesAgo,
          type: 'passenger',
          tripId: pc.trip_id
        });
      });

      // Add irregularity events
      (irregularitiesData || []).forEach((irr: any) => {
        const minutesAgo = Math.floor((Date.now() - new Date(irr.detected_at).getTime()) / 60000);
        history.push({
          id: irr.id,
          bus: irr.trips?.buses?.plate_number || 'Unknown',
          event: `Fare irregularity: ${irr.description || 'Unknown'}`,
          time: minutesAgo < 1 ? 'Just now' : `${minutesAgo} min ago`,
          timeValue: minutesAgo,
          type: 'irregularity',
          tripId: irr.trip_id,
          resolved: irr.resolved
        });
      });

      // Sort by time
      const sortedHistory = history.sort((a, b) => a.timeValue - b.timeValue);

      // Set total count
      setHistoryCount(sortedHistory.length);

      // Apply pagination
      const { from, to } = getRange();
      setDetectionHistory(sortedHistory.slice(from, to + 1));
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const sortedHistory = [...detectionHistory].sort((a, b) => {
    let comparison = 0;

    if (sortBy === 'time') {
      comparison = a.timeValue - b.timeValue;
    } else if (sortBy === 'bus') {
      comparison = a.bus.localeCompare(b.bus);
    } else if (sortBy === 'event') {
      comparison = a.event.localeCompare(b.event);
    }

    return sortOrder === 'asc' ? comparison : -comparison;
  });

  const filteredAndSortedHistory = sortedHistory.filter(item => {
    if (filterType === 'all') return true;
    return item.type === filterType;
  });

  const handleSort = (field: 'time' | 'bus' | 'event') => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
    goToPage(0);
  };

  const handleFilterChange = (type: 'all' | 'irregularity' | 'passenger') => {
    setFilterType(type);
    setCurrentPage(0);
  };

  const resolveIrregularity = async (id: string) => {
    try {
      const { error } = await supabase
        .from('fare_irregularities')
        .update({ resolved: true, resolved_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;

      // Refresh data
      await fetchStats();
    } catch (error) {
      console.error('Error resolving irregularity:', error);
    }
  };

  const paginatedHistory = filteredAndSortedHistory.slice(
    currentPage * itemsPerPage,
    (currentPage + 1) * itemsPerPage
  );

  const filteredTotalPages = Math.ceil(filteredAndSortedHistory.length / itemsPerPage);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">AI Monitoring</h1>
          <p className="text-white/60">Real-time AI-powered fare irregularities and passenger detection</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-white/60">
          <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          <span>Live</span>
        </div>
      </div>

      {/* Hero Metrics - 3 Key Highlights */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Video Monitoring - Highlighted */}
        <div className="glass-card p-4 border-2 border-orange-500/30 bg-gradient-to-br from-orange-500/10 to-transparent">
          <div className="flex items-center justify-between mb-3">
            <div className="p-3 rounded-xl bg-orange-500/20">
              <Video className="text-orange-400" size={24} />
            </div>
            <div className="flex items-center gap-2 text-white/60 text-xs">
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span>Live</span>
            </div>
          </div>
          <h3 className="text-white/70 text-xs mb-1">Video Monitoring</h3>
          <p className="text-white text-2xl font-bold mb-1">Active</p>
          <p className="text-white/50 text-xs">YOLO-powered detection</p>
        </div>

        {/* Passenger Count - Highlighted */}
        <div className="glass-card p-4 border-2 border-blue-500/30 bg-gradient-to-br from-blue-500/10 to-transparent">
          <div className="flex items-center justify-between mb-3">
            <div className="p-3 rounded-xl bg-blue-500/20">
              <Users className="text-blue-400" size={24} />
            </div>
            <div className="text-right">
              <p className="text-green-400 text-xs font-medium">+12%</p>
            </div>
          </div>
          <h3 className="text-white/70 text-xs mb-1">Total Passengers</h3>
          <p className="text-white text-2xl font-bold mb-1">{totalPassengers}</p>
          <p className="text-white/50 text-xs">QR scans verified</p>
        </div>

        {/* Irregularities - Highlighted */}
        <div className={`glass-card p-4 border-2 ${unresolvedCount > 0 ? 'border-red-500/30 bg-gradient-to-br from-red-500/10 to-transparent' : 'border-green-500/30 bg-gradient-to-br from-green-500/10 to-transparent'}`}>
          <div className="flex items-center justify-between mb-3">
            <div className={`p-3 rounded-xl ${unresolvedCount > 0 ? 'bg-red-500/20' : 'bg-green-500/20'}`}>
              <AlertTriangle className={unresolvedCount > 0 ? 'text-red-400' : 'text-green-400'} size={24} />
            </div>
            <div className="text-right">
              <p className={`${unresolvedCount > 0 ? 'text-red-400' : 'text-green-400'} text-xs font-medium`}>
                {unresolvedCount > 0 ? '⚠️' : '✓'}
              </p>
            </div>
          </div>
          <h3 className="text-white/70 text-xs mb-1">Active Irregularities</h3>
          <p className={`text-white text-2xl font-bold mb-1 ${unresolvedCount > 0 ? 'text-red-400' : 'text-green-400'}`}>{unresolvedCount}</p>
          <p className="text-white/50 text-xs">AI-detected issues</p>
        </div>
      </div>

      {/* Video Monitoring Section - Compact */}
      <div className="glass-card p-4 border-2 border-orange-500/20">
        <div className="flex items-center justify-between mb-2">
          <div className="text-white/60 text-sm">Video Feed</div>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${videoStreaming ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
            <span className="text-white/60 text-xs">{videoConnectionStatus}</span>
          </div>
        </div>
        <div className="relative bg-black rounded-lg h-64 overflow-hidden">
          <img
            ref={videoRef}
            alt="Live video feed"
            className={`absolute inset-0 w-full h-full object-contain ${videoStreaming ? 'block' : 'hidden'}`}
          />
          {!videoStreaming && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <Video className="text-white/30 mx-auto mb-2" size={32} />
                <p className="text-white/40 text-sm">
                  {videoConnectionStatus === 'connecting' ? 'Connecting to backend...' : 'Video feed unavailable'}
                </p>
                <button
                  onClick={videoRefresh}
                  className="mt-3 px-3 py-1 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs transition-colors"
                >
                  Refresh
                </button>
              </div>
            </div>
          )}
          {videoStreaming && (
            <div className="absolute top-2 left-2 bg-black/70 backdrop-blur-sm rounded-lg px-2 py-1 flex items-center gap-2">
              <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              <span className="text-white text-xs font-medium">LIVE</span>
            </div>
          )}
          {videoStreaming && (
            <div className="absolute top-2 right-2 bg-black/70 backdrop-blur-sm rounded-lg px-2 py-1">
              <div className="flex items-center gap-1">
                <Users size={12} className="text-orange-400" />
                <span className="text-white text-xs font-bold">{videoPassengerCount}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Detection History */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-white flex items-center gap-3">
            <Activity className="text-orange-400" size={20} />
            Detection History
          </h2>
          <div className="flex items-center gap-2">
            <Filter size={16} className="text-white/60" />
            <div className="flex gap-1">
              <button
                onClick={() => handleFilterChange('all')}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                  filterType === 'all' ? 'bg-orange-500 text-white' : 'bg-white/10 text-white/60 hover:bg-white/20'
                }`}
              >
                All
              </button>
              <button
                onClick={() => handleFilterChange('irregularity')}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                  filterType === 'irregularity' ? 'bg-orange-500 text-white' : 'bg-white/10 text-white/60 hover:bg-white/20'
                }`}
              >
                Irregularities
              </button>
              <button
                onClick={() => handleFilterChange('passenger')}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                  filterType === 'passenger' ? 'bg-orange-500 text-white' : 'bg-white/10 text-white/60 hover:bg-white/20'
                }`}
              >
                Passengers
              </button>
            </div>
          </div>
        </div>

        {/* Sortable Headers */}
        <div className="flex items-center gap-4 px-4 py-2 border-b border-white/10 mb-2">
          <button
            onClick={() => handleSort('bus')}
            className={`flex items-center gap-2 text-xs font-medium transition-colors ${
              sortBy === 'bus' ? 'text-orange-400' : 'text-white/60 hover:text-white'
            }`}
          >
            Bus
            {sortBy === 'bus' && <ArrowUpDown size={12} />}
          </button>
          <button
            onClick={() => handleSort('event')}
            className={`flex items-center gap-2 text-xs font-medium transition-colors ${
              sortBy === 'event' ? 'text-orange-400' : 'text-white/60 hover:text-white'
            }`}
          >
            Event
            {sortBy === 'event' && <ArrowUpDown size={12} />}
          </button>
          <button
            onClick={() => handleSort('time')}
            className={`flex items-center gap-2 text-xs font-medium transition-colors ${
              sortBy === 'time' ? 'text-orange-400' : 'text-white/60 hover:text-white'
            }`}
          >
            Time
            {sortBy === 'time' && <ArrowUpDown size={12} />}
          </button>
        </div>

        {/* List */}
        <div className="space-y-1 mb-4">
          {paginatedHistory.length > 0 ? (
            paginatedHistory.map((item) => (
              <div key={item.id} className={`flex items-center justify-between py-3 px-4 hover:bg-white/5 rounded-lg transition-colors border-b border-white/5 last:border-0 ${
                item.type === 'irregularity' && !item.resolved ? 'bg-red-500/5' : ''
              }`}>
                <div className="flex items-center gap-4">
                  <div className={`p-2 rounded-lg ${item.type === 'irregularity' ? 'bg-red-500/20' : 'bg-blue-500/20'}`}>
                    {item.type === 'irregularity' ? (
                      <AlertTriangle size={16} className={item.resolved ? 'text-green-400' : 'text-red-400'} />
                    ) : (
                      <Users size={16} className="text-blue-400" />
                    )}
                  </div>
                  <div>
                    <span className="text-white font-medium text-sm">Bus #{item.bus}</span>
                    <p className="text-white/70 text-sm">{item.event}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1 text-white/60 text-xs">
                    <Clock size={12} />
                    <span>{item.time}</span>
                  </div>
                  {item.type === 'irregularity' && !item.resolved && (
                    <button
                      onClick={() => resolveIrregularity(item.id)}
                      className="p-2 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded-lg transition-colors"
                      title="Mark as resolved"
                    >
                      <CheckCircle size={16} />
                    </button>
                  )}
                  {item.type === 'irregularity' && item.resolved && (
                    <div className="flex items-center gap-1 text-green-400 text-xs">
                      <CheckCircle size={12} />
                      <span>Resolved</span>
                    </div>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-8">
              <Activity className="text-white/20 mx-auto mb-3" size={48} />
              <p className="text-white/40">No detection events found</p>
            </div>
          )}
        </div>

        {/* Pagination */}
        {filteredTotalPages > 1 && (
          <div className="flex items-center justify-between pt-4 border-t border-white/10">
            <span className="text-white/60 text-xs">
              Showing {currentPage * itemsPerPage + 1} to {Math.min((currentPage + 1) * itemsPerPage, filteredAndSortedHistory.length)} of {filteredAndSortedHistory.length} events
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={prevPage}
                disabled={currentPage === 0}
                className="p-2 rounded-lg bg-white/10 text-white/60 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-white/60 text-xs">
                Page {currentPage + 1} of {filteredTotalPages}
              </span>
              <button
                onClick={nextPage}
                disabled={currentPage === filteredTotalPages - 1}
                className="p-2 rounded-lg bg-white/10 text-white/60 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Active Irregularities List */}
      {irregularities.filter(irr => !irr.resolved).length > 0 && (
        <div className="glass-card p-6 border-l-4 border-red-500">
          <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-3">
            <AlertTriangle className="text-red-400" size={20} />
            Active Irregularities
          </h2>
          <div className="space-y-3">
            {irregularities.filter(irr => !irr.resolved).map((irr) => (
              <div key={irr.id} className="bg-red-500/10 rounded-lg p-4 border border-red-500/30">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-white font-medium">{irr.description || 'Fare irregularity detected'}</span>
                      <span className="text-white/60 text-xs">Bus: {irr.buses?.plate_number || 'Unknown'}</span>
                    </div>
                    <p className="text-white/60 text-xs">
                      Detected: {new Date(irr.detected_at).toLocaleString()}
                    </p>
                  </div>
                  <button
                    onClick={() => resolveIrregularity(irr.id)}
                    className="ml-4 px-3 py-1 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded-lg text-sm font-medium transition-colors flex items-center gap-1"
                  >
                    <CheckCircle size={14} />
                    Resolve
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
