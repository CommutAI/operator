import { useState, useEffect } from 'react';
import { Search, Bus, MapPin, CheckCircle, Clock, ChevronLeft, ChevronRight, Video, Play, Download, X, AlertTriangle, Receipt, Activity } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface Trip {
  id: string;
  status: string;
  started_at: string;
  ended_at: string | null;
  current_lat: number | null;
  current_lng: number | null;
  buses: {
    plate_number: string;
    bus_number: number;
    route: string;
  } | null;
  conductor: {
    full_name: string;
  } | null;
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

export default function TripManagement() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [tripVideos, setTripVideos] = useState<Record<string, TripVideo>>({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [currentPage, setCurrentPage] = useState(0);
  const [selectedVideo, setSelectedVideo] = useState<TripVideo | null>(null);
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);
  const [tripDetails, setTripDetails] = useState<any>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const itemsPerPage = 10;

  useEffect(() => {
    fetchTrips();

    const subscription = supabase
      .channel('trips-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trips' }, fetchTrips)
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const fetchTrips = async () => {
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
            // Keep only the latest video for each trip
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
  };

  const fetchTripDetails = async (tripId: string) => {
    console.log('Fetching trip details for:', tripId);
    try {
      setDetailsLoading(true);
      setSelectedTrip(trips.find(t => t.id === tripId) || null);

      // Fetch transactions for this trip
      const { data: transactions } = await supabase
        .from('transactions')
        .select('*')
        .eq('trip_id', tripId)
        .order('created_at', { ascending: false });

      // Fetch irregularities for this trip
      const { data: irregularities } = await supabase
        .from('fare_irregularities')
        .select('*')
        .eq('trip_id', tripId)
        .order('detected_at', { ascending: false });

      // Fetch emergency alerts for this trip
      const { data: emergencyAlerts } = await supabase
        .from('emergency_alerts')
        .select('*')
        .eq('trip_id', tripId)
        .order('created_at', { ascending: false });

      // Fetch anomaly detections for this trip
      const { data: anomalies } = await supabase
        .from('anomaly_detections')
        .select('*')
        .eq('trip_id', tripId)
        .order('detected_at', { ascending: false });

      setTripDetails({
        transactions: transactions || [],
        irregularities: irregularities || [],
        emergencyAlerts: emergencyAlerts || [],
        anomalies: anomalies || []
      });
    } catch (error) {
      console.error('Error fetching trip details:', error);
    } finally {
      setDetailsLoading(false);
    }
  };

  const filteredTrips = trips.filter(trip => {
    const matchesSearch =
      trip.buses?.plate_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      trip.buses?.route?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      trip.conductor?.full_name?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === 'all' || trip.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const totalPages = Math.ceil(filteredTrips.length / itemsPerPage);
  const paginatedTrips = filteredTrips.slice(
    currentPage * itemsPerPage,
    (currentPage + 1) * itemsPerPage
  );

  const statusColors = {
    in_progress: 'bg-blue-500/20 text-blue-400 border-blue-500/50',
    completed: 'bg-green-500/20 text-green-400 border-green-500/50',
    cancelled: 'bg-red-500/20 text-red-400 border-red-500/50',
  };

  const statusLabels = {
    in_progress: 'In Progress',
    completed: 'Completed',
    cancelled: 'Cancelled',
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Trip Management</h1>
          <p className="text-white/60">Monitor and manage active bus trips</p>
        </div>
      </div>

      {/* Stats */}
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

      {/* Trip List */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-white">Active Trips</h2>
          <span className="text-white/60">{filteredTrips.length} records</span>
        </div>

        {/* Search Bar and Filters */}
        <div className="mb-6 flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/40" size={20} />
            <input
              type="text"
              placeholder="Search by bus, route, or conductor..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-orange-500"
            />
          </div>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:border-orange-500"
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
        ) : filteredTrips.length === 0 ? (
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
                <tbody>
                  {paginatedTrips.map((trip) => (
                    <tr
                      key={trip.id}
                      className="border-b border-white/5 hover:bg-white/5 transition-colors cursor-pointer"
                      onClick={(e) => {
                        console.log('Row clicked for trip:', trip.id);
                        fetchTripDetails(trip.id);
                      }}
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
                        <span className={`px-3 py-1 rounded-full text-xs border ${statusColors[trip.status as keyof typeof statusColors]}`}>
                          {statusLabels[trip.status as keyof typeof statusLabels] || trip.status}
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
                            onClick={(e) => { e.stopPropagation(); setSelectedVideo(tripVideos[trip.id]); }}
                            className="flex items-center gap-2 px-3 py-1.5 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded-lg transition-colors text-sm"
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
                  Showing {currentPage * itemsPerPage + 1} to {Math.min((currentPage + 1) * itemsPerPage, filteredTrips.length)} of {filteredTrips.length} trips
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage(Math.max(0, currentPage - 1))}
                    disabled={currentPage === 0}
                    className="p-2 rounded-lg bg-white/10 text-white/60 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <span className="text-white/60 text-sm">
                    Page {currentPage + 1} of {totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage(Math.min(totalPages - 1, currentPage + 1))}
                    disabled={currentPage === totalPages - 1}
                    className="p-2 rounded-lg bg-white/10 text-white/60 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Video Player Modal */}
      {selectedVideo && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="glass-card w-full max-w-4xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-white">Trip Video</h3>
              <button
                onClick={() => setSelectedVideo(null)}
                className="text-white/60 hover:text-white transition-colors"
              >
                <CheckCircle size={24} />
              </button>
            </div>

            <div className="space-y-4">
              {/* Video Info */}
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

              {/* Upload Progress */}
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

              {/* Video Player */}
              {selectedVideo.status === 'completed' && selectedVideo.storage_url ? (
                <div className="relative bg-black rounded-lg overflow-hidden aspect-video">
                  <video
                    src={selectedVideo.storage_url}
                    controls
                    className="w-full h-full"
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

              {/* Action Buttons */}
              {selectedVideo.status === 'completed' && selectedVideo.storage_url && (
                <div className="flex gap-3">
                  <a
                    href={selectedVideo.storage_url}
                    download
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-colors"
                  >
                    <Download size={18} />
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
          <div className="glass-card rounded-xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-white/10">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Bus className="text-orange-400" size={20} />
                Trip Details
              </h2>
              <button
                onClick={() => { setSelectedTrip(null); setTripDetails(null); }}
                className="text-white/60 hover:text-white transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto max-h-[calc(90vh-80px)]">
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
                        <p className="text-white font-medium">{statusLabels[selectedTrip.status as keyof typeof statusLabels] || selectedTrip.status}</p>
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
                      Transactions ({tripDetails.transactions.length})
                    </h3>
                    {tripDetails.transactions.length > 0 ? (
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
                      Fare Irregularities ({tripDetails.irregularities.length})
                    </h3>
                    {tripDetails.irregularities.length > 0 ? (
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
                      Emergency Alerts ({tripDetails.emergencyAlerts.length})
                    </h3>
                    {tripDetails.emergencyAlerts.length > 0 ? (
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
                      Anomaly Detections ({tripDetails.anomalies.length})
                    </h3>
                    {tripDetails.anomalies.length > 0 ? (
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
