import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { AlertTriangle, Users, Video, Activity, Clock, ChevronLeft, ChevronRight, ArrowUpDown } from 'lucide-react';
import VideoMonitoring from './VideoMonitoring';

export default function AIMonitoring() {
  const [unresolvedCount, setUnresolvedCount] = useState(0);
  const [totalPassengers, setTotalPassengers] = useState(0);
  const [historyPage, setHistoryPage] = useState(0);
  const [sortBy, setSortBy] = useState<'time' | 'bus' | 'event'>('time');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const itemsPerPage = 5;

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
  }, []);

  const fetchStats = async () => {
    try {
      const [{ count: irregularityCount }, { data: passengerData }] = await Promise.all([
        supabase
          .from('fare_irregularities')
          .select('*', { count: 'exact', head: true })
          .eq('resolved', false),
        supabase
          .from('passenger_counts')
          .select('count')
          .order('recorded_at', { ascending: false })
          .limit(100)
      ]);

      setUnresolvedCount(irregularityCount || 0);
      
      const total = (passengerData || []).reduce((sum: number, pc: any) => sum + (pc.count || 0), 0);
      setTotalPassengers(total);
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const detectionHistory = [
    { id: 1, bus: '1234', event: 'Detected 5 passengers boarding at Manolo Fortich Terminal', time: '2 min ago', timeValue: 2 },
    { id: 2, bus: '5678', event: 'Detected 3 passengers alighting at Agora Terminal', time: '5 min ago', timeValue: 5 },
    { id: 3, bus: '9012', event: 'Fare irregularity detected: No ticket validation', time: '8 min ago', timeValue: 8 },
    { id: 4, bus: '3456', event: 'Detected 7 passengers boarding at Manolo Fortich Terminal', time: '12 min ago', timeValue: 12 },
    { id: 5, bus: '7890', event: 'Detected 2 passengers alighting at Agora Terminal', time: '15 min ago', timeValue: 15 },
    { id: 6, bus: '2345', event: 'Fare irregularity detected: Invalid ticket', time: '20 min ago', timeValue: 20 },
    { id: 7, bus: '6789', event: 'Detected 4 passengers boarding at Manolo Fortich Terminal', time: '25 min ago', timeValue: 25 },
    { id: 8, bus: '0123', event: 'Detected 6 passengers alighting at Agora Terminal', time: '30 min ago', timeValue: 30 },
    { id: 9, bus: '4567', event: 'Detected 3 passengers boarding at Manolo Fortich Terminal', time: '35 min ago', timeValue: 35 },
    { id: 10, bus: '8901', event: 'Fare irregularity detected: Overcrowding', time: '40 min ago', timeValue: 40 },
  ];

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

  const totalPages = Math.ceil(sortedHistory.length / itemsPerPage);
  const paginatedHistory = sortedHistory.slice(
    historyPage * itemsPerPage,
    (historyPage + 1) * itemsPerPage
  );

  const handleSort = (field: 'time' | 'bus' | 'event') => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
    setHistoryPage(0);
  };

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
        <VideoMonitoring autoConnect={true} />
      </div>

      {/* Detection History */}
      <div className="glass-card p-6">
        <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-3">
          <Activity className="text-orange-400" size={20} />
          Detection History
        </h2>
        
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
          {paginatedHistory.map((item) => (
            <div key={item.id} className="flex items-center justify-between py-3 px-4 hover:bg-white/5 rounded-lg transition-colors border-b border-white/5 last:border-0">
              <div className="flex items-center gap-4">
                <span className="text-white font-medium text-sm">Bus #{item.bus}</span>
                <p className="text-white/70 text-sm">{item.event}</p>
              </div>
              <div className="flex items-center gap-1 text-white/60 text-xs">
                <Clock size={12} />
                <span>{item.time}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between pt-4 border-t border-white/10">
          <span className="text-white/60 text-xs">
            Page {historyPage + 1} of {totalPages}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setHistoryPage(Math.max(0, historyPage - 1))}
              disabled={historyPage === 0}
              className="p-2 rounded-lg bg-white/10 text-white/60 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => setHistoryPage(Math.min(totalPages - 1, historyPage + 1))}
              disabled={historyPage === totalPages - 1}
              className="p-2 rounded-lg bg-white/10 text-white/60 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
