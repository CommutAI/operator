import { useState, useEffect, useMemo } from 'react';
import {
  DollarSign,
  Search,
  ArrowUpDown,
  ArrowRightLeft,
  RefreshCw,
  Route,
  CheckCircle2,
  SlidersHorizontal,
  Download,
  X,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { supabase } from '../lib/supabase';

export interface FareItem {
  id: string;
  route_from: string;
  route_to: string;
  km_distance: number | null;
  regular_fare: number | string;
  discounted_fare: number | string;
  created_at?: string;
  updated_at?: string;
}

// Official 19 route stations in topological order (Southbound: Manolo Fortich -> Agora)
export const ROUTE_STATIONS = [
  'Maluko Manolo',
  'Dalirig',
  'Tankulan',
  'Dicklum',
  'San Miguel',
  'Cawayanon',
  'Lunocan',
  'Alae Manolo',
  'Maitum',
  'Balubal',
  'Mambatangan',
  'Bae Upper Puerto',
  'Puerto',
  'Agusan',
  'Tablon',
  'Tablon Baloi',
  'Cugman',
  'Gusa',
  'Agora'
];

const STATION_INDEX_MAP = new Map(
  ROUTE_STATIONS.map((s, idx) => [s.toLowerCase().trim(), idx])
);

/**
 * Returns 'manolo-to-agora', 'agora-to-manolo', or 'other' based on official route station sequence
 */
export const getRouteDirection = (from?: string | null, to?: string | null): 'manolo-to-agora' | 'agora-to-manolo' | 'other' => {
  const fromIdx = STATION_INDEX_MAP.get((from || '').toLowerCase().trim());
  const toIdx = STATION_INDEX_MAP.get((to || '').toLowerCase().trim());
  if (fromIdx !== undefined && toIdx !== undefined) {
    if (fromIdx < toIdx) return 'manolo-to-agora';
    if (fromIdx > toIdx) return 'agora-to-manolo';
  }
  return 'other';
};

export default function FareMatrix() {
  const [fareMatrix, setFareMatrix] = useState<FareItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedRoute, setSelectedRoute] = useState<'all' | 'manolo-to-agora' | 'agora-to-manolo'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(15);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortColumn, setSortColumn] = useState<string>('default');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  useEffect(() => {
    fetchFareMatrix();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedRoute, searchTerm, itemsPerPage]);

  const fetchFareMatrix = async () => {
    try {
      setLoading(true);
      const { data, error } = await (supabase
        .from('fare_matrix')
        .select('*')
        .limit(1000) as any);

      if (error) throw error;
      setFareMatrix(data || []);
    } catch (error) {
      console.error('Error fetching fare matrix:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchFareMatrix();
  };

  // Precomputed directional counts
  const { manoloToAgoraCount, agoraToManoloCount } = useMemo(() => {
    let manolo = 0;
    let agora = 0;
    fareMatrix.forEach(f => {
      const dir = getRouteDirection(f.route_from, f.route_to);
      if (dir === 'manolo-to-agora') manolo++;
      else if (dir === 'agora-to-manolo') agora++;
    });
    return { manoloToAgoraCount: manolo, agoraToManoloCount: agora };
  }, [fareMatrix]);

  // Filtered and sorted fares
  const filteredFares = useMemo(() => {
    let fares = fareMatrix;

    // Filter by route direction
    if (selectedRoute === 'manolo-to-agora') {
      fares = fares.filter(fare => getRouteDirection(fare.route_from, fare.route_to) === 'manolo-to-agora');
    } else if (selectedRoute === 'agora-to-manolo') {
      fares = fares.filter(fare => getRouteDirection(fare.route_from, fare.route_to) === 'agora-to-manolo');
    }

    // Filter by search query
    if (searchTerm.trim()) {
      const searchLower = searchTerm.toLowerCase().trim();
      fares = fares.filter(fare =>
        (fare.route_from || '').toLowerCase().includes(searchLower) ||
        (fare.route_to || '').toLowerCase().includes(searchLower)
      );
    }

    // Apply sorting
    return [...fares].sort((a, b) => {
      if (sortColumn === 'default') {
        const dirA = getRouteDirection(a.route_from, a.route_to);
        const dirB = getRouteDirection(b.route_from, b.route_to);

        // Group Manolo->Agora first, then Agora->Manolo
        if (dirA !== dirB) {
          return dirA === 'manolo-to-agora' ? -1 : 1;
        }

        const idxFromA = STATION_INDEX_MAP.get((a.route_from || '').toLowerCase().trim()) ?? 999;
        const idxFromB = STATION_INDEX_MAP.get((b.route_from || '').toLowerCase().trim()) ?? 999;
        const idxToA = STATION_INDEX_MAP.get((a.route_to || '').toLowerCase().trim()) ?? 999;
        const idxToB = STATION_INDEX_MAP.get((b.route_to || '').toLowerCase().trim()) ?? 999;

        if (dirA === 'manolo-to-agora') {
          if (idxFromA !== idxFromB) return idxFromA - idxFromB;
          return idxToA - idxToB;
        } else {
          if (idxFromA !== idxFromB) return idxFromB - idxFromA;
          return idxToB - idxToA;
        }
      }

      let valA: any = a[sortColumn as keyof FareItem];
      let valB: any = b[sortColumn as keyof FareItem];

      if (sortColumn === 'regular_fare' || sortColumn === 'discounted_fare' || sortColumn === 'km_distance') {
        valA = parseFloat(valA || 0);
        valB = parseFloat(valB || 0);
      } else {
        valA = (valA || '').toString().toLowerCase();
        valB = (valB || '').toString().toLowerCase();
      }

      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [fareMatrix, selectedRoute, searchTerm, sortColumn, sortDirection]);

  // Pagination calculation
  const totalItems = filteredFares.length;
  const isAll = itemsPerPage === -1;
  const effectiveItemsPerPage = isAll ? Math.max(totalItems, 1) : itemsPerPage;
  const totalPages = Math.max(1, Math.ceil(totalItems / effectiveItemsPerPage));

  const paginatedFares = useMemo(() => {
    if (isAll) return filteredFares;
    const start = (currentPage - 1) * effectiveItemsPerPage;
    return filteredFares.slice(start, start + effectiveItemsPerPage);
  }, [filteredFares, currentPage, effectiveItemsPerPage, isAll]);

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  // Export to CSV
  const handleExportCSV = () => {
    const rows = filteredFares.map((f, i) => {
      const dir = getRouteDirection(f.route_from, f.route_to);
      const dirLabel = dir === 'manolo-to-agora' ? 'Manolo ➔ Agora' : dir === 'agora-to-manolo' ? 'Agora ➔ Manolo' : 'Other';
      return [
        i + 1,
        `"${dirLabel}"`,
        `"${f.route_from}"`,
        `"${f.route_to}"`,
        f.km_distance !== null && f.km_distance !== undefined ? f.km_distance : '',
        parseFloat(String(f.regular_fare || 0)).toFixed(2),
        parseFloat(String(f.discounted_fare || 0)).toFixed(2),
      ].join(',');
    });

    const header = ['Item #', 'Direction', 'Stop From', 'Stop To', 'Distance (km)', 'Regular Fare (PHP)', 'Discounted Fare (PHP)'].join(',');
    const csvContent = [header, ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `fare_matrix_${selectedRoute}_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-white text-3xl font-bold mb-2 flex items-center gap-3">
          <DollarSign className="text-orange-400" />
          Fare Matrix
        </h1>
        <div className="glass-card p-12 text-center">
          <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-white/60">Fetching live fare matrix from database...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-white text-2xl lg:text-3xl font-bold mb-1 flex items-center gap-3">
            <DollarSign className="text-orange-400" />
            Fare Matrix
          </h1>
          <p className="text-white/60 text-sm">
            Official LTFRB point-to-point passenger fare schedule ({fareMatrix.length} total station pairs)
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={handleExportCSV}
            className="bg-white/5 hover:bg-white/10 text-white/90 hover:text-white border border-white/15 px-3.5 py-2 rounded-xl flex items-center gap-2 text-sm font-medium transition-all shadow-sm"
            title="Export fare matrix to CSV"
          >
            <Download size={16} className="text-orange-400" />
            <span>Export CSV</span>
          </button>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 hover:text-white border border-white/10 transition-colors"
            title="Refresh fares"
          >
            <RefreshCw size={17} className={refreshing ? 'animate-spin text-orange-400' : ''} />
          </button>
        </div>
      </div>

      {/* Main Container */}
      <div className="glass-card p-4 sm:p-6 space-y-6">
        {/* Route Direction Tabs */}
        <div className="flex flex-wrap items-center gap-2 pb-2 border-b border-white/10">
          <button
            type="button"
            onClick={() => setSelectedRoute('all')}
            className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center gap-2.5 ${
              selectedRoute === 'all'
                ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/25 ring-2 ring-orange-500/40'
                : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white border border-white/10'
            }`}
          >
            <ArrowRightLeft size={16} />
            <span>All Routes</span>
            <span
              className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                selectedRoute === 'all' ? 'bg-black/30 text-white' : 'bg-white/10 text-white/60'
              }`}
            >
              {fareMatrix.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedRoute('manolo-to-agora')}
            className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center gap-2.5 ${
              selectedRoute === 'manolo-to-agora'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/25 ring-2 ring-blue-500/40'
                : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white border border-white/10'
            }`}
          >
            <Route size={16} />
            <span>Manolo Fortich ➔ Agora Terminal</span>
            <span
              className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                selectedRoute === 'manolo-to-agora' ? 'bg-black/30 text-white' : 'bg-white/10 text-white/60'
              }`}
            >
              {manoloToAgoraCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedRoute('agora-to-manolo')}
            className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center gap-2.5 ${
              selectedRoute === 'agora-to-manolo'
                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/25 ring-2 ring-emerald-500/40'
                : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white border border-white/10'
            }`}
          >
            <Route size={16} />
            <span>Agora Terminal ➔ Manolo Fortich</span>
            <span
              className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                selectedRoute === 'agora-to-manolo' ? 'bg-black/30 text-white' : 'bg-white/10 text-white/60'
              }`}
            >
              {agoraToManoloCount}
            </span>
          </button>
        </div>

        {/* Search & Controls Bar */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/40" size={18} />
            <input
              type="text"
              placeholder="Search by station name (e.g. Agora, Puerto, Maluko, Tankulan)..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full bg-white/5 border border-white/15 rounded-xl pl-10 pr-10 py-2.5 text-white text-sm placeholder-white/40 focus:outline-none focus:border-orange-500 transition-colors"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-white/40 hover:text-white p-1"
              >
                <X size={16} />
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-sm text-white/60">
              <SlidersHorizontal size={14} />
              <span>Rows:</span>
              <select
                value={itemsPerPage}
                onChange={e => setItemsPerPage(parseInt(e.target.value, 10))}
                className="bg-gray-800 border border-white/20 rounded-lg px-2.5 py-1.5 text-white text-sm focus:outline-none focus:border-orange-500 cursor-pointer"
              >
                <option value={15}>15</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={-1}>All ({filteredFares.length})</option>
              </select>
            </div>

            <span className="text-white/40 text-sm whitespace-nowrap">
              Showing {filteredFares.length} {filteredFares.length === 1 ? 'fare pair' : 'fare pairs'}
            </span>
          </div>
        </div>

        {/* Route Summary Banner */}
        <div className="bg-white/5 border border-white/10 rounded-xl p-3.5 sm:p-4 flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="text-white text-sm sm:text-base font-bold flex items-center gap-2">
              <CheckCircle2 size={16} className="text-orange-400" />
              {selectedRoute === 'all' && `All Point-to-Point Fares (${filteredFares.length} pairs)`}
              {selectedRoute === 'manolo-to-agora' && `Manolo Fortich Terminal ➔ Agora Terminal (${filteredFares.length} pairs)`}
              {selectedRoute === 'agora-to-manolo' && `Agora Terminal ➔ Manolo Fortich Terminal (${filteredFares.length} pairs)`}
            </h3>
            <p className="text-white/50 text-xs mt-0.5">
              {selectedRoute === 'all' && 'Covering all 19 stations along Bukidnon-CDO corridor in both directions.'}
              {selectedRoute === 'manolo-to-agora' && 'Southbound route from Maluko Manolo down through Agora Terminal (19 stations, 171 pairs).'}
              {selectedRoute === 'agora-to-manolo' && 'Northbound route from Agora Terminal up to Maluko Manolo (19 stations, 171 pairs).'}
            </p>
          </div>
          {sortColumn !== 'default' && (
            <button
              onClick={() => {
                setSortColumn('default');
                setSortDirection('asc');
              }}
              className="text-xs text-orange-400 hover:text-orange-300 underline font-medium"
            >
              Reset to Natural Route Sequence
            </button>
          )}
        </div>

        {/* Fare Table (List View) */}
        {paginatedFares.length > 0 ? (
          <>
            <div className="overflow-x-auto rounded-xl border border-white/10">
              <table className="w-full">
                <thead>
                  <tr className="bg-white/5 border-b border-white/10 text-xs uppercase tracking-wider">
                    <th className="text-left text-white/60 py-3.5 px-4 font-semibold">Direction</th>
                    <th
                      className="text-left text-white/60 py-3.5 px-4 font-semibold cursor-pointer hover:text-white transition-colors"
                      onClick={() => handleSort('route_from')}
                    >
                      <div className="flex items-center gap-2">
                        Stop From
                        {sortColumn === 'route_from' && (
                          <ArrowUpDown size={14} className={`text-orange-400 transition-transform ${sortDirection === 'asc' ? 'rotate-180' : ''}`} />
                        )}
                      </div>
                    </th>
                    <th
                      className="text-left text-white/60 py-3.5 px-4 font-semibold cursor-pointer hover:text-white transition-colors"
                      onClick={() => handleSort('route_to')}
                    >
                      <div className="flex items-center gap-2">
                        Stop To
                        {sortColumn === 'route_to' && (
                          <ArrowUpDown size={14} className={`text-orange-400 transition-transform ${sortDirection === 'asc' ? 'rotate-180' : ''}`} />
                        )}
                      </div>
                    </th>
                    <th
                      className="text-left text-white/60 py-3.5 px-4 font-semibold cursor-pointer hover:text-white transition-colors"
                      onClick={() => handleSort('km_distance')}
                    >
                      <div className="flex items-center gap-2">
                        Distance
                        {sortColumn === 'km_distance' && (
                          <ArrowUpDown size={14} className={`text-orange-400 transition-transform ${sortDirection === 'asc' ? 'rotate-180' : ''}`} />
                        )}
                      </div>
                    </th>
                    <th
                      className="text-left text-white/60 py-3.5 px-4 font-semibold cursor-pointer hover:text-white transition-colors"
                      onClick={() => handleSort('regular_fare')}
                    >
                      <div className="flex items-center gap-2">
                        Regular Fare
                        {sortColumn === 'regular_fare' && (
                          <ArrowUpDown size={14} className={`text-orange-400 transition-transform ${sortDirection === 'asc' ? 'rotate-180' : ''}`} />
                        )}
                      </div>
                    </th>
                    <th
                      className="text-left text-white/60 py-3.5 px-4 font-semibold cursor-pointer hover:text-white transition-colors"
                      onClick={() => handleSort('discounted_fare')}
                    >
                      <div className="flex items-center gap-2">
                        Student / Senior / PWD
                        {sortColumn === 'discounted_fare' && (
                          <ArrowUpDown size={14} className={`text-orange-400 transition-transform ${sortDirection === 'asc' ? 'rotate-180' : ''}`} />
                        )}
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {paginatedFares.map(fare => {
                    const direction = getRouteDirection(fare.route_from, fare.route_to);
                    return (
                      <tr key={fare.id} className="hover:bg-white/5 transition-colors">
                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                              direction === 'manolo-to-agora'
                                ? 'bg-blue-500/15 text-blue-300 border border-blue-500/30'
                                : direction === 'agora-to-manolo'
                                ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                                : 'bg-white/10 text-white/60 border border-white/20'
                            }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                direction === 'manolo-to-agora' ? 'bg-blue-400' : 'bg-emerald-400'
                              }`}
                            />
                            {direction === 'manolo-to-agora'
                              ? 'Manolo ➔ Agora'
                              : direction === 'agora-to-manolo'
                              ? 'Agora ➔ Manolo'
                              : 'Other'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-white font-medium text-sm">{fare.route_from}</td>
                        <td className="py-3 px-4 text-white font-medium text-sm">{fare.route_to}</td>
                        <td className="py-3 px-4 text-white/60 text-sm">
                          {fare.km_distance !== null && fare.km_distance !== undefined && String(fare.km_distance) !== ''
                            ? `${fare.km_distance} km`
                            : '—'}
                        </td>
                        <td className="py-3 px-4 text-white font-semibold text-sm">
                          ₱{parseFloat(String(fare.regular_fare || 0)).toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-emerald-400 font-semibold text-sm">
                          ₱{parseFloat(String(fare.discounted_fare || 0)).toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {!isAll && totalPages > 1 && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pt-2 gap-3">
                <div className="text-white/60 text-xs sm:text-sm">
                  Showing {(currentPage - 1) * effectiveItemsPerPage + 1} to{' '}
                  {Math.min(currentPage * effectiveItemsPerPage, totalItems)} of {totalItems} fare pairs
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                    className="p-1.5 sm:px-3 sm:py-1.5 bg-white/5 hover:bg-white/10 text-white disabled:opacity-40 disabled:cursor-not-allowed rounded-lg border border-white/10 transition-colors text-sm flex items-center gap-1"
                  >
                    <ChevronLeft size={16} />
                    <span className="hidden sm:inline">Prev</span>
                  </button>

                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                      let pageNum: number;
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
                          className={`min-w-[32px] h-8 rounded-lg text-xs font-semibold transition-all ${
                            currentPage === pageNum
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
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                    className="p-1.5 sm:px-3 sm:py-1.5 bg-white/5 hover:bg-white/10 text-white disabled:opacity-40 disabled:cursor-not-allowed rounded-lg border border-white/10 transition-colors text-sm flex items-center gap-1"
                  >
                    <span className="hidden sm:inline">Next</span>
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-12 border border-white/10 rounded-xl bg-white/[0.02]">
            <Route className="text-white/20 mx-auto mb-3" size={40} />
            <p className="text-white font-medium text-base">No fare entries match your criteria</p>
            <p className="text-white/40 text-xs mt-1">Try clearing your search query or selecting a different route direction.</p>
          </div>
        )}
      </div>
    </div>
  );
}
