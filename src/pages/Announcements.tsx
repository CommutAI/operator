import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Megaphone, Plus, Clock, Trash2, Edit, AlertTriangle, Search, Filter, User, MapPin, CheckCircle } from 'lucide-react';

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
          trips (
            id,
            conductor_id,
            buses (bus_number, route)
          )
        `)
        .order('created_at', { ascending: false })
        .limit(100);

      if (alertsError) throw alertsError;

      // Fetch all conductors separately
      const conductorIds = [...new Set((alertsData || []).map((alert: any) => alert.trips?.conductor_id).filter(Boolean))];
      const { data: conductors } = await supabase
        .from('staff_users')
        .select('id, full_name')
        .in('id', conductorIds);

      const conductorMap = new Map(
        (conductors || []).map((c: any) => [c.id, c.full_name])
      );

      const alerts: EmergencyAlert[] = (alertsData || []).map((alert: any) => ({
        id: alert.id,
        bus_number: alert.trips?.buses?.bus_number || 0,
        route: alert.trips?.buses?.route || 'Unknown',
        conductor_name: conductorMap.get(alert.trips?.conductor_id) || 'Unknown',
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
      const announcementData = {
        title: formData.title,
        message: formData.message,
        priority: formData.priority,
        expires_at: formData.expires_at || null,
      };

      if (editingId) {
        const { error } = await supabase
          .from('announcements')
          .update(announcementData)
          .eq('id', editingId);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('announcements')
          .insert(announcementData);

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
      expires_at: announcement.expires_at?.split('T')[0] || '',
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

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'text-red-400 bg-red-500/20';
      case 'high': return 'text-orange-400 bg-orange-500/20';
      case 'normal': return 'text-blue-400 bg-blue-500/20';
      case 'low': return 'text-gray-400 bg-gray-500/20';
      default: return 'text-white/60 bg-white/10';
    }
  };

  const isExpired = (expiresAt?: string) => {
    if (!expiresAt) return false;
    return new Date(expiresAt) < new Date();
  };

  // Emergency alert functions
  const acknowledgeAlert = async (id: string) => {
    try {
      const { error } = await supabase
        .from('emergency_alerts')
        .update({ status: 'acknowledged', acknowledged_at: new Date().toISOString() })
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
        .update({ status: 'resolved', resolved_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;
      fetchEmergencyAlerts();
    } catch (error) {
      console.error('Error resolving alert:', error);
    }
  };

  const getEmergencyStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'text-red-400 bg-red-500/20';
      case 'acknowledged': return 'text-yellow-400 bg-yellow-500/20';
      case 'resolved': return 'text-green-400 bg-green-500/20';
      default: return 'text-white/60 bg-white/10';
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

  const activeCount = emergencyAlerts.filter(a => a.status === 'active').length;
  const acknowledgedCount = emergencyAlerts.filter(a => a.status === 'acknowledged').length;
  const resolvedCount = emergencyAlerts.filter(a => a.status === 'resolved').length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Communications Center</h1>
          <p className="text-white/60">Manage announcements and emergency alerts</p>
        </div>
        <button
          onClick={() => {
            setFormData({ title: '', message: '', priority: 'normal', expires_at: '' });
            setEditingId(null);
            setShowForm(true);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
        >
          <Plus size={20} />
          New Announcement
        </button>
      </div>

      {/* Emergency Alert Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="glass-card p-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-lg bg-red-500/20 text-red-400">
              <AlertTriangle size={24} />
            </div>
            <div>
              <p className="text-white/60 text-sm">Active</p>
              <p className="text-white text-2xl font-bold">{activeCount}</p>
            </div>
          </div>
        </div>
        
        <div className="glass-card p-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-lg bg-yellow-500/20 text-yellow-400">
              <AlertTriangle size={24} />
            </div>
            <div>
              <p className="text-white/60 text-sm">Acknowledged</p>
              <p className="text-white text-2xl font-bold">{acknowledgedCount}</p>
            </div>
          </div>
        </div>
        
        <div className="glass-card p-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-lg bg-green-500/20 text-green-400">
              <CheckCircle size={24} />
            </div>
            <div>
              <p className="text-white/60 text-sm">Resolved</p>
              <p className="text-white text-2xl font-bold">{resolvedCount}</p>
            </div>
          </div>
        </div>
        
        <div className="glass-card p-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-lg bg-blue-500/20 text-blue-400">
              <AlertTriangle size={24} />
            </div>
            <div>
              <p className="text-white/60 text-sm">Total</p>
              <p className="text-white text-2xl font-bold">{emergencyAlerts.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="glass-card p-6">
          <h2 className="text-xl font-bold text-white mb-4">
            {editingId ? 'Edit Announcement' : 'New Announcement'}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-white/80 mb-2">Title</label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="w-full px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:border-orange-500"
                required
              />
            </div>
            
            <div>
              <label className="block text-white/80 mb-2">Message</label>
              <textarea
                value={formData.message}
                onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                className="w-full px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:border-orange-500 h-32"
                required
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-white/80 mb-2">Priority</label>
                <select
                  value={formData.priority}
                  onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                  className="w-full px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:border-orange-500"
                >
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
              
              <div>
                <label className="block text-white/80 mb-2">Expires At (Optional)</label>
                <input
                  type="date"
                  value={formData.expires_at}
                  onChange={(e) => setFormData({ ...formData, expires_at: e.target.value })}
                  className="w-full px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:border-orange-500"
                />
              </div>
            </div>
            
            <div className="flex gap-4">
              <button
                type="submit"
                className="px-6 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
              >
                {editingId ? 'Update' : 'Create'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setEditingId(null);
                  setFormData({ title: '', message: '', priority: 'normal', expires_at: '' });
                }}
                className="px-6 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Announcements Section */}
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Megaphone className="text-orange-400" size={20} />
            Announcements
          </h2>

          {/* Announcements List */}
          <div className="glass-card p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-white">Active Announcements</h2>
              <span className="text-white/60">{announcements.length} announcements</span>
            </div>

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
              <div className="space-y-4 max-h-[500px] overflow-y-auto">
                {announcements.map((announcement) => (
                  <div
                    key={announcement.id}
                    className={`p-4 rounded-lg border transition-colors ${
                      isExpired(announcement.expires_at)
                        ? 'bg-white/5 border-white/10 opacity-50'
                        : 'bg-white/10 border-white/20'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <span className={`px-3 py-1 rounded-full text-xs font-medium ${getPriorityColor(announcement.priority)}`}>
                            {announcement.priority}
                          </span>
                          <h3 className="text-white font-semibold">{announcement.title}</h3>
                          {isExpired(announcement.expires_at) && (
                            <span className="px-2 py-1 rounded text-xs text-red-400 bg-red-500/20">Expired</span>
                          )}
                        </div>
                        <p className="text-white/80 mb-3">{announcement.message}</p>
                        <div className="flex items-center gap-4 text-white/60 text-sm">
                          <div className="flex items-center gap-2">
                            <Clock size={14} />
                            <span>{new Date(announcement.created_at).toLocaleString()}</span>
                          </div>
                          {announcement.expires_at && (
                            <span>Expires: {new Date(announcement.expires_at).toLocaleDateString()}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2 ml-4">
                        <button
                          onClick={() => handleEdit(announcement)}
                          className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                          title="Edit"
                        >
                          <Edit size={18} className="text-white/60 hover:text-white" />
                        </button>
                        <button
                          onClick={() => handleDelete(announcement.id)}
                          className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={18} className="text-red-400 hover:text-red-300" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Emergency Alerts Section */}
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <AlertTriangle className="text-red-400" size={20} />
            Emergency History
          </h2>

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
              <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
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
                    {filteredAlerts.map((alert) => (
                      <tr key={alert.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                        <td className="py-4 px-4">
                          <span className={`px-3 py-1 rounded-full text-xs font-medium ${getEmergencyStatusColor(alert.status)}`}>
                            {alert.status}
                          </span>
                        </td>
                        <td className="py-4 px-4">
                          <span className="text-white font-medium">#{alert.bus_number}</span>
                        </td>
                        <td className="py-4 px-4 text-white/80">{alert.route}</td>
                        <td className="py-4 px-4">
                          <div className="flex items-center gap-2 text-white/80">
                            <User size={16} />
                            <span>{alert.conductor_name}</span>
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          {alert.lat && alert.lng ? (
                            <div className="flex items-center gap-2 text-white/80">
                              <MapPin size={16} />
                              <span>{alert.lat.toFixed(4)}, {alert.lng.toFixed(4)}</span>
                            </div>
                          ) : (
                            <span className="text-white/40">No location</span>
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
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
