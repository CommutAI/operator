import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { History, Search, Clock, User, FileText, ChevronLeft, ChevronRight, ArrowUp, ArrowDown } from 'lucide-react';

interface ActivityLog {
  id: string;
  operator_name: string;
  action: string;
  table_name: string;
  record_id?: string;
  created_at: string;
}

export default function ActivityLog() {
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [sortColumn, setSortColumn] = useState<'created_at' | 'action' | 'operator_name' | 'table_name'>('created_at');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    fetchActivityLogs();

    const subscription = supabase
      .channel('audit-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'audit_logs' }, fetchActivityLogs)
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  const fetchActivityLogs = async () => {
    try {
      const { data, error } = await supabase
        .from('audit_logs')
        .select(`
          id,
          action,
          module,
          details,
          ip_address,
          created_at,
          username
        `)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;

      const logs: ActivityLog[] = (data || []).map((log: any) => ({
        id: log.id,
        operator_name: log.username || 'System',
        action: log.action,
        table_name: log.module || 'N/A',
        record_id: log.details,
        created_at: log.created_at,
      }));

      setActivityLogs(logs);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching activity logs:', error);
      setLoading(false);
    }
  };

  const filteredLogs = activityLogs.filter(log => {
    return (
      log.operator_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.table_name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }).sort((a, b) => {
    let comparison = 0;
    switch (sortColumn) {
      case 'created_at':
        comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        break;
      case 'action':
        comparison = a.action.localeCompare(b.action);
        break;
      case 'operator_name':
        comparison = a.operator_name.localeCompare(b.operator_name);
        break;
      case 'table_name':
        comparison = a.table_name.localeCompare(b.table_name);
        break;
    }
    return sortDirection === 'asc' ? comparison : -comparison;
  });

  const totalPages = Math.ceil(filteredLogs.length / itemsPerPage);
  const paginatedLogs = filteredLogs.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handleSort = (column: typeof sortColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const getActionColor = (action: string) => {
    switch (action) {
      case 'INSERT': return 'text-green-400 bg-green-500/20';
      case 'UPDATE': return 'text-yellow-400 bg-yellow-500/20';
      case 'DELETE': return 'text-red-400 bg-red-500/20';
      default: return 'text-white/60 bg-white/10';
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Audit Logs</h1>
        <p className="text-white/60">Audit logs history</p>
      </div>

      {/* Filters */}
      <div className="glass-card p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/40" size={20} />
          <input
            type="text"
            placeholder="Search by operator, action, or table..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-orange-500"
          />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="glass-card p-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-lg bg-blue-500/20 text-blue-400">
              <History size={24} />
            </div>
            <div>
              <p className="text-white/60 text-sm">Total Actions</p>
              <p className="text-white text-2xl font-bold">{activityLogs.length}</p>
            </div>
          </div>
        </div>
        
        <div className="glass-card p-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-lg bg-green-500/20 text-green-400">
              <FileText size={24} />
            </div>
            <div>
              <p className="text-white/60 text-sm">Inserts</p>
              <p className="text-white text-2xl font-bold">
                {activityLogs.filter(l => l.action === 'INSERT').length}
              </p>
            </div>
          </div>
        </div>
        
        <div className="glass-card p-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-lg bg-yellow-500/20 text-yellow-400">
              <FileText size={24} />
            </div>
            <div>
              <p className="text-white/60 text-sm">Updates</p>
              <p className="text-white text-2xl font-bold">
                {activityLogs.filter(l => l.action === 'UPDATE').length}
              </p>
            </div>
          </div>
        </div>
        
        <div className="glass-card p-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-lg bg-red-500/20 text-red-400">
              <FileText size={24} />
            </div>
            <div>
              <p className="text-white/60 text-sm">Deletes</p>
              <p className="text-white text-2xl font-bold">
                {activityLogs.filter(l => l.action === 'DELETE').length}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Activity Log List */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">Recent Activity</h2>
          <span className="text-white/60">{filteredLogs.length} records</span>
        </div>

        {loading ? (
          <div className="text-center py-8">
            <div className="text-white">Loading activity logs...</div>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="text-center py-8">
            <History className="text-white/20 mx-auto mb-2" size={48} />
            <p className="text-white/40">No activity logs found</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/10">
                    <th
                      className="text-left py-3 px-4 text-white/60 font-medium cursor-pointer hover:text-white transition-colors"
                      onClick={() => handleSort('action')}
                    >
                      <div className="flex items-center gap-2">
                        Action
                        {sortColumn === 'action' && (
                          sortDirection === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />
                        )}
                      </div>
                    </th>
                    <th
                      className="text-left py-3 px-4 text-white/60 font-medium cursor-pointer hover:text-white transition-colors"
                      onClick={() => handleSort('operator_name')}
                    >
                      <div className="flex items-center gap-2">
                        Operator
                        {sortColumn === 'operator_name' && (
                          sortDirection === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />
                        )}
                      </div>
                    </th>
                    <th
                      className="text-left py-3 px-4 text-white/60 font-medium cursor-pointer hover:text-white transition-colors"
                      onClick={() => handleSort('table_name')}
                    >
                      <div className="flex items-center gap-2">
                        Table
                        {sortColumn === 'table_name' && (
                          sortDirection === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />
                        )}
                      </div>
                    </th>
                    <th className="text-left py-3 px-4 text-white/60 font-medium">Record ID</th>
                    <th
                      className="text-left py-3 px-4 text-white/60 font-medium cursor-pointer hover:text-white transition-colors"
                      onClick={() => handleSort('created_at')}
                    >
                      <div className="flex items-center gap-2">
                        Time
                        {sortColumn === 'created_at' && (
                          sortDirection === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />
                        )}
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedLogs.map((log) => (
                    <tr key={log.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                      <td className="py-4 px-4">
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${getActionColor(log.action)}`}>
                          {log.action}
                        </span>
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-2 text-white/80">
                          <User size={16} />
                          <span>{log.operator_name}</span>
                        </div>
                      </td>
                      <td className="py-4 px-4 text-white/80 font-mono text-sm">{log.table_name}</td>
                      <td className="py-4 px-4 text-white/60 font-mono text-sm">
                        {log.record_id ? log.record_id.slice(0, 8) + '...' : '-'}
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-2 text-white/60">
                          <Clock size={16} />
                          <span>{new Date(log.created_at).toLocaleString()}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-6 pt-4 border-t border-white/10">
                <div className="text-white/60 text-sm">
                  Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, filteredLogs.length)} of {filteredLogs.length} records
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                    className="p-2 rounded-lg bg-white/10 text-white/60 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft size={20} />
                  </button>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum;
                      if (totalPages <= 5) {
                        pageNum = i + 1;
                      } else if (currentPage <= 3) {
                        pageNum = i + 1;
                      } else if (currentPage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i;
                      } else {
                        pageNum = currentPage - 2 + i;
                      }
                      return (
                        <button
                          key={pageNum}
                          onClick={() => setCurrentPage(pageNum)}
                          className={`px-3 py-1 rounded-lg text-sm transition-colors ${
                            currentPage === pageNum
                              ? 'bg-orange-500 text-white'
                              : 'bg-white/10 text-white/60 hover:bg-white/20'
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                  </div>
                  <button
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                    className="p-2 rounded-lg bg-white/10 text-white/60 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronRight size={20} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
