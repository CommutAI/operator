import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Receipt, Search, DollarSign, Clock, Bus, User, ChevronLeft, ChevronRight } from 'lucide-react';
import { usePagination } from '../hooks/usePagination';

interface QRCard {
  id: string;
  card_uid: string;
  owner_name: string;
  contact_number: string;
  email: string | null;
  balance: number;
  status: string;
  card_type: string;
  purchase_price: number;
  allowed_routes: string[];
  passenger_id: string | null;
  destination: string | null;
  issued_by: string | null;
  issued_at: string;
  expires_at: string;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
}

export default function Transactions() {
  const [cards, setCards] = useState<QRCard[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');

  const { currentPage, itemsPerPage, totalPages, goToPage, nextPage, prevPage, getRange } = usePagination(totalCount, { itemsPerPage: 20 });

  useEffect(() => {
    fetchCards();

    const subscription = supabase
      .channel('card-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'qr_cards' }, fetchCards)
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [statusFilter, typeFilter, currentPage, itemsPerPage]);

  const fetchCards = async () => {
    try {
      setLoading(true);

      // Get total count
      let countQuery = supabase
        .from('qr_cards')
        .select('*', { count: 'exact', head: true });

      if (statusFilter !== 'all') {
        countQuery = countQuery.eq('status', statusFilter);
      }

      if (typeFilter !== 'all') {
        countQuery = countQuery.eq('card_type', typeFilter);
      }

      const { count } = await countQuery;
      setTotalCount(count || 0);

      // Fetch paginated data
      const { from, to } = getRange();

      let query = supabase
        .from('qr_cards')
        .select('*')
        .order('created_at', { ascending: false });

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      if (typeFilter !== 'all') {
        query = query.eq('card_type', typeFilter);
      }

      query = query.range(from, to);

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching cards:', error);
        throw error;
      }

      setCards(data || []);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching cards:', error);
      setCards([]);
      setTotalCount(0);
      setLoading(false);
    }
  };

  const filteredCards = cards.filter(card => {
    const matchesSearch =
      card.card_uid.toLowerCase().includes(searchTerm.toLowerCase()) ||
      card.owner_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (card.contact_number && card.contact_number.includes(searchTerm)) ||
      (card.email && card.email.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesStatus = statusFilter === 'all' || card.status === statusFilter;
    const matchesType = typeFilter === 'all' || card.card_type === typeFilter;

    return matchesSearch && matchesStatus && matchesType;
  });

  const totalBalance = filteredCards.reduce((sum, card) => sum + Number(card.balance), 0);
  const totalCards = filteredCards.length;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'text-green-400 bg-green-500/20';
      case 'inactive': return 'text-gray-400 bg-gray-500/20';
      case 'lost': return 'text-red-400 bg-red-500/20';
      case 'replaced': return 'text-yellow-400 bg-yellow-500/20';
      case 'deactivated': return 'text-purple-400 bg-purple-500/20';
      default: return 'text-white/60 bg-white/10';
    }
  };

  const getCardTypeColor = (type: string) => {
    switch (type) {
      case 'regular': return 'text-blue-400 bg-blue-500/20';
      case 'student': return 'text-purple-400 bg-purple-500/20';
      case 'senior_citizen': return 'text-orange-400 bg-orange-500/20';
      case 'pwd': return 'text-pink-400 bg-pink-500/20';
      default: return 'text-white/60 bg-white/10';
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Card Management</h1>
        <p className="text-white/60">QR card transactions</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="glass-card p-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-lg bg-green-500/20 text-green-400">
              <DollarSign size={24} />
            </div>
            <div>
              <p className="text-white/60 text-sm">Total Balance</p>
              <p className="text-white text-2xl font-bold">₱{totalBalance.toLocaleString()}</p>
            </div>
          </div>
        </div>

        <div className="glass-card p-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-lg bg-blue-500/20 text-blue-400">
              <Receipt size={24} />
            </div>
            <div>
              <p className="text-white/60 text-sm">Total Cards</p>
              <p className="text-white text-2xl font-bold">{totalCards}</p>
            </div>
          </div>
        </div>

        <div className="glass-card p-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-lg bg-purple-500/20 text-purple-400">
              <Bus size={24} />
            </div>
            <div>
              <p className="text-white/60 text-sm">Avg Balance</p>
              <p className="text-white text-2xl font-bold">
                ₱{totalCards > 0 ? (totalBalance / totalCards).toFixed(2) : '0.00'}
              </p>
            </div>
          </div>
        </div>

        <div className="glass-card p-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-lg bg-orange-500/20 text-orange-400">
              <User size={24} />
            </div>
            <div>
              <p className="text-white/60 text-sm">Active Cards</p>
              <p className="text-white text-2xl font-bold">
                {filteredCards.filter(c => c.status === 'active').length}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Card List */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-white">QR Cards</h2>
          <span className="text-white/60">{filteredCards.length} records</span>
        </div>

        {/* Search Bar and Filters */}
        <div className="mb-6 flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/40" size={20} />
            <input
              type="text"
              placeholder="Search by card ID, owner name, or contact number..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-orange-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:border-orange-500"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="lost">Lost</option>
              <option value="replaced">Replaced</option>
              <option value="deactivated">Deactivated</option>
            </select>

            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:border-orange-500"
            >
              <option value="all">All Types</option>
              <option value="regular">Regular</option>
              <option value="student">Student</option>
              <option value="senior_citizen">Senior Citizen</option>
              <option value="pwd">PWD</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-8">
            <div className="text-white">Loading cards...</div>
          </div>
        ) : filteredCards.length === 0 ? (
          <div className="text-center py-8">
            <Receipt className="text-white/20 mx-auto mb-2" size={48} />
            <p className="text-white/40">No cards found</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left py-3 px-4 text-white/60 font-medium">Card ID</th>
                    <th className="text-left py-3 px-4 text-white/60 font-medium">Owner Name</th>
                    <th className="text-left py-3 px-4 text-white/60 font-medium">Contact</th>
                    <th className="text-left py-3 px-4 text-white/60 font-medium">Balance</th>
                    <th className="text-left py-3 px-4 text-white/60 font-medium">Status</th>
                    <th className="text-left py-3 px-4 text-white/60 font-medium">Type</th>
                    <th className="text-left py-3 px-4 text-white/60 font-medium">Destination</th>
                    <th className="text-left py-3 px-4 text-white/60 font-medium">Issued At</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCards.map((card) => (
                    <tr key={card.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                      <td className="py-4 px-4 text-white/80 font-mono text-sm">{card.card_uid}</td>
                      <td className="py-4 px-4 text-white font-medium">{card.owner_name}</td>
                      <td className="py-4 px-4 text-white/80">{card.contact_number}</td>
                      <td className="py-4 px-4">
                        <span className="text-white font-medium">₱{Number(card.balance).toFixed(2)}</span>
                      </td>
                      <td className="py-4 px-4">
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(card.status)}`}>
                          {card.status}
                        </span>
                      </td>
                      <td className="py-4 px-4">
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${getCardTypeColor(card.card_type)}`}>
                          {card.card_type.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-white/80">{card.destination || 'N/A'}</td>
                      <td className="py-4 px-4 text-white/60 text-sm">
                        {new Date(card.issued_at).toLocaleDateString()}
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
                  Showing {currentPage * itemsPerPage + 1} to {Math.min((currentPage + 1) * itemsPerPage, totalCount)} of {totalCount} cards
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={prevPage}
                    disabled={currentPage === 0}
                    className="p-2 rounded-lg bg-white/10 text-white/60 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <span className="text-white/60 text-sm">
                    Page {currentPage + 1} of {totalPages}
                  </span>
                  <button
                    onClick={nextPage}
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
    </div>
  );
}
