import { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { AlertTriangle, Users, Video, Activity, Clock, ChevronLeft, ChevronRight, ArrowUpDown, CheckCircle, XCircle, Filter, RefreshCw, Wifi, Maximize2 } from 'lucide-react';
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
  const [irregularitiesPage, setIrregularitiesPage] = useState(0);
  const itemsPerPage = 5;
  const irregularitiesPerPage = 5;

  // Backend video streaming
  const {
    isStreaming: videoStreaming,
    passengerCount: videoPassengerCount,
    connectionStatus: videoConnectionStatus,
    connectionMessage: videoConnectionMessage,
    videoRef,
    refresh: videoRefresh,
  } = useBackendVideo({ autoConnect: true });

  const videoContainerRef = useRef<HTMLDivElement>(null);
  const toggleFullscreen = () => {
    if (!videoContainerRef.current) return;
    if (!document.fullscreenElement) {
      videoContainerRef.current.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  const totalPages = Math.ceil(
    detectionHistory.filter(item => {
      if (filterType === 'all') return true;
      return item.type === filterType;
    }).length / itemsPerPage
  );

  const goToPage = (page: number) => setCurrentPage(page);
  const nextPage = () => setCurrentPage(prev => Math.min(prev + 1, totalPages - 1));
  const prevPage = () => setCurrentPage(prev => Math.max(prev - 1, 0));

  useEffect(() => {
    fetchStats();

    const irregularitySubscription = supabase
      .channel('ai-irregularity-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fare_irregularities' }, fetchStats)
      .subscribe();

    const passengerSubscription = supabase
      .channel('ai-passenger-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'boarded_passengers' }, fetchStats)
      .subscribe();

    return () => {
      irregularitySubscription.unsubscribe();
      passengerSubscription.unsubscribe();
    };
  }, []);

  const fetchStats = async () => {
    try {
      const [{ count: irregularityCount }, { data: passengerData }, { data: irregularitiesData }] = await Promise.all([
        supabase
          .from('fare_irregularities')
          .select('*', { count: 'exact', head: true })
          .eq('resolved', false),
        supabase
          .from('boarded_passengers')
          .select('boarded_at, trip_id')
          .order('boarded_at', { ascending: false })
          .limit(100),
        supabase
          .from('fare_irregularities')
          .select('*')
          .order('detected_at', { ascending: false })
          .limit(50)
      ]);

      setUnresolvedCount(irregularityCount || 0);

      const total = (passengerData || []).length;
      setTotalPassengers(total);

      // Fetch trips and buses for passenger counts
      let passengerDataWithBus = passengerData || [];
      if (passengerData && passengerData.length > 0) {
        const tripIds = passengerData.map(pc => pc.trip_id).filter(Boolean);
        const { data: trips } = await supabase
          .from('trips')
          .select('id, bus_id')
          .in('id', tripIds);
        const tripsMap = new Map((trips || []).map(t => [t.id, t]));

        const busIds = (trips || []).map(t => t.bus_id).filter(Boolean);
        const { data: buses } = await supabase
          .from('buses')
          .select('id, bus_number, plate_number')
          .in('id', busIds);
        const busesMap = new Map((buses || []).map(b => [b.id, b]));

        passengerDataWithBus = passengerData.map(pc => {
          const trip = tripsMap.get(pc.trip_id);
          const bus = trip ? busesMap.get(trip.bus_id) : null;
          return {
            ...pc,
            trips: trip ? { ...trip, buses: bus } : null
          };
        });
      }

      // Fetch trips and buses for irregularities
      let irregularitiesDataWithBus = irregularitiesData || [];
      if (irregularitiesData && irregularitiesData.length > 0) {
        const tripIds = irregularitiesData.map(irr => irr.trip_id).filter(Boolean);
        const { data: trips } = await supabase
          .from('trips')
          .select('id, bus_id')
          .in('id', tripIds);
        const tripsMap = new Map((trips || []).map(t => [t.id, t]));

        const busIds = (trips || []).map(t => t.bus_id).filter(Boolean);
        const { data: buses } = await supabase
          .from('buses')
          .select('id, bus_number, plate_number')
          .in('id', busIds);
        const busesMap = new Map((buses || []).map(b => [b.id, b]));

        irregularitiesDataWithBus = irregularitiesData.map(irr => {
          const trip = tripsMap.get(irr.trip_id);
          const bus = trip ? busesMap.get(trip.bus_id) : null;
          return {
            ...irr,
            trips: trip ? { ...trip, buses: bus } : null
          };
        });
      }

      setPassengerCounts(passengerDataWithBus);
      setIrregularities(irregularitiesDataWithBus);

      // Build detection history from actual data
      const history: DetectionEvent[] = [];

      // Add passenger count events
      (passengerDataWithBus || []).forEach((pc: any) => {
        const minutesAgo = Math.floor((Date.now() - new Date(pc.recorded_at).getTime()) / 60000);
        const busNumber = pc.trips?.buses?.bus_number || pc.trips?.buses?.plate_number || 'Unknown';
        history.push({
          id: `pc-${pc.id}`,
          bus: busNumber,
          event: `Passenger boarded`,
          time: minutesAgo < 1 ? 'Just now' : `${minutesAgo} min ago`,
          timeValue: minutesAgo,
          type: 'passenger',
          tripId: pc.trip_id
        });
      });

      // Add irregularity events
      (irregularitiesDataWithBus || []).forEach((irr: any) => {
        const minutesAgo = Math.floor((Date.now() - new Date(irr.detected_at).getTime()) / 60000);
        const busNumber = irr.trips?.buses?.bus_number || irr.trips?.buses?.plate_number || 'Unknown';
        history.push({
          id: irr.id,
          bus: busNumber,
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

      // Set all history data
      setDetectionHistory(sortedHistory);
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

      {/* Live AI Video Feed - Split Pane Widget */}
      <div className="glass-card overflow-hidden border border-white/10 rounded-2xl shadow-2xl">
        {/* Split Pane Header */}
        <div className="px-5 py-3.5 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
          <div className="flex items-center gap-2">
            <Video className="text-orange-400" size={18} />
            <h2 className="text-base lg:text-lg font-bold text-white tracking-wide">Live AI Video Feed</h2>
            <span className="text-[11px] font-mono text-white/40 hidden sm:inline">• Bus #1 Real-time Stream</span>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-xs">
              <div className={`w-2 h-2 rounded-full ${videoStreaming ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
              <span className="text-white/80 capitalize font-medium">{videoStreaming ? 'Connected' : videoConnectionStatus}</span>
            </div>
            <button
              onClick={videoRefresh}
              className="bg-white/10 hover:bg-white/20 text-white p-1.5 rounded-lg transition-colors border border-white/10"
              title="Refresh feed"
            >
              <RefreshCw size={13} />
            </button>
          </div>
        </div>

        {/* Split Pane Body (Left: Compact Video Stream, Right: AI Telematics Grid) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-white/10 items-stretch">
          {/* Left Pane: Compact 4:3 Live Camera Stream */}
          <div className="lg:col-span-5 p-3.5 sm:p-4 flex flex-col justify-center items-center bg-black/30">
            <div
              ref={videoContainerRef}
              className="relative w-full max-w-[420px] aspect-[4/3] max-h-[315px] bg-gradient-to-b from-zinc-950 via-black to-zinc-950 rounded-xl overflow-hidden border border-white/15 shadow-xl flex items-center justify-center group"
            >
              <img
                ref={videoRef}
                alt="Live AI video feed"
                className={`w-full h-full object-cover transition-opacity duration-300 ${
                  videoStreaming ? 'opacity-100 block' : 'opacity-0 hidden'
                }`}
              />

              {!videoStreaming && (
                <div className="absolute inset-0 flex items-center justify-center p-6 bg-gradient-to-b from-black/80 via-black/90 to-black/95">
                  <div className="text-center max-w-sm">
                    <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-2 shadow-inner">
                      {videoConnectionStatus === 'connecting' ? (
                        <RefreshCw className="w-6 h-6 text-orange-400 animate-spin" />
                      ) : (
                        <Video className="w-6 h-6 text-white/30" />
                      )}
                    </div>
                    <p className="text-white font-semibold text-xs sm:text-sm mb-0.5">
                      {videoConnectionStatus === 'connecting' ? 'Connecting to camera…' : 'Camera Stream Offline'}
                    </p>
                    <p className="text-white/40 text-[10px] sm:text-[11px] mb-2.5 leading-relaxed">
                      {videoConnectionMessage || 'Waiting for live frames from Raspberry Pi camera.'}
                    </p>
                    <button
                      onClick={videoRefresh}
                      className="px-3 py-1 bg-orange-500/20 hover:bg-orange-500/30 text-orange-300 border border-orange-500/30 rounded-xl text-xs font-medium transition-all flex items-center gap-1.5 mx-auto active:scale-95"
                    >
                      <RefreshCw size={11} />
                      Reconnect Feed
                    </button>
                  </div>
                </div>
              )}

              {/* Top HUD Overlay */}
              <div className="absolute top-2 inset-x-2 flex items-center justify-between pointer-events-none z-10">
                <div className="flex items-center gap-1.5">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold backdrop-blur-md flex items-center gap-1 shadow-lg border ${
                    videoStreaming
                      ? 'bg-red-500/85 text-white border-red-400/40'
                      : 'bg-black/70 text-white/60 border-white/10'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${videoStreaming ? 'bg-white animate-pulse' : 'bg-red-400'}`} />
                    {videoStreaming ? 'LIVE' : 'OFFLINE'}
                  </span>
                  <span className="bg-black/70 backdrop-blur-md border border-white/10 text-white/90 text-[10px] px-2 py-0.5 rounded-full font-medium shadow-md">
                    Bus #1 • Real-time AI
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="bg-black/70 backdrop-blur-md border border-white/10 text-white text-[10px] px-2 py-0.5 rounded-full font-bold flex items-center gap-1 shadow-lg">
                    <Users size={11} className="text-orange-400" />
                    <span>{videoPassengerCount} Detected</span>
                  </span>
                  <button
                    onClick={toggleFullscreen}
                    className="pointer-events-auto bg-black/70 hover:bg-black/90 backdrop-blur-md border border-white/10 text-white/80 hover:text-white p-1 rounded-full transition-all"
                    title="Fullscreen"
                  >
                    <Maximize2 size={11} />
                  </button>
                </div>
              </div>

              {/* Bottom HUD Overlay */}
              <div className="absolute bottom-2 inset-x-2 flex items-center justify-between pointer-events-none z-10 text-[9px] sm:text-[10px] text-white/80">
                <div className="bg-black/70 backdrop-blur-md border border-white/10 px-2 py-0.5 rounded-full flex items-center gap-1 shadow-md">
                  <Activity size={10} className="text-emerald-400" />
                  <span className="font-mono">AI: YOLOv8n</span>
                  <span className="text-white/40">•</span>
                  <span className="text-white/60">640×480 (4:3)</span>
                </div>
                <div className="bg-black/70 backdrop-blur-md border border-white/10 px-2 py-0.5 rounded-full flex items-center gap-1 shadow-md">
                  <Wifi size={10} className={videoStreaming ? 'text-green-400' : 'text-white/40'} />
                  <span className="font-medium capitalize">{videoStreaming ? '30 FPS' : videoConnectionStatus}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Pane: Compact AI Telematics & Controls */}
          <div className="lg:col-span-7 p-3.5 sm:p-4 lg:p-5 flex flex-col justify-center gap-3 bg-white/[0.01]">
            {/* Row 1: AI Passenger Counter Hero + Detection Pipeline */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Passenger Counter Card */}
              <div className="glass-card p-3 sm:p-3.5 rounded-xl border border-white/10 flex flex-col justify-between min-h-[105px]">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <Users size={14} className="text-orange-400" />
                    <span className="text-white/70 text-xs font-semibold uppercase tracking-wider">AI Passenger Counter</span>
                  </div>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Real-time
                  </span>
                </div>

                <div className="flex items-baseline justify-between mb-1.5">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">{videoPassengerCount}</span>
                    <span className="text-white/50 text-xs font-medium">passenger{videoPassengerCount === 1 ? '' : 's'} on board</span>
                  </div>
                  <span className="text-[11px] text-white/50 font-medium">
                    {30 - videoPassengerCount} seats left
                  </span>
                </div>

                <div className="w-full bg-white/10 h-2 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-orange-400 transition-all duration-500"
                    style={{ width: `${Math.min(100, (videoPassengerCount / 30) * 100)}%` }}
                  />
                </div>
              </div>

              {/* Detection Pipeline Info Card */}
              <div className="glass-card p-3 sm:p-3.5 rounded-xl border border-white/10 flex flex-col justify-between min-h-[105px]">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <Activity size={14} className="text-blue-400" />
                    <span className="text-white/70 text-xs font-semibold uppercase tracking-wider">Detection Pipeline</span>
                  </div>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                    Real-time
                  </span>
                </div>
                <div>
                  <div className="text-white font-semibold text-xs sm:text-sm">YOLOv8 Nano Neural Net</div>
                  <div className="text-white/50 text-[11px] mt-0.5">Automated Bounding & Occupancy Tally</div>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-white/60 pt-1 border-t border-white/5">
                  <span className="text-emerald-400 font-medium">Conf &gt; 0.50</span>
                  <span>•</span>
                  <span>30 FPS</span>
                  <span>•</span>
                  <span>640×480 (4:3)</span>
                </div>
              </div>
            </div>

            {/* Row 2: 4 AI Specs Grid in a Row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-2.5">
              <div className="glass-card p-2.5 rounded-xl border border-white/10 flex flex-col justify-between min-h-[64px]">
                <div className="flex items-center gap-1.5 text-white/50 text-[11px] mb-0.5">
                  <Activity size={12} className="text-blue-400 shrink-0" />
                  <span className="truncate">Detection Model</span>
                </div>
                <div>
                  <div className="text-white font-semibold text-xs sm:text-sm truncate">YOLOv8n ONNX</div>
                  <div className="text-emerald-400 text-[10px] mt-0.5 truncate">Confidence &gt; 0.50</div>
                </div>
              </div>

              <div className="glass-card p-2.5 rounded-xl border border-white/10 flex flex-col justify-between min-h-[64px]">
                <div className="flex items-center gap-1.5 text-white/50 text-[11px] mb-0.5">
                  <Video size={12} className="text-purple-400 shrink-0" />
                  <span className="truncate">Aspect & Res</span>
                </div>
                <div>
                  <div className="text-white font-semibold text-xs sm:text-sm truncate">640×480 (4:3)</div>
                  <div className="text-white/50 text-[10px] mt-0.5 truncate">Zero Pillarbox</div>
                </div>
              </div>

              <div className="glass-card p-2.5 rounded-xl border border-white/10 flex flex-col justify-between min-h-[64px]">
                <div className="flex items-center gap-1.5 text-white/50 text-[11px] mb-0.5">
                  <Clock size={12} className="text-green-400 shrink-0" />
                  <span className="truncate">Inference Time</span>
                </div>
                <div>
                  <div className="text-white font-semibold text-xs sm:text-sm truncate">~28 ms / frame</div>
                  <div className="text-white/50 text-[10px] mt-0.5 truncate">Real-time Stream</div>
                </div>
              </div>

              <div className="glass-card p-2.5 rounded-xl border border-white/10 flex flex-col justify-between min-h-[64px]">
                <div className="flex items-center gap-1.5 text-white/50 text-[11px] mb-0.5">
                  <CheckCircle size={12} className="text-orange-400 shrink-0" />
                  <span className="truncate">Feed Pipeline</span>
                </div>
                <div>
                  <div className="text-white font-semibold text-xs sm:text-sm capitalize truncate">{videoStreaming ? 'Streaming' : videoConnectionStatus}</div>
                  <div className="text-white/50 text-[10px] mt-0.5 truncate">Cloudflare Tunnel</div>
                </div>
              </div>
            </div>
          </div>
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
            {irregularities
              .filter(irr => !irr.resolved)
              .slice(irregularitiesPage * irregularitiesPerPage, (irregularitiesPage + 1) * irregularitiesPerPage)
              .map((irr) => (
              <div key={irr.id} className="bg-red-500/10 rounded-lg p-2 lg:p-3 border border-red-500/30">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <span className="text-white font-medium text-xs">{irr.description || 'Fare irregularity detected'}</span>
                      <span className="text-white/60 text-[10px]">Trip ID: {irr.trip_id?.slice(0, 8) || 'Unknown'}...</span>
                    </div>
                    <p className="text-white/60 text-[10px]">
                      Detected: {new Date(irr.detected_at).toLocaleString()}
                    </p>
                  </div>
                  <button
                    onClick={() => resolveIrregularity(irr.id)}
                    className="ml-2 lg:ml-4 px-2 py-1 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded-lg text-xs font-medium transition-colors flex items-center gap-1"
                  >
                    <CheckCircle size={12} />
                    Resolve
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {irregularities.filter(irr => !irr.resolved).length > 0 && (
            <div className="flex items-center justify-between pt-4 border-t border-white/10 mt-4">
              <span className="text-white/60 text-xs">
                Showing {irregularitiesPage * irregularitiesPerPage + 1} to {Math.min((irregularitiesPage + 1) * irregularitiesPerPage, irregularities.filter(irr => !irr.resolved).length)} of {irregularities.filter(irr => !irr.resolved).length}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIrregularitiesPage(Math.max(0, irregularitiesPage - 1))}
                  disabled={irregularitiesPage === 0}
                  className="p-2 rounded-lg bg-white/10 text-white/60 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="text-white/60 text-xs">
                  Page {irregularitiesPage + 1} of {Math.ceil(irregularities.filter(irr => !irr.resolved).length / irregularitiesPerPage)}
                </span>
                <button
                  onClick={() => setIrregularitiesPage(Math.min(Math.ceil(irregularities.filter(irr => !irr.resolved).length / irregularitiesPerPage) - 1, irregularitiesPage + 1))}
                  disabled={irregularitiesPage === Math.ceil(irregularities.filter(irr => !irr.resolved).length / irregularitiesPerPage) - 1}
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
