import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Video, Users, AlertCircle, WifiOff, RefreshCw, Tv2, Activity, CheckCircle, Loader2, ChevronRight, X, Search, Filter, AlertTriangle, Bus, Camera, Clock } from 'lucide-react';
import { useRaspberryPi } from '../hooks/useRaspberryPi';
import { getPiVideoFeedUrl } from '../services/raspberryPiApi';

interface FareIrregularity {
  id: string;
  type: string;
  bus_number: number;
  route: string;
  conductor_name: string;
  detected_at: string;
  resolved: boolean;
  resolved_at?: string;
  description?: string;
}

interface PassengerCount {
  id: string;
  trip_id: string;
  bus_number: number;
  route: string;
  count: number;
  ai_count: number;
  recorded_at: string;
}

// Connection stages and their progress %
const CONNECTION_STAGES: Record<string, { pct: number; label: string; color: string }> = {
  disconnected: { pct: 0,   label: 'Disconnected',        color: 'bg-red-500'    },
  connecting:   { pct: 20,  label: 'Checking Pi…',        color: 'bg-yellow-400' },
  offline:      { pct: 0,   label: 'Pi offline',          color: 'bg-red-500'    },
  connected:    { pct: 70,  label: 'Starting stream…',    color: 'bg-blue-400'   },
  streaming:    { pct: 100, label: 'Streaming',            color: 'bg-green-500'  },
  error:        { pct: 20,  label: 'Reconnecting…',       color: 'bg-yellow-400' },
};

