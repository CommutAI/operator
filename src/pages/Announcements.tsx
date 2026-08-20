import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Megaphone, Plus, Clock, Trash2, Edit } from 'lucide-react';

interface Announcement {
  id: string;
  title: string;
  message: string;
  priority: string;
  created_at: string;
  created_by?: string;
  expires_at?: string;
}

export default function Announcements() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    message: '',
    priority: 'normal',
    expires_at: '',
  });

  useEffect(() => {
    fetchAnnouncements();
    
    const subscription = supabase
      .channel('announcements-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'announcements' }, fetchAnnouncements)
      .subscribe();

    return () => {
      subscription.unsubscribe();
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Announcements</h1>
          <p className="text-white/60">Manage system-wide announcements</p>
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

      {/* Announcements List */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">Active Announcements</h2>
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
          <div className="space-y-4">
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
  );
}
