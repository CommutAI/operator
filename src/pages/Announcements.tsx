import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Megaphone, Plus, Clock, Trash2, Edit, AlertTriangle, Search, Filter, User, MapPin, ChevronLeft, ChevronRight } from 'lucide-react';

interface Announcement {
  id: string;
  title: string;
  message: string;
  priority: string;
  created_at: string;
  created_by?: string;
  expires_at?: string;
}

interface EmergencyAlert {
  id: string;
  bus_number: number;
  route: string;
  conductor_name: string;
  lat?: number;
  lng?: number;
  status: string;
  notes?: string;
  created_at: string;
  acknowledged_at?: string;
  resolved_at?: string;
}

export default function Announcements() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [emergencyAlerts, setEmergencyAlerts] = useState<EmergencyAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [emergencyPage, setEmergencyPage] = useState(0);
  const itemsPerPage = 5;
  const [formData, setFormData] = useState({
    title: '',
    message: '',
    priority: 'normal',
    expires_at: '',
  });

  useEffect(() => {
    fetchAnnouncements();
    fetchEmergencyAlerts();
    
    const announcementSubscription = supabase
      .channel('announcements-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'announcements' }, fetchAnnouncements)
      .subscribe();

    const emergencySubscription = supabase
      .channel('emergency-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'emergency_alerts' }, fetchEmergencyAlerts)
      .subscribe();

    return () => {
      announcementSubscription.unsubscribe();
      emergencySubscription.unsubscribe();
    };
  }, []);

  const fetchAnnouncements = async () => {
    try {
      const { data, error } = await supabase
        .from('announcements')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      setAnnouncements(data || []);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching announcements:', error);
      setLoading(false);
    }
  };

  const fetchEmergencyAlerts = async () => {
    try {
      const { data: alertsData, error: alertsError } = await supabase
        .from('emergency_alerts')
        .select(`
          id,
          lat,
          lng,
          status,
          notes,
          created_at,
          acknowledged_at,
          resolved_at,
          trip_id,
          conductor_id,
          buses!inner (bus_number, route)
        `)
        .order('created_at', { ascending: false })
        .limit(100);

      if (alertsError) throw alertsError;

      // Fetch all conductors separately
      const conductorIds = [...new Set((alertsData || []).map((alert: any) => alert.conductor_id).filter(Boolean))];
      const { data: conductors } = await supabase
        .from('staff_users')
        .select('id, full_name')
        .in('id', conductorIds);

      const conductorMap = new Map(
        (conductors || []).map((c: any) => [c.id, c.full_name])
      );

      const alerts: EmergencyAlert[] = (alertsData || []).map((alert: any) => ({
        id: alert.id,
        bus_number: alert.buses?.bus_number || 0,
        route: alert.buses?.route || 'Unknown',
        conductor_name: conductorMap.get(alert.conductor_id) || 'Unknown',
        lat: alert.lat,
        lng: alert.lng,
        status: alert.status,
        notes: alert.notes,
        created_at: alert.created_at,
        acknowledged_at: alert.acknowledged_at,
        resolved_at: alert.resolved_at,
      }));

      setEmergencyAlerts(alerts);
    } catch (error) {
      console.error('Error fetching emergency alerts:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      if (editingId) {
        const { error } = await supabase
          .from('announcements')
          .update({
            title: formData.title,
            message: formData.message,
            priority: formData.priority,
            expires_at: formData.expires_at || null,
          })
          .eq('id', editingId);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('announcements')
          .insert({
            title: formData.title,
            message: formData.message,
            priority: formData.priority,
            expires_at: formData.expires_at || null,
          });

        if (error) throw error;
      }

      setFormData({ title: '', message: '', priority: 'normal', expires_at: '' });
      setShowForm(false);
      setEditingId(null);
      fetchAnnouncements();
    } catch (error) {
      console.error('Error saving announcement:', error);
    }
  };

  const handleEdit = (announcement: Announcement) => {
    setFormData({
      title: announcement.title,
      message: announcement.message,
      priority: announcement.priority,
      expires_at: announcement.expires_at || '',
    });
    setEditingId(announcement.id);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this announcement?')) return;
    
    try {
      const { error } = await supabase
        .from('announcements')
        .delete()
        .eq('id', id);

      if (error) throw error;
      fetchAnnouncements();
    } catch (error) {
      console.error('Error deleting announcement:', error);
    }
  };

  const acknowledgeAlert = async (id: string) => {
    try {
      const { error } = await supabase
        .from('emergency_alerts')
        .update({ acknowledged_at: new Date().toISOString(), status: 'acknowledged' })
        .eq('id', id);

      if (error) throw error;
      fetchEmergencyAlerts();
    } catch (error) {
      console.error('Error acknowledging alert:', error);
    }
  };

  const resolveAlert = async (id: string) => {
    try {
      const { error } = await supabase
        .from('emergency_alerts')
        .update({ resolved_at: new Date().toISOString(), status: 'resolved' })
        .eq('id', id);

      if (error) throw error;
      fetchEmergencyAlerts();
    } catch (error) {
      console.error('Error resolving alert:', error);
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'bg-red-500/20 text-red-400 border-red-500/30';
      case 'high': return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
      case 'normal': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      default: return 'bg-white/10 text-white/60 border-white/20';
    }
  };

  const getEmergencyStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-red-500/20 text-red-400 border-red-500/30';
      case 'acknowledged': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      case 'resolved': return 'bg-green-500/20 text-green-400 border-green-500/30';
      default: return 'bg-white/10 text-white/60 border-white/20';
    }
  };

  const filteredAlerts = emergencyAlerts.filter(alert => {
    const matchesSearch = 
      alert.bus_number.toString().includes(searchTerm) ||
      alert.route.toLowerCase().includes(searchTerm.toLowerCase()) ||
      alert.conductor_name.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || alert.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Communications</h1>
          <p className="text-white/60">System communications and alerts</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-medium flex items-center gap-2 transition-colors"
        >
          <Plus size={20} />
          New Announcement
        </button>
      </div>

      {/* Announcement Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <div className="glass-card rounded-xl p-6 max-w-lg w-full" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-2xl font-bold text-white mb-6">
              {editingId ? 'Edit Announcement' : 'New Announcement'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-white/60 text-sm mb-2">Title</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:border-orange-500"
                  required
                />
              </div>
              <div>
                <label className="block text-white/60 text-sm mb-2">Message</label>
                <textarea
                  value={formData.message}
                  onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                  className="w-full px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:border-orange-500 min-h-[100px]"
                  required
                />
              </div>
              <div>
                <label className="block text-white/60 text-sm mb-2">Priority</label>
                <select
                  value={formData.priority}
                  onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                  className="w-full px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:border-orange-500"
                >
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
              <div>
                <label className="block text-white/60 text-sm mb-2">Expires At (Optional)</label>
                <input
                  type="datetime-local"
                  value={formData.expires_at}
                  onChange={(e) => setFormData({ ...formData, expires_at: e.target.value })}
                  className="w-full px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:border-orange-500"
                />
              </div>
              <div className="flex gap-3 justify-end pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setEditingId(null);
                    setFormData({ title: '', message: '', priority: 'normal', expires_at: '' });
                  }}
                  className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-medium transition-colors"
                >
                  {editingId ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Active Announcements */}
      <div className="glass-card p-6">
        <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <Megaphone className="text-orange-400" size={20} />
          Active Announcements
        </h2>
        
        {loading ? (
          <div className="text-center py-8">
            <div className="text-white">Loading announcements...</div>
          </div>
        ) : announcements.length === 0 ? (
          <div className="text-center py-8">
            <Megaphone className="text-white/20 mx-auto mb-2" size={48} />
            <p className="text-white/40">No announcements found</p>
          </div>
        ) : (
          <div className="space-y-3">
            {announcements.map((announcement) => (
              <div key={announcement.id} className="bg-white/5 rounded-xl p-4 border border-white/10 hover:bg-white/10 transition-colors">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getPriorityColor(announcement.priority)}`}>
                        {announcement.priority}
                      </span>
                      <h3 className="text-white font-semibold">{announcement.title}</h3>
                    </div>
                    <p className="text-white/70 text-sm">{announcement.message}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEdit(announcement)}
                      className="p-2 bg-white/10 hover:bg-white/20 text-white/60 rounded-lg transition-colors"
                    >
                      <Edit size={16} />
                    </button>
                    <button
                      onClick={() => handleDelete(announcement.id)}
                      className="p-2 bg-white/10 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs text-white/40">
                  <div className="flex items-center gap-1">
                    <User size={12} />
                    <span>{announcement.created_by || 'System'}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock size={12} />
                    <span>{new Date(announcement.created_at).toLocaleString()}</span>
                  </div>
                  {announcement.expires_at && (
                    <div className="flex items-center gap-1">
                      <span>Expires: {new Date(announcement.expires_at).toLocaleString()}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Emergency Alerts Section */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <AlertTriangle className="text-red-400" size={20} />
          Emergency History
        </h2>

        {/* Filters */}
        <div className="glass-card p-4 flex flex-col md:flex-row gap-4">
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
          
          <div className="flex items-center gap-2">
            <Filter className="text-white/40" size={20} />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:border-orange-500"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="acknowledged">Acknowledged</option>
              <option value="resolved">Resolved</option>
            </select>
          </div>
        </div>

        {/* Alert List */}
        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-6">
            <span className="text-white/60">{filteredAlerts.length} alerts</span>
          </div>

          {loading ? (
            <div className="text-center py-8">
              <div className="text-white">Loading alerts...</div>
            </div>
          ) : filteredAlerts.length === 0 ? (
            <div className="text-center py-8">
              <AlertTriangle className="text-white/20 mx-auto mb-2" size={48} />
              <p className="text-white/40">No emergency alerts found</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto max-h-[500px] overflow-y-auto mb-4">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="text-left py-3 px-4 text-white/60 font-medium">Status</th>
                      <th className="text-left py-3 px-4 text-white/60 font-medium">Bus</th>
                      <th className="text-left py-3 px-4 text-white/60 font-medium">Route</th>
                      <th className="text-left py-3 px-4 text-white/60 font-medium">Conductor</th>
                      <th className="text-left py-3 px-4 text-white/60 font-medium">Location</th>
                      <th className="text-left py-3 px-4 text-white/60 font-medium">Notes</th>
                      <th className="text-left py-3 px-4 text-white/60 font-medium">Time</th>
                      <th className="text-left py-3 px-4 text-white/60 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAlerts.slice(
                      emergencyPage * itemsPerPage,
                      (emergencyPage + 1) * itemsPerPage
                    ).map((alert) => (
                      <tr key={alert.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                        <td className="py-4 px-4">
                          <span className={`px-3 py-1 rounded-full text-xs font-medium ${getEmergencyStatusColor(alert.status)}`}>
                            {alert.status}
                          </span>
                        </td>
                        <td className="py-4 px-4">
                          <span className="text-white font-medium">Bus #{alert.bus_number}</span>
                        </td>
                        <td className="py-4 px-4 text-white/80">{alert.route}</td>
                        <td className="py-4 px-4 text-white/80">{alert.conductor_name}</td>
                        <td className="py-4 px-4 text-white/80">
                          {alert.lat && alert.lng ? (
                            <a
                              href={`https://maps.google.com/?q=${alert.lat},${alert.lng}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-400 hover:text-blue-300 flex items-center gap-1"
                            >
                              <MapPin size={14} />
                              View on Map
                            </a>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td className="py-4 px-4 text-white/80 max-w-xs truncate">
                          {alert.notes || '-'}
                        </td>
                        <td className="py-4 px-4">
                          <div className="flex items-center gap-2 text-white/60">
                            <Clock size={16} />
                            <span>{new Date(alert.created_at).toLocaleString()}</span>
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          <div className="flex gap-2">
                            {alert.status === 'active' && (
                              <button
                                onClick={() => acknowledgeAlert(alert.id)}
                                className="px-3 py-1 bg-yellow-500/20 text-yellow-400 rounded-lg hover:bg-yellow-500/30 transition-colors text-sm"
                              >
                                Acknowledge
                              </button>
                            )}
                            {alert.status === 'acknowledged' && (
                              <button
                                onClick={() => resolveAlert(alert.id)}
                                className="px-3 py-1 bg-green-500/20 text-green-400 rounded-lg hover:bg-green-500/30 transition-colors text-sm"
                              >
                                Resolve
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between pt-4 border-t border-white/10">
                <span className="text-white/60 text-xs">
                  Page {emergencyPage + 1} of {Math.ceil(filteredAlerts.length / itemsPerPage)}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setEmergencyPage(Math.max(0, emergencyPage - 1))}
                    disabled={emergencyPage === 0}
                    className="p-2 rounded-lg bg-white/10 text-white/60 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    onClick={() => setEmergencyPage(Math.min(Math.ceil(filteredAlerts.length / itemsPerPage) - 1, emergencyPage + 1))}
                    disabled={emergencyPage === Math.ceil(filteredAlerts.length / itemsPerPage) - 1}
                    className="p-2 rounded-lg bg-white/10 text-white/60 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