const VideoMonitoring = ({ autoConnect = true }) => {
  const [useMjpeg, setUseMjpeg] = useState(false);
  const [activeTab, setActiveTab] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const [irregularities, setIrregularities] = useState<FareIrregularity[]>([]);
  const [passengerCounts, setPassengerCounts] = useState<PassengerCount[]>([]);
  const [aiLoading, setAiLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');

  useEffect(() => {
    fetchIrregularities();
    fetchPassengerCounts();
    
    const irregularitySubscription = supabase
      .channel('video-irregularity-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fare_irregularities' }, fetchIrregularities)
      .subscribe();

    const passengerSubscription = supabase
      .channel('video-passenger-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'passenger_counts' }, fetchPassengerCounts)
      .subscribe();

    return () => {
      irregularitySubscription.unsubscribe();
      passengerSubscription.unsubscribe();
    };
  }, []);

  const fetchPassengerCounts = async () => {
    try {
      const { data, error } = await supabase
        .from('passenger_counts')
        .select(`
          id,
          count,
          ai_count,
          recorded_at,
          trip_id,
          buses!inner (bus_number, route)
        `)
        .order('recorded_at', { ascending: false })
        .limit(100);

      if (error) throw error;

      const counts: PassengerCount[] = (data || []).map((pc: any) => ({
        id: pc.id,
        trip_id: pc.trip_id,
        bus_number: pc.buses?.bus_number || 0,
        route: pc.buses?.route || 'Unknown',
        count: pc.count,
        ai_count: pc.ai_count,
        recorded_at: pc.recorded_at,
      }));

      setPassengerCounts(counts);
    } catch (error) {
      console.error('Error fetching passenger counts:', error);
    }
  };

  const fetchIrregularities = async () => {
    try {
      const { data: irregularitiesData, error: irregularitiesError } = await supabase
        .from('fare_irregularities')
        .select(`
          id,
          type,
          description,
          detected_at,
          resolved,
          resolved_at,
          trip_id,
          conductor_id,
          buses!inner (bus_number, route)
        `)
        .order('detected_at', { ascending: false })
        .limit(100);

      if (irregularitiesError) throw irregularitiesError;

      const conductorIds = [...new Set((irregularitiesData || []).map((ir: any) => ir.conductor_id).filter(Boolean))];
      const { data: conductors } = await supabase
        .from('staff_users')
        .select('id, full_name')
        .in('id', conductorIds);

      const conductorMap = new Map(
        (conductors || []).map((c: any) => [c.id, c.full_name])
      );

      const irregularities: FareIrregularity[] = (irregularitiesData || []).map((ir: any) => ({
        id: ir.id,
        type: ir.type,
        bus_number: ir.buses?.bus_number || 0,
        route: ir.buses?.route || 'Unknown',
        conductor_name: conductorMap.get(ir.conductor_id) || 'Unknown',
        detected_at: ir.detected_at,
        resolved: ir.resolved,
        resolved_at: ir.resolved_at,
        description: ir.description,
      }));

      setIrregularities(irregularities);
      setAiLoading(false);
    } catch (error) {
      console.error('Error fetching irregularities:', error);
      setAiLoading(false);
    }
  };

  const filteredIrregularities = irregularities.filter(ir => {
    const matchesSearch = 
      ir.bus_number.toString().includes(searchTerm) ||
      ir.route.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ir.conductor_name.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || 
      (statusFilter === 'resolved' && ir.resolved) ||
      (statusFilter === 'unresolved' && !ir.resolved);
    
    const matchesType = typeFilter === 'all' || ir.type === typeFilter;
    
    return matchesSearch && matchesStatus && matchesType;
  });

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'no_ticket': return 'bg-red-500/20 text-red-400 border-red-500/30';
      case 'invalid_ticket': return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
      case 'overcrowding': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      case 'suspicious_activity': return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
      default: return 'bg-white/10 text-white/60 border-white/20';
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'no_ticket': return 'No Ticket';
      case 'invalid_ticket': return 'Invalid Ticket';
      case 'overcrowding': return 'Overcrowding';
      case 'suspicious_activity': return 'Suspicious Activity';
      default: return type;
    }
  };

  const resolveIrregularity = async (id: string) => {
    try {
      const { error } = await supabase
        .from('fare_irregularities')
        .update({ resolved: true, resolved_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;
      fetchIrregularities();
    } catch (error) {
      console.error('Error resolving irregularity:', error);
    }
  };

  const getDiscrepancyColor = (diff: number) => {
    if (Math.abs(diff) < 5) return 'text-green-400';
    if (Math.abs(diff) < 10) return 'text-yellow-400';
    return 'text-red-400';
  };

  const filteredPassengerCounts = passengerCounts.filter(pc => {
    return (
      pc.bus_number.toString().includes(searchTerm) ||
      pc.route.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  const {
    connectionStatus,
    passengerCount,
    averageCount,
    isStreaming,
    videoRef,
    refresh,
    assignedBus,
    activeTripId,
    piReachable,
    raspberryPiUrl,
  } = useRaspberryPi({ autoConnect, enableHealthCheck: false });

  // displayStage drives the progress bar — stream starts automatically inside the hook
  const displayStage: string = isStreaming || useMjpeg
    ? 'streaming'
    : piReachable === false
    ? 'offline'
    : connectionStatus === 'error'
    ? 'error'
    : connectionStatus;

  const stage = CONNECTION_STAGES[displayStage] ?? CONNECTION_STAGES.disconnected;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Bus Video Monitoring</h1>
          <p className="text-white/60 mt-1 text-sm">
            Live video feed with AI passenger detection
            {assignedBus?.busPlate && (
              <span className="ml-2 px-2 py-0.5 bg-orange-500/20 text-orange-300 text-xs rounded-full border border-orange-500/30">
                Bus {assignedBus.busNumber} · {assignedBus.busPlate}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setUseMjpeg(!useMjpeg)}
            title={useMjpeg ? 'Switch to WebSocket mode' : 'Switch to MJPEG mode (fallback)'}
            className={`px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 transition-colors ${
              useMjpeg ? 'bg-orange-500/30 text-orange-300' : 'bg-white/10 text-white/60 hover:bg-white/20'
            }`}
          >
            <Tv2 size={14} />
            {useMjpeg ? 'MJPEG' : 'WebSocket'}
          </button>
          <button
            onClick={refresh}
            className="bg-white/10 hover:bg-white/20 text-white p-2 rounded-lg transition-colors"
            title="Reconnect"
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {/* Connection Progress Bar */}
      <div className="glass-card p-4 rounded-xl space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {displayStage === 'streaming' ? (
              <CheckCircle className="w-3 h-3 text-green-400" />
            ) : displayStage === 'connecting' || displayStage === 'connected' ? (
              <Loader2 className="w-3 h-3 text-yellow-400 animate-spin" />
            ) : displayStage === 'error' ? (
              <AlertCircle className="w-3 h-3 text-red-400" />
            ) : (
              <WifiOff className="w-3 h-3 text-red-400" />
            )}
            <span className="text-white font-medium text-xs">{stage.label}</span>
          </div>
          <span className="text-white/40 text-xs">{stage.pct}%</span>
        </div>

        {/* Track */}
        <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ease-in-out ${stage.color}`}
            style={{ width: `${stage.pct}%` }}
          />
        </div>

        {/* Stage indicators */}
        <div className="flex justify-between text-xs text-white/30 px-0.5">
          <span className={displayStage !== 'disconnected' && displayStage !== 'error' ? 'text-white/60' : ''}>Disconnected</span>
          <span className={displayStage === 'connecting' || displayStage === 'connected' || displayStage === 'streaming' ? 'text-white/60' : ''}>Connecting</span>
          <span className={displayStage === 'connected' || displayStage === 'streaming' ? 'text-white/60' : ''}>Connected</span>
          <span className={displayStage === 'streaming' ? 'text-green-400 font-medium' : ''}>Streaming</span>
        </div>
      </div>

      {/* Video Feed and Camera Info Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Video Feed - Takes 2 columns */}
        <div className="lg:col-span-2 glass-card rounded-xl overflow-hidden">
          {/* Relative container — 16:9 */}
          <div className="relative w-full bg-black" style={{ paddingBottom: '56.25%' }}>
            {/* Always-mounted img for WebSocket frames */}
            <img
              ref={videoRef}
              alt="Live video feed"
              className={`absolute inset-0 w-full h-full object-contain ${
                isStreaming && !useMjpeg ? 'block' : 'hidden'
              }`}
            />
            {/* MJPEG direct src */}
            {useMjpeg && (
              <img
                src={getPiVideoFeedUrl('')}
                alt="MJPEG video feed"
                className="absolute inset-0 w-full h-full object-contain"
              />
            )}

            {/* Placeholder / connecting state */}
            {!isStreaming && !useMjpeg && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center px-6">
                  {piReachable === false ? (
                    <>
                      <WifiOff className="w-10 h-10 text-red-400/60 mx-auto mb-3" />
                      <p className="text-red-400 font-medium mb-1 text-sm">Raspberry Pi offline</p>
                      <p className="text-white/40 text-xs mb-3">{raspberryPiUrl}</p>
                      <button
                        onClick={refresh}
                        className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs flex items-center gap-2 mx-auto transition-colors"
                      >
                        <RefreshCw size={12} />
                        Retry
                      </button>
                    </>
                  ) : (
                    <>
                      <Loader2 className="w-10 h-10 text-orange-400 animate-spin mx-auto mb-3" />
                      <p className="text-white/60 text-sm">
                        {piReachable === null ? 'Checking Pi…' : connectionStatus === 'connected' ? 'Starting stream…' : 'Connecting…'}
                      </p>
                      <p className="text-white/30 text-xs mt-1">{raspberryPiUrl}</p>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* LIVE badge */}
            {(isStreaming || useMjpeg) && (
              <div className="absolute top-3 left-3 bg-black/70 backdrop-blur-sm rounded-lg px-2 py-1 flex items-center gap-2">
                <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                <span className="text-white text-xs font-semibold tracking-wide">LIVE</span>
                {useMjpeg && <span className="text-white/50 text-xs">· MJPEG</span>}
              </div>
            )}

            {/* Validation Info Button */}
            <button
              onClick={() => setShowModal(true)}
              className="absolute top-3 right-3 bg-black/70 backdrop-blur-sm rounded-lg p-2 hover:bg-black/80 transition-colors"
              title="View Validation & Fallback Options"
            >
              <AlertCircle size={16} className="text-white/60 hover:text-white transition-colors" />
            </button>
          </div>
        </div>

        {/* Camera Info - Takes 1 column */}
        <div className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-white/40 px-1">Camera Info</h3>
          <div className="grid grid-cols-1 gap-3">
            <div className="glass-card rounded-xl p-3 flex items-center gap-3">
              <div className="w-8 h-8 bg-orange-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
                <Bus className="w-4 h-4 text-orange-400" />
              </div>
              <div>
                <p className="text-white/50 text-xs">Bus</p>
                <p className="text-white font-medium text-lg">
                  {assignedBus?.busNumber ? `#${assignedBus.busNumber}` : '—'}
                </p>
              </div>
            </div>
            <div className="glass-card rounded-xl p-3 flex items-center gap-3">
              <div className="w-8 h-8 bg-blue-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
                <Camera className="w-4 h-4 text-blue-400" />
              </div>
              <div>
                <p className="text-white/50 text-xs">Plate</p>
                <p className="text-white font-medium text-lg">{assignedBus?.busPlate || '—'}</p>
              </div>
            </div>
            <div className="glass-card rounded-xl p-3 flex items-center gap-3">
              <div className="w-8 h-8 bg-purple-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
                <Activity className="w-4 h-4 text-purple-400" />
              </div>
              <div>
                <p className="text-white/50 text-xs">Trip</p>
                <p className="text-white font-medium text-lg">
                  {activeTripId ? `#${activeTripId.slice(0, 6)}` : 'None'}
                </p>
              </div>
            </div>
            <div className="glass-card rounded-xl p-3 flex items-center gap-3">
              <div className="w-8 h-8 bg-green-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
                <Clock className="w-4 h-4 text-green-400" />
              </div>
              <div>
                <p className="text-white/50 text-xs">FPS</p>
                <p className="text-white font-medium text-lg">10</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="glass-card rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-orange-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
            <Users className="w-5 h-5 text-orange-400" />
          </div>
          <div>
            <p className="text-white/60 text-xs">Current Passengers</p>
            <p className="text-white text-2xl font-bold leading-none mt-1">{passengerCount}</p>
          </div>
        </div>

        <div className="glass-card rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
            <Activity className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <p className="text-white/60 text-xs">Average (30 frames)</p>
            <p className="text-white text-2xl font-bold leading-none mt-1">{averageCount}</p>
          </div>
        </div>

        <div className="glass-card rounded-xl p-4 flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
            isStreaming || useMjpeg ? 'bg-green-500/20' : 'bg-white/10'
          }`}>
            <Video className={`w-5 h-5 ${isStreaming || useMjpeg ? 'text-green-400' : 'text-white/40'}`} />
          </div>
          <div>
            <p className="text-white/60 text-xs">Stream</p>
            <p className={`text-lg font-bold leading-none mt-1 ${
              isStreaming || useMjpeg ? 'text-green-400' : 'text-white/50'
            }`}>
              {isStreaming || useMjpeg ? 'Active' : 'Inactive'}
            </p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="glass-card p-3 flex flex-col md:flex-row gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/40" size={16} />
          <input
            type="text"
            placeholder="Search by bus, route, or conductor..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-orange-500 text-xs"
          />
        </div>
        
        <div className="flex items-center gap-2">
          <Filter className="text-white/40" size={16} />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:border-orange-500 text-xs"
          >
            <option value="all">All Status</option>
            <option value="unresolved">Unresolved</option>
            <option value="resolved">Resolved</option>
          </select>
          
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:border-orange-500 text-xs"
          >
            <option value="all">All Types</option>
            <option value="no_ticket">No Ticket</option>
            <option value="invalid_ticket">Invalid Ticket</option>
            <option value="overcrowding">Overcrowding</option>
            <option value="suspicious_activity">Suspicious Activity</option>
          </select>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Fare Irregularities Section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <AlertTriangle className="text-red-400" size={18} />
              AI-Detected Irregularities
            </h2>
            <span className="text-white/60 text-xs">{filteredIrregularities.length} irregularities</span>
          </div>

          <div className="glass-card p-4">
            {aiLoading ? (
              <div className="text-center py-8">
                <Activity className="text-white/30 mx-auto mb-2 animate-spin" size={32} />
                <p className="text-white/40 text-xs">Loading irregularities...</p>
              </div>
            ) : filteredIrregularities.length === 0 ? (
              <div className="text-center py-8">
                <CheckCircle className="text-green-400/50 mx-auto mb-2" size={32} />
                <p className="text-white/40 text-xs">No irregularities found</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {filteredIrregularities.map((ir) => (
                  <div key={ir.id} className={`bg-white/5 rounded-lg p-3 border ${ir.resolved ? 'border-green-500/20' : 'border-red-500/20'} hover:bg-white/10 transition-colors`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${getTypeColor(ir.type)}`}>
                          {getTypeLabel(ir.type)}
                        </span>
                        <span className="text-white text-xs font-medium">Bus #{ir.bus_number}</span>
                        <span className="text-white/60 text-xs">{ir.route}</span>
                      </div>
                      {ir.resolved ? (
                        <CheckCircle className="text-green-400" size={16} />
                      ) : (
                        <AlertTriangle className="text-red-400" size={16} />
                      )}
                    </div>
                    {!ir.resolved && (
                      <button
                        onClick={() => resolveIrregularity(ir.id)}
                        className="mt-2 w-full px-3 py-1.5 bg-green-500/20 text-green-400 rounded-lg hover:bg-green-500/30 transition-colors text-xs font-medium"
                      >
                        Resolve
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Passenger Count Verification Section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Users className="text-blue-400" size={18} />
              Passenger Count Verification
            </h2>
            <span className="text-white/60 text-xs">{filteredPassengerCounts.length} records</span>
          </div>

          <div className="glass-card p-4">
            {aiLoading ? (
              <div className="text-center py-8">
                <Activity className="text-white/30 mx-auto mb-2 animate-spin" size={32} />
                <p className="text-white/40 text-xs">Loading passenger data...</p>
              </div>
            ) : filteredPassengerCounts.length === 0 ? (
              <div className="text-center py-8">
                <Users className="text-white/30 mx-auto mb-2" size={32} />
                <p className="text-white/40 text-xs">No passenger records found</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {filteredPassengerCounts.map((pc) => {
                  const diff = (pc.ai_count || 0) - pc.count;
                  
                  return (
                    <div key={pc.id} className="bg-white/5 rounded-lg p-3 border border-white/10 hover:bg-white/10 transition-colors">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 rounded-lg bg-blue-500/20">
                            <Users size={12} className="text-blue-400" />
                          </div>
                          <div>
                            <p className="text-white text-xs font-medium">Bus #{pc.bus_number}</p>
                            <p className="text-white/60 text-xs">{pc.route}</p>
                          </div>
                        </div>
                        <span className={`text-xs font-bold ${getDiscrepancyColor(diff)}`}>
                          {diff > 0 ? '+' : ''}{diff}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="flex items-center gap-1">
                          <span className="text-white/60 text-xs">QR:</span>
                          <span className="text-white text-xs font-medium">{pc.count}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-white/60 text-xs">AI:</span>
                          <span className="text-white text-xs font-medium">{pc.ai_count || 0}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="glass-card rounded-xl p-4 max-w-lg w-full max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <AlertCircle size={20} className="text-orange-400" />
                Validation & Fallback Options
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-white/60 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            {/* Tab Navigation */}
            <div className="flex gap-2 mb-3 flex-wrap">
              {[
                { id: 0, label: 'Connection Issues', icon: WifiOff, color: 'text-red-400' },
                { id: 1, label: 'Fallback Options', icon: Tv2, color: 'text-orange-400' },
                { id: 2, label: 'Troubleshooting', icon: RefreshCw, color: 'text-blue-400' },
                { id: 3, label: 'Requirements', icon: CheckCircle, color: 'text-green-400' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-colors ${
                    activeTab === tab.id
                      ? 'bg-white/20 text-white'
                      : 'bg-white/5 text-white/60 hover:bg-white/10'
                  }`}
                >
                  <tab.icon size={14} className={tab.color} />
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div className="bg-white/5 rounded-lg p-3 border border-white/10">
              {activeTab === 0 && (
                <div className="space-y-2">
                  <h4 className="text-white font-medium mb-2 flex items-center gap-2 text-sm">
                    <WifiOff size={14} className="text-red-400" />
                    Connection Issues
                  </h4>
                  <ul className="text-white/60 text-xs space-y-1.5">
                    <li className="flex items-start gap-2">
                      <ChevronRight size={12} className="text-white/40 mt-0.5 flex-shrink-0" />
                      Raspberry Pi offline or not powered on
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight size={12} className="text-white/40 mt-0.5 flex-shrink-0" />
                      Network connectivity issues (different WiFi/Network)
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight size={12} className="text-white/40 mt-0.5 flex-shrink-0" />
                      IP address changed (raspberrypi.local not resolving)
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight size={12} className="text-white/40 mt-0.5 flex-shrink-0" />
                      Firewall blocking port 8000
                    </li>
                  </ul>
                </div>
              )}

              {activeTab === 1 && (
                <div className="space-y-2">
                  <h4 className="text-white font-medium mb-2 flex items-center gap-2 text-sm">
                    <Tv2 size={14} className="text-orange-400" />
                    Fallback Options
                  </h4>
                  <ul className="text-white/60 text-xs space-y-1.5">
                    <li className="flex items-start gap-2">
                      <ChevronRight size={12} className="text-white/40 mt-0.5 flex-shrink-0" />
                      <span className="text-orange-300">WebSocket Mode</span>: Real-time frame updates (default)
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight size={12} className="text-white/40 mt-0.5 flex-shrink-0" />
                      <span className="text-orange-300">MJPEG Mode</span>: Direct HTTP stream (if WebSocket fails)
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight size={12} className="text-white/40 mt-0.5 flex-shrink-0" />
                      Toggle mode using the button in the header
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight size={12} className="text-white/40 mt-0.5 flex-shrink-0" />
                      Auto-reconnect enabled for connection drops
                    </li>
                  </ul>
                </div>
              )}

              {activeTab === 2 && (
                <div className="space-y-2">
                  <h4 className="text-white font-medium mb-2 flex items-center gap-2 text-sm">
                    <RefreshCw size={14} className="text-blue-400" />
                    Troubleshooting Steps
                  </h4>
                  <ul className="text-white/60 text-xs space-y-1.5">
                    <li className="flex items-start gap-2">
                      <ChevronRight size={12} className="text-white/40 mt-0.5 flex-shrink-0" />
                      Check Raspberry Pi power and network connection
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight size={12} className="text-white/40 mt-0.5 flex-shrink-0" />
                      Verify Pi is on the same network as this device
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight size={12} className="text-white/40 mt-0.5 flex-shrink-0" />
                      Try switching to MJPEG mode using the toggle button
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight size={12} className="text-white/40 mt-0.5 flex-shrink-0" />
                      Click Refresh to force reconnection
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight size={12} className="text-white/40 mt-0.5 flex-shrink-0" />
                      Check if port 8000 is accessible: http://raspberrypi.local:8000
                    </li>
                  </ul>
                </div>
              )}

              {activeTab === 3 && (
                <div className="space-y-2">
                  <h4 className="text-white font-medium mb-2 flex items-center gap-2 text-sm">
                    <CheckCircle size={14} className="text-green-400" />
                    Requirements
                  </h4>
                  <ul className="text-white/60 text-xs space-y-1.5">
                    <li className="flex items-start gap-2">
                      <ChevronRight size={12} className="text-white/40 mt-0.5 flex-shrink-0" />
                      Raspberry Pi with camera module configured
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight size={12} className="text-white/40 mt-0.5 flex-shrink-0" />
                      YOLO detection model running on Pi
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight size={12} className="text-white/40 mt-0.5 flex-shrink-0" />
                      Local network (same subnet for raspberrypi.local)
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight size={12} className="text-white/40 mt-0.5 flex-shrink-0" />
                      Browser with WebSocket support
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight size={12} className="text-white/40 mt-0.5 flex-shrink-0" />
                      Minimum 1 Mbps network bandwidth for video
                    </li>
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VideoMonitoring;
