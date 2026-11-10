import { useState, useEffect } from 'react';
import { FileText, Download, Calendar, TrendingUp, Users, DollarSign, Bus, Activity, ArrowUp, ArrowDown, Search, ChevronLeft, ChevronRight, Clock, MapPin, CheckCircle, AlertCircle, Settings, X, SortAsc, SortDesc, CreditCard, ShieldAlert, Zap } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface Transaction {
  id: string;
  card_id: string;
  trip_id: string;
  passenger_name: string | null;
  from_stop_id: string | null;
  to_stop_id: string | null;
  fare_amount: string;
  discount_amount: string;
  final_amount: string;
  payment_method: string;
  transaction_type: string;
  status: string;
  recorded_at: string;
  created_at: string;
  amount: string;
  baggage_category: string | null;
  baggage_weight: string | null;
  baggage_fee: string | null;
  channel: string;
  staff_id: string;
  type: string;
  qr_cards?: {
    card_uid: string;
    owner_name: string;
  };
  staff_users?: {
    full_name: string;
  };
  trips?: {
    starting_point: string;
    end_point: string;
    total_passengers: number;
    status: string;
    started_at: string;
    ended_at: string | null;
  };
}

interface Trip {
  id: string;
  schedule_id: string | null;
  bus_id: string;
  route_id: string | null;
  trip_number: string | null;
  conductor_id: string;
  driver_id: string;
  operator_id: string | null;
  shift_id: string | null;
  status: string;
  started_at: string;
  ended_at: string | null;
  current_lat: string | null;
  current_lng: string | null;
  gps_updated_at: string | null;
  current_stop_id: string | null;
  starting_point: string;
  end_point: string;
  total_passengers: number;
  total_fares: string;
  incidents: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  expected_duration_minutes: number;
  buses?: {
    bus_number: number;
    plate_number: string;
    route: string;
  };
  conductor_staff?: {
    full_name: string;
  };
  driver_staff?: {
    full_name: string;
  };
}

interface CardReload {
  id: string;
  card_id: string;
  amount: string;
  reload_method: string;
  reference_number: string | null;
  reload_location: string | null;
  status: string;
  recorded_at: string;
  created_at: string;
  qr_cards?: {
    card_uid: string;
    owner_name: string;
  };
}

interface FareIrregularity {
  id: string;
  trip_id: string;
  type: string;
  description: string;
  detected_at: string;
  resolved: boolean;
  resolved_at: string | null;
  severity: string | null;
  anomaly_type: string | null;
  status: string | null;
  investigation_notes: string | null;
  resolution_notes: string | null;
  escalation_level: number | null;
}

export default function Reports() {
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('trips');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [reportType, setReportType] = useState('trips');
  const [stats, setStats] = useState({
    totalRevenue: 0,
    totalTrips: 0,
    totalPassengers: 0,
    activeBuses: 0,
    avgTripDuration: 0,
    avgRevenuePerTrip: 0,
    avgPassengersPerTrip: 0,
    completedTrips: 0,
    cancelledTrips: 0,
    activeTrips: 0,
  });
  const [recentActivity, setRecentActivity] = useState<Trip[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [transactionSearchTerm, setTransactionSearchTerm] = useState('');
  const [transactionsCurrentPage, setTransactionsCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [transactionSort, setTransactionSort] = useState({ field: 'created_at', direction: 'desc' });
  const [showExportColumns, setShowExportColumns] = useState(false);
  const [selectedExportColumns, setSelectedExportColumns] = useState<string[]>([]);
  const [generatedReport, setGeneratedReport] = useState<any[]>([]);
  const [reportGenerated, setReportGenerated] = useState(false);

  const availableColumns = {
    trips: [
      { id: 'id', label: 'Trip ID' },
      { id: 'bus_id', label: 'Bus ID' },
      { id: 'starting_point', label: 'Start Point' },
      { id: 'end_point', label: 'End Point' },
      { id: 'conductor_id', label: 'Conductor ID' },
      { id: 'driver_id', label: 'Driver ID' },
      { id: 'status', label: 'Status' },
      { id: 'total_passengers', label: 'Passengers' },
      { id: 'total_fares', label: 'Total Fares' },
      { id: 'started_at', label: 'Started At' },
      { id: 'ended_at', label: 'Ended At' },
    ],
    revenue: [
      { id: 'id', label: 'Transaction ID' },
      { id: 'transaction_type', label: 'Type' },
      { id: 'amount', label: 'Amount' },
      { id: 'fare_amount', label: 'Fare' },
      { id: 'baggage_fee', label: 'Baggage Fee' },
      { id: 'payment_method', label: 'Payment Method' },
      { id: 'card_id', label: 'Card ID' },
      { id: 'staff_id', label: 'Staff ID' },
      { id: 'trip_id', label: 'Trip ID' },
      { id: 'created_at', label: 'Created At' },
    ],
    card_reload: [
      { id: 'id', label: 'Reload ID' },
      { id: 'card_id', label: 'Card ID' },
      { id: 'card_uid', label: 'Card UID' },
      { id: 'owner_name', label: 'Card Owner' },
      { id: 'amount', label: 'Amount' },
      { id: 'reload_method', label: 'Reload Method' },
      { id: 'reference_number', label: 'Reference No.' },
      { id: 'reload_location', label: 'Location' },
      { id: 'status', label: 'Status' },
      { id: 'recorded_at', label: 'Recorded At' },
    ],
    irregularity: [
      { id: 'id', label: 'Irregularity ID' },
      { id: 'trip_id', label: 'Trip ID' },
      { id: 'type', label: 'Type' },
      { id: 'anomaly_type', label: 'Anomaly Type' },
      { id: 'severity', label: 'Severity' },
      { id: 'description', label: 'Description' },
      { id: 'status', label: 'Status' },
      { id: 'resolved', label: 'Resolved' },
      { id: 'escalation_level', label: 'Escalation Level' },
      { id: 'investigation_notes', label: 'Investigation Notes' },
      { id: 'resolution_notes', label: 'Resolution Notes' },
      { id: 'detected_at', label: 'Detected At' },
      { id: 'resolved_at', label: 'Resolved At' },
    ],
    anomaly: [
      { id: 'id', label: 'ID' },
      { id: 'trip_id', label: 'Trip ID' },
      { id: 'anomaly_type', label: 'Anomaly Type' },
      { id: 'severity', label: 'Severity' },
      { id: 'description', label: 'Description' },
      { id: 'status', label: 'Status' },
      { id: 'escalation_level', label: 'Escalation Level' },
      { id: 'resolved', label: 'Resolved' },
      { id: 'investigation_notes', label: 'Investigation Notes' },
      { id: 'detected_at', label: 'Detected At' },
    ],
  };

  useEffect(() => {
    fetchStats();
    fetchRecentActivity();
    fetchTransactions();
  }, []);

  useEffect(() => {
    // Initialize with only a few key columns instead of all columns
    if (reportType === 'trips') {
      setSelectedExportColumns(['id', 'bus_id', 'status', 'total_passengers', 'total_fares', 'started_at']);
    } else if (reportType === 'revenue') {
      setSelectedExportColumns(['id', 'transaction_type', 'amount', 'payment_method', 'created_at']);
    } else if (reportType === 'card_reload') {
      setSelectedExportColumns(['id', 'card_uid', 'owner_name', 'amount', 'reload_method', 'status', 'recorded_at']);
    } else if (reportType === 'irregularity') {
      setSelectedExportColumns(['id', 'trip_id', 'type', 'severity', 'status', 'resolved', 'detected_at']);
    } else if (reportType === 'anomaly') {
      setSelectedExportColumns(['id', 'trip_id', 'anomaly_type', 'severity', 'status', 'resolved', 'detected_at']);
    }
    setReportGenerated(false);
    setGeneratedReport([]);
  }, [reportType]);

  useEffect(() => {
    fetchStats();
    fetchRecentActivity();
    fetchTransactions();
  }, []);

  const fetchStats = async () => {
    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const [revenueData, tripsData, passengersData, busesData] = await Promise.all([
        supabase.from('transactions').select('amount, type, created_at').gte('created_at', sevenDaysAgo),
        supabase.from('trips').select('*'),
        supabase.from('passenger_counts').select('count'),
        supabase.from('buses').select('*').eq('status', 'active'),
      ]);

      const totalRevenue = (revenueData.data || []).reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
      const totalTrips = tripsData.data?.length || 0;
      const totalPassengers = (passengersData.data || []).reduce((sum, p) => sum + (p.count || 0), 0);
      const activeBuses = busesData.data?.length || 0;
      const completedTrips = tripsData.data?.filter(t => t.status === 'completed').length || 0;
      const cancelledTrips = tripsData.data?.filter(t => t.status === 'cancelled').length || 0;
      const activeTrips = tripsData.data?.filter(t => t.status === 'in_progress').length || 0;

      const completedTripsWithDuration = tripsData.data?.filter(t => t.status === 'completed' && t.started_at && t.ended_at) || [];
      const avgTripDuration = completedTripsWithDuration.length > 0
        ? completedTripsWithDuration.reduce((sum, t) => sum + (new Date(t.ended_at).getTime() - new Date(t.started_at).getTime()) / 60000, 0) / completedTripsWithDuration.length
        : 0;

      const avgRevenuePerTrip = totalTrips > 0 ? totalRevenue / totalTrips : 0;
      const avgPassengersPerTrip = totalTrips > 0 ? totalPassengers / totalTrips : 0;

      setStats({
        totalRevenue,
        totalTrips,
        totalPassengers,
        activeBuses,
        avgTripDuration,
        avgRevenuePerTrip,
        avgPassengersPerTrip,
        completedTrips,
        cancelledTrips,
        activeTrips,
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
      setStats({
        totalRevenue: 0,
        totalTrips: 0,
        totalPassengers: 0,
        activeBuses: 0,
        avgTripDuration: 0,
        avgRevenuePerTrip: 0,
        avgPassengersPerTrip: 0,
        completedTrips: 0,
        cancelledTrips: 0,
        activeTrips: 0,
      });
    }
  };

  const fetchRecentActivity = async () => {
    try {
      // First try without the join to see if trips exist
      const { data: simpleData, error: simpleError } = await supabase
        .from('trips')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(10);

      if (simpleError) {
        console.error('Supabase error fetching trips (simple):', simpleError);
        setRecentActivity([]);
        return;
      }

      console.log('Fetched trips (simple):', simpleData);

      // If we have trips, try to fetch buses separately
      if (simpleData && simpleData.length > 0) {
        const busIds = simpleData.map(t => t.bus_id).filter(Boolean);
        const { data: busesData } = await supabase
          .from('buses')
          .select('*')
          .in('id', busIds);

        const busesMap = new Map((busesData || []).map(b => [b.id, b]));

        // Merge buses data into trips
        const mergedData = simpleData.map(trip => ({
          ...trip,
          buses: busesMap.get(trip.bus_id) || null
        }));

        console.log('Merged trips with buses:', mergedData);
        setRecentActivity(mergedData);
      } else {
        setRecentActivity(simpleData || []);
      }
    } catch (error) {
      console.error('Error fetching recent activity:', error);
      setRecentActivity([]);
    }
  };

  const fetchTransactions = async () => {
    try {
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setTransactions(data || []);
    } catch (error) {
      console.error('Error fetching transactions:', error);
      setTransactions([]);
    }
  };

  const filteredTransactions = transactions.filter((transaction: Transaction) => {
    const matchesSearch = transaction.channel?.toLowerCase().includes(transactionSearchTerm.toLowerCase()) ||
                         transaction.payment_method?.toLowerCase().includes(transactionSearchTerm.toLowerCase()) ||
                         transaction.transaction_type?.toLowerCase().includes(transactionSearchTerm.toLowerCase()) ||
                         transaction.card_id?.toLowerCase().includes(transactionSearchTerm.toLowerCase()) ||
                         transaction.staff_id?.toLowerCase().includes(transactionSearchTerm.toLowerCase()) ||
                         transaction.id?.toLowerCase().includes(transactionSearchTerm.toLowerCase());
    return matchesSearch;
  }).sort((a: Transaction, b: Transaction) => {
    const aValue = a[transactionSort.field as keyof Transaction];
    const bValue = b[transactionSort.field as keyof Transaction];
    if (transactionSort.direction === 'asc') {
      return (aValue || '') > (bValue || '') ? 1 : -1;
    }
    return (aValue || '') < (bValue || '') ? 1 : -1;
  });

  const transactionsTotalPages = Math.ceil(filteredTransactions.length / itemsPerPage);
  const paginatedTransactions = filteredTransactions.slice(
    (transactionsCurrentPage - 1) * itemsPerPage,
    transactionsCurrentPage * itemsPerPage
  );

  useEffect(() => {
    setTransactionsCurrentPage(1);
  }, [transactionSearchTerm]);

  const transactionTypeColors = {
    fare_validation: 'bg-blue-500/20 text-blue-400 border-blue-500/50',
    fare_payment: 'bg-purple-500/20 text-purple-400 border-purple-500/50',
    baggage_fee: 'bg-orange-500/20 text-orange-400 border-orange-500/50',
  };

  const tabs = [
    { id: 'trips', label: 'Trips', icon: Bus },
    { id: 'transactions', label: 'Transactions', icon: DollarSign },
    { id: 'reports', label: 'Reports', icon: FileText },
  ];

  const handleSort = (field: string) => {
    if (transactionSort.field === field) {
      setTransactionSort({
        field,
        direction: transactionSort.direction === 'asc' ? 'desc' : 'asc'
      });
    } else {
      setTransactionSort({ field, direction: 'asc' });
    }
  };

  const renderSortIcon = (field: string) => {
    if (transactionSort.field !== field) return null;
    return transactionSort.direction === 'asc' ? <SortAsc size={14} /> : <SortDesc size={14} />;
  };

  const generateReport = async () => {
    setLoading(true);
    let reportData: any[] = [];

    console.log('Generating report for type:', reportType);
    console.log('Selected columns:', selectedExportColumns);

    try {
      if (reportType === 'trips') {
        // Fetch trips with minimal fields first
        const { data: tripsData, error: tripsError } = await supabase
          .from('trips')
          .select('id, bus_id, starting_point, end_point, conductor_id, driver_id, status, total_passengers, total_fares, started_at, ended_at')
          .order('started_at', { ascending: false })
          .limit(100);

        if (tripsError) {
          console.error('Supabase error fetching trips:', tripsError);
          throw new Error(tripsError.message || 'Failed to fetch trips data');
        }

        console.log('Trips data from DB:', tripsData);

        if (!tripsData || tripsData.length === 0) {
          alert('No trips found in database');
        } else {
          // Fetch buses separately
          const busIds = tripsData.map(t => t.bus_id).filter(Boolean);
          const { data: busesData } = await supabase
            .from('buses')
            .select('id, bus_number, plate_number')
            .in('id', busIds);

          const busesMap = new Map((busesData || []).map(b => [b.id, b]));

          reportData = tripsData.map((trip: any) => {
            const bus = busesMap.get(trip.bus_id);
            const row: any = {};
            if (selectedExportColumns.includes('id')) row['Trip ID'] = trip.id || 'N/A';
            if (selectedExportColumns.includes('bus_id')) row['Bus ID'] = bus?.bus_number || bus?.plate_number || 'N/A';
            if (selectedExportColumns.includes('starting_point')) row['Start Point'] = trip.starting_point || 'N/A';
            if (selectedExportColumns.includes('end_point')) row['End Point'] = trip.end_point || 'N/A';
            if (selectedExportColumns.includes('conductor_id')) row['Conductor ID'] = trip.conductor_id?.slice(0, 8) || 'N/A';
            if (selectedExportColumns.includes('driver_id')) row['Driver ID'] = trip.driver_id?.slice(0, 8) || 'N/A';
            if (selectedExportColumns.includes('status')) row['Status'] = trip.status || 'N/A';
            if (selectedExportColumns.includes('total_passengers')) row['Passengers'] = trip.total_passengers ?? 'N/A';
            if (selectedExportColumns.includes('total_fares')) row['Total Fares'] = trip.total_fares ?? 'N/A';
            if (selectedExportColumns.includes('started_at')) row['Started At'] = trip.started_at ? new Date(trip.started_at).toLocaleString() : 'N/A';
            if (selectedExportColumns.includes('ended_at')) row['Ended At'] = trip.ended_at ? new Date(trip.ended_at).toLocaleString() : 'N/A';
            return row;
          });
        }
      } else if (reportType === 'revenue') {
        // Fetch transactions with minimal fields
        const { data: transactionsData, error: txError } = await supabase
          .from('transactions')
          .select('id, transaction_type, amount, fare_amount, baggage_fee, payment_method, card_id, staff_id, trip_id, created_at')
          .order('created_at', { ascending: false })
          .limit(100);

        if (txError) {
          console.error('Supabase error fetching transactions:', txError);
          throw new Error(txError.message || 'Failed to fetch transactions data');
        }

        console.log('Transactions data from DB:', transactionsData);

        if (!transactionsData || transactionsData.length === 0) {
          alert('No transactions found in database');
        } else {
          reportData = transactionsData.map((tx: any) => {
            const row: any = {};
            if (selectedExportColumns.includes('id')) row['Transaction ID'] = tx.id || 'N/A';
            if (selectedExportColumns.includes('transaction_type')) row['Type'] = tx.transaction_type || 'N/A';
            if (selectedExportColumns.includes('amount')) row['Amount'] = tx.amount || 'N/A';
            if (selectedExportColumns.includes('fare_amount')) row['Fare'] = tx.fare_amount || 'N/A';
            if (selectedExportColumns.includes('baggage_fee')) row['Baggage Fee'] = tx.baggage_fee || 'N/A';
            if (selectedExportColumns.includes('payment_method')) row['Payment Method'] = tx.payment_method || 'N/A';
            if (selectedExportColumns.includes('card_id')) row['Card ID'] = tx.card_id || 'N/A';
            if (selectedExportColumns.includes('staff_id')) row['Staff ID'] = tx.staff_id || 'N/A';
            if (selectedExportColumns.includes('trip_id')) row['Trip ID'] = tx.trip_id || 'N/A';
            if (selectedExportColumns.includes('created_at')) row['Created At'] = tx.created_at ? new Date(tx.created_at).toLocaleString() : 'N/A';
            return row;
          });
        }
      } else if (reportType === 'card_reload') {
        const { data: reloadData, error: reloadError } = await supabase
          .from('card_reloads')
          .select('id, card_id, amount, reload_method, reference_number, reload_location, status, recorded_at, created_at, qr_cards(card_uid, owner_name)')
          .order('recorded_at', { ascending: false })
          .limit(500);

        if (reloadError) throw new Error(reloadError.message || 'Failed to fetch card reload data');

        if (!reloadData || reloadData.length === 0) {
          alert('No card reload records found in database');
        } else {
          reportData = reloadData.map((r: any) => {
            const row: any = {};
            if (selectedExportColumns.includes('id')) row['Reload ID'] = r.id || 'N/A';
            if (selectedExportColumns.includes('card_id')) row['Card ID'] = r.card_id || 'N/A';
            if (selectedExportColumns.includes('card_uid')) row['Card UID'] = r.qr_cards?.card_uid || 'N/A';
            if (selectedExportColumns.includes('owner_name')) row['Card Owner'] = r.qr_cards?.owner_name || 'N/A';
            if (selectedExportColumns.includes('amount')) row['Amount'] = r.amount ? `₱${Number(r.amount).toFixed(2)}` : 'N/A';
            if (selectedExportColumns.includes('reload_method')) row['Reload Method'] = r.reload_method || 'N/A';
            if (selectedExportColumns.includes('reference_number')) row['Reference No.'] = r.reference_number || 'N/A';
            if (selectedExportColumns.includes('reload_location')) row['Location'] = r.reload_location || 'N/A';
            if (selectedExportColumns.includes('status')) row['Status'] = r.status || 'N/A';
            if (selectedExportColumns.includes('recorded_at')) row['Recorded At'] = r.recorded_at ? new Date(r.recorded_at).toLocaleString() : 'N/A';
            return row;
          });
        }
      } else if (reportType === 'irregularity' || reportType === 'anomaly') {
        const query = reportType === 'anomaly'
          ? supabase.from('fare_irregularities').select('id, trip_id, type, description, detected_at, resolved, resolved_at, severity, anomaly_type, status, investigation_notes, resolution_notes, escalation_level').not('anomaly_type', 'is', null).order('detected_at', { ascending: false }).limit(500)
          : supabase.from('fare_irregularities').select('id, trip_id, type, description, detected_at, resolved, resolved_at, severity, anomaly_type, status, investigation_notes, resolution_notes, escalation_level').order('detected_at', { ascending: false }).limit(500);

        const { data: irData, error: irError } = await query;

        if (irError) throw new Error(irError.message || 'Failed to fetch irregularity data');

        if (!irData || irData.length === 0) {
          alert(`No ${reportType === 'anomaly' ? 'anomaly' : 'irregularity'} records found in database`);
        } else {
          reportData = irData.map((ir: any) => {
            const row: any = {};
            if (selectedExportColumns.includes('id')) row['ID'] = ir.id || 'N/A';
            if (selectedExportColumns.includes('trip_id')) row['Trip ID'] = ir.trip_id || 'N/A';
            if (selectedExportColumns.includes('type')) row['Type'] = ir.type || 'N/A';
            if (selectedExportColumns.includes('anomaly_type')) row['Anomaly Type'] = ir.anomaly_type || 'N/A';
            if (selectedExportColumns.includes('severity')) row['Severity'] = ir.severity || 'N/A';
            if (selectedExportColumns.includes('description')) row['Description'] = ir.description || 'N/A';
            if (selectedExportColumns.includes('status')) row['Status'] = ir.status || 'N/A';
            if (selectedExportColumns.includes('resolved')) row['Resolved'] = ir.resolved ? 'Yes' : 'No';
            if (selectedExportColumns.includes('escalation_level')) row['Escalation Level'] = ir.escalation_level ?? 0;
            if (selectedExportColumns.includes('investigation_notes')) row['Investigation Notes'] = ir.investigation_notes || 'N/A';
            if (selectedExportColumns.includes('resolution_notes')) row['Resolution Notes'] = ir.resolution_notes || 'N/A';
            if (selectedExportColumns.includes('detected_at')) row['Detected At'] = ir.detected_at ? new Date(ir.detected_at).toLocaleString() : 'N/A';
            if (selectedExportColumns.includes('resolved_at')) row['Resolved At'] = ir.resolved_at ? new Date(ir.resolved_at).toLocaleString() : 'N/A';
            return row;
          });
        }
      }

      console.log('Generated report data:', reportData);
      setGeneratedReport(reportData);
      setReportGenerated(true);
      setShowExportColumns(false);
    } catch (error: any) {
      console.error('Error generating report:', error);
      alert(`Error generating report: ${error.message || 'Please try again.'}`);
    } finally {
      setLoading(false);
    }
  };

  const exportToCSV = () => {
    if (!reportGenerated || generatedReport.length === 0) {
      alert('Please generate a report first');
      return;
    }

    const headers = selectedExportColumns.map(colId => {
      const col = availableColumns[reportType as keyof typeof availableColumns]?.find(c => c.id === colId);
      return col ? col.label : colId;
    });
    const rows = generatedReport;
    const fileName = `${reportType}_report`;

    const csvContent = [headers, ...rows.map(r => Object.values(r))].map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileName}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-white text-3xl font-bold mb-2">Reports Dashboard</h1>
          <p className="text-white/60">System analytics and report generation</p>
        </div>
        {activeTab === 'reports' && (
          <div className="flex gap-3">
            <button
              onClick={() => setShowExportColumns(!showExportColumns)}
              className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-xl flex items-center gap-2 transition-colors"
            >
              <Settings size={18} />
              Columns
            </button>
            {!reportGenerated ? (
              <button
                onClick={generateReport}
                className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-xl flex items-center gap-2 transition-colors"
              >
                <FileText size={18} />
                Generate Report
              </button>
            ) : (
              <button
                onClick={exportToCSV}
                className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-xl flex items-center gap-2 transition-colors"
              >
                <Download size={18} />
                Export CSV
              </button>
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="glass-card p-2">
        <div className="flex gap-2">
          {tabs.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 rounded-xl transition-colors ${
                  activeTab === tab.id
                    ? 'bg-orange-500 text-white'
                    : 'text-white/60 hover:bg-white/10 hover:text-white'
                }`}
              >
                <Icon size={18} />
                <span className="font-medium">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Export Column Selector */}
      {showExportColumns && activeTab === 'reports' && (
        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white text-lg font-bold">Select Export Columns</h3>
            <button
              onClick={() => setShowExportColumns(false)}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            >
              <X size={20} className="text-white/70" />
            </button>
          </div>
          <div className="mb-4">
            <label className="text-white/60 text-sm mb-2 block">Report Type</label>
            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value)}
              className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-orange-500"
            >
              <option value="trips">Trips</option>
              <option value="revenue">Revenue</option>
              <option value="card_reload">Card Reloads</option>
              <option value="irregularity">Fare Irregularities</option>
              <option value="anomaly">Anomaly Detections</option>
            </select>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {availableColumns[reportType as keyof typeof availableColumns]?.map(col => (
              <label key={col.id} className="flex items-center gap-2 p-3 bg-white/5 rounded-lg hover:bg-white/10 cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={selectedExportColumns.includes(col.id)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedExportColumns([...selectedExportColumns, col.id]);
                    } else {
                      setSelectedExportColumns(selectedExportColumns.filter(id => id !== col.id));
                    }
                  }}
                  className="w-4 h-4 rounded border-white/20 bg-white/10 text-orange-500 focus:ring-orange-500"
                />
                <span className="text-white/80 text-sm">{col.label}</span>
              </label>
            ))}
          </div>
          <div className="flex gap-2 mt-4">
            <button
              onClick={() => setSelectedExportColumns(availableColumns[reportType as keyof typeof availableColumns]?.map(col => col.id) || [])}
              className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors text-sm"
            >
              Select All
            </button>
            <button
              onClick={() => setSelectedExportColumns([])}
              className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors text-sm"
            >
              Clear All
            </button>
          </div>
        </div>
      )}

      {/* Trips Tab */}
      {activeTab === 'trips' && (
        <div className="glass-card p-6">
          <h2 className="text-white text-xl font-bold mb-4 flex items-center gap-2">
            <Activity className="text-blue-400" />
            Trip History
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left py-3 px-4 text-white/60 font-medium">Trip ID</th>
                  <th className="text-left py-3 px-4 text-white/60 font-medium">Bus ID</th>
                  <th className="text-left py-3 px-4 text-white/60 font-medium">Route</th>
                  <th className="text-left py-3 px-4 text-white/60 font-medium">Conductor ID</th>
                  <th className="text-left py-3 px-4 text-white/60 font-medium">Driver ID</th>
                  <th className="text-left py-3 px-4 text-white/60 font-medium">Status</th>
                  <th className="text-left py-3 px-4 text-white/60 font-medium">Start Point</th>
                  <th className="text-left py-3 px-4 text-white/60 font-medium">End Point</th>
                  <th className="text-left py-3 px-4 text-white/60 font-medium">Passengers</th>
                  <th className="text-left py-3 px-4 text-white/60 font-medium">Total Fares</th>
                  <th className="text-left py-3 px-4 text-white/60 font-medium">Started</th>
                  <th className="text-left py-3 px-4 text-white/60 font-medium">Ended</th>
                </tr>
              </thead>
              <tbody>
                {recentActivity.map((trip) => {
                  const duration = trip.ended_at && trip.started_at
                    ? Math.round((new Date(trip.ended_at).getTime() - new Date(trip.started_at).getTime()) / 60000)
                    : null;
                  return (
                    <tr key={trip.id} className="border-b border-white/5 hover:bg-white/5">
                      <td className="py-4 px-4 text-white/80 font-mono text-sm">{trip.id.slice(0, 8)}...</td>
                      <td className="py-4 px-4 text-white/80 font-mono text-sm">{trip.buses?.bus_number || trip.buses?.plate_number || 'N/A'}</td>
                      <td className="py-4 px-4 text-white/80">{trip.buses?.route || 'Unknown'}</td>
                      <td className="py-4 px-4 text-white/80 font-mono text-sm">{trip.conductor_id?.slice(0, 8) || 'N/A'}...</td>
                      <td className="py-4 px-4 text-white/80 font-mono text-sm">{trip.driver_id?.slice(0, 8) || 'N/A'}...</td>
                      <td className="py-4 px-4">
                        <span className={`px-3 py-1 rounded-full text-xs ${
                          trip.status === 'in_progress' ? 'bg-blue-500/20 text-blue-400' :
                          trip.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                          trip.status === 'cancelled' ? 'bg-red-500/20 text-red-400' :
                          'bg-yellow-500/20 text-yellow-400'
                        }`}>
                          {trip.status}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-white/80">{trip.starting_point || 'N/A'}</td>
                      <td className="py-4 px-4 text-white/80">{trip.end_point || 'N/A'}</td>
                      <td className="py-4 px-4 text-white/80 text-sm">{trip.total_passengers ?? 'N/A'}</td>
                      <td className="py-4 px-4 text-white/80 text-sm">₱{Number(trip.total_fares || 0).toFixed(2)}</td>
                      <td className="py-4 px-4 text-white/60 text-sm">
                        {new Date(trip.started_at).toLocaleString()}
                      </td>
                      <td className="py-4 px-4 text-white/60 text-sm">
                        {trip.ended_at ? new Date(trip.ended_at).toLocaleString() : '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Reports Tab */}
      {activeTab === 'reports' && (
        <div className="glass-card p-6">
          <h2 className="text-white text-xl font-bold mb-4 flex items-center gap-2">
            <FileText className="text-orange-400" />
            Generate Custom Report
          </h2>

          {/* Report Type Selection */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div className={`bg-white/5 border rounded-xl p-6 hover:bg-white/10 transition-colors cursor-pointer ${reportType === 'trips' ? 'border-blue-500/60' : 'border-white/10'}`}
                 onClick={() => setReportType('trips')}>
              <div className="flex items-center gap-3 mb-3">
                <div className="p-3 bg-blue-500/20 rounded-lg">
                  <Bus size={24} className="text-blue-400" />
                </div>
                <div>
                  <h3 className="text-white font-bold">Trips Report</h3>
                  <p className="text-white/60 text-sm">Trip records with bus and conductor info</p>
                </div>
              </div>
            </div>

            <div className={`bg-white/5 border rounded-xl p-6 hover:bg-white/10 transition-colors cursor-pointer ${reportType === 'revenue' ? 'border-green-500/60' : 'border-white/10'}`}
                 onClick={() => setReportType('revenue')}>
              <div className="flex items-center gap-3 mb-3">
                <div className="p-3 bg-green-500/20 rounded-lg">
                  <DollarSign size={24} className="text-green-400" />
                </div>
                <div>
                  <h3 className="text-white font-bold">Revenue Report</h3>
                  <p className="text-white/60 text-sm">Financial transactions and income</p>
                </div>
              </div>
            </div>

            <div className={`bg-white/5 border rounded-xl p-6 hover:bg-white/10 transition-colors cursor-pointer ${reportType === 'card_reload' ? 'border-purple-500/60' : 'border-white/10'}`}
                 onClick={() => setReportType('card_reload')}>
              <div className="flex items-center gap-3 mb-3">
                <div className="p-3 bg-purple-500/20 rounded-lg">
                  <CreditCard size={24} className="text-purple-400" />
                </div>
                <div>
                  <h3 className="text-white font-bold">Card Reloads Report</h3>
                  <p className="text-white/60 text-sm">Card top-up transactions by method and owner</p>
                </div>
              </div>
            </div>

            <div className={`bg-white/5 border rounded-xl p-6 hover:bg-white/10 transition-colors cursor-pointer ${reportType === 'irregularity' ? 'border-red-500/60' : 'border-white/10'}`}
                 onClick={() => setReportType('irregularity')}>
              <div className="flex items-center gap-3 mb-3">
                <div className="p-3 bg-red-500/20 rounded-lg">
                  <ShieldAlert size={24} className="text-red-400" />
                </div>
                <div>
                  <h3 className="text-white font-bold">Fare Irregularities Report</h3>
                  <p className="text-white/60 text-sm">Detected fare evasion and mismatches</p>
                </div>
              </div>
            </div>

            <div className={`bg-white/5 border rounded-xl p-6 hover:bg-white/10 transition-colors cursor-pointer ${reportType === 'anomaly' ? 'border-yellow-500/60' : 'border-white/10'}`}
                 onClick={() => setReportType('anomaly')}>
              <div className="flex items-center gap-3 mb-3">
                <div className="p-3 bg-yellow-500/20 rounded-lg">
                  <Zap size={24} className="text-yellow-400" />
                </div>
                <div>
                  <h3 className="text-white font-bold">Anomaly Detections Report</h3>
                  <p className="text-white/60 text-sm">AI-flagged anomalies from fare irregularities</p>
                </div>
              </div>
            </div>
          </div>

          <div className="mb-6">
            <label className="text-white/60 text-sm mb-2 block">Report Type</label>
            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value)}
              className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-orange-500"
            >
              <option value="trips">Trips</option>
              <option value="revenue">Revenue</option>
              <option value="card_reload">Card Reloads</option>
              <option value="irregularity">Fare Irregularities</option>
              <option value="anomaly">Anomaly Detections</option>
            </select>
          </div>

          <div className="mt-6 flex gap-3">
            <button
              onClick={generateReport}
              className="flex-1 bg-blue-500 hover:bg-blue-600 text-white px-4 py-3 rounded-xl flex items-center justify-center gap-2 transition-colors font-medium"
            >
              <FileText size={18} />
              Generate Report
            </button>
          </div>

          {/* Generated Report Preview */}
          {reportGenerated && generatedReport.length > 0 && (
            <div className="mt-8">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-white text-lg font-bold flex items-center gap-2">
                  <CheckCircle size={20} className="text-green-400" />
                  Generated Report Preview ({generatedReport.length} records)
                </h3>
                <button
                  onClick={exportToCSV}
                  className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-xl flex items-center gap-2 transition-colors"
                >
                  <Download size={18} />
                  Export CSV
                </button>
              </div>
              <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <table className="w-full">
                  <thead className="sticky top-0 bg-gray-900">
                    <tr className="border-b border-white/10">
                      {selectedExportColumns.map(colId => {
                        const col = availableColumns[reportType as keyof typeof availableColumns]?.find(c => c.id === colId);
                        return (
                          <th key={colId} className="text-left py-3 px-4 text-white/60 font-medium whitespace-nowrap">
                            {col?.label || colId}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {generatedReport.map((row, idx) => (
                      <tr key={idx} className="border-b border-white/5 hover:bg-white/5">
                        {selectedExportColumns.map(colId => {
                          const col = availableColumns[reportType as keyof typeof availableColumns]?.find(c => c.id === colId);
                          const label = col?.label || colId;
                          return (
                            <td key={colId} className="py-3 px-4 text-white/80 text-sm whitespace-nowrap">
                              {row[label] ?? 'N/A'}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Transactions Tab */}
      {activeTab === 'transactions' && (
        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-white text-xl font-bold flex items-center gap-2">
              <DollarSign className="text-green-400" />
              Transaction History
            </h2>
            <span className="text-white/60">{filteredTransactions.length} records</span>
          </div>

          <div className="mb-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/40" size={20} />
              <input
                type="text"
                placeholder="Search transactions..."
                value={transactionSearchTerm}
                onChange={(e) => setTransactionSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-orange-500"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left py-3 px-4 text-white/60 font-medium cursor-pointer hover:text-white transition-colors" onClick={() => handleSort('transaction_type')}>
                    <div className="flex items-center gap-2">
                      Type
                      {renderSortIcon('transaction_type')}
                    </div>
                  </th>
                  <th className="text-left py-3 px-4 text-white/60 font-medium cursor-pointer hover:text-white transition-colors" onClick={() => handleSort('amount')}>
                    <div className="flex items-center gap-2">
                      Amount
                      {renderSortIcon('amount')}
                    </div>
                  </th>
                  <th className="text-left py-3 px-4 text-white/60 font-medium cursor-pointer hover:text-white transition-colors" onClick={() => handleSort('payment_method')}>
                    <div className="flex items-center gap-2">
                      Payment Method
                      {renderSortIcon('payment_method')}
                    </div>
                  </th>
                  <th className="text-left py-3 px-4 text-white/60 font-medium">Card ID</th>
                  <th className="text-left py-3 px-4 text-white/60 font-medium">Staff ID</th>
                  <th className="text-left py-3 px-4 text-white/60 font-medium">Trip ID</th>
                  <th className="text-left py-3 px-4 text-white/60 font-medium">Baggage</th>
                  <th className="text-left py-3 px-4 text-white/60 font-medium cursor-pointer hover:text-white transition-colors" onClick={() => handleSort('created_at')}>
                    <div className="flex items-center gap-2">
                      Time
                      {renderSortIcon('created_at')}
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginatedTransactions.map((tx: Transaction) => (
                  <tr key={tx.id} className="border-b border-white/5 hover:bg-white/5">
                    <td className="py-4 px-4">
                      <span className={`px-3 py-1 rounded-full text-xs border ${transactionTypeColors[tx.transaction_type as keyof typeof transactionTypeColors] || 'bg-gray-500/20 text-gray-400'}`}>
                        {tx.transaction_type}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-white font-medium">₱{Number(tx.amount).toFixed(2)}</td>
                    <td className="py-4 px-4 text-white/80 capitalize">{tx.payment_method.replace('_', ' ')}</td>
                    <td className="py-4 px-4 text-white/80 font-mono text-sm">{tx.card_id?.slice(0, 8) || 'N/A'}...</td>
                    <td className="py-4 px-4 text-white/80 font-mono text-sm">{tx.staff_id?.slice(0, 8) || 'N/A'}...</td>
                    <td className="py-4 px-4 text-white/80 font-mono text-sm">{tx.trip_id?.slice(0, 8) || 'N/A'}...</td>
                    <td className="py-4 px-4 text-white/80">
                      {tx.baggage_category ? `${tx.baggage_category} (${tx.baggage_weight}kg)` : 'N/A'}
                    </td>
                    <td className="py-4 px-4 text-white/60 text-sm">
                      {new Date(tx.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {transactionsTotalPages > 1 && (
            <div className="flex items-center justify-between pt-4 border-t border-white/10 mt-4">
              <span className="text-white/60 text-sm">
                Showing {((transactionsCurrentPage - 1) * itemsPerPage) + 1} to {Math.min(transactionsCurrentPage * itemsPerPage, filteredTransactions.length)} of {filteredTransactions.length} transactions
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setTransactionsCurrentPage(Math.max(1, transactionsCurrentPage - 1))}
                  disabled={transactionsCurrentPage === 1}
                  className="p-2 rounded-lg bg-white/10 text-white/60 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="text-white/60 text-sm">
                  Page {transactionsCurrentPage} of {transactionsTotalPages}
                </span>
                <button
                  onClick={() => setTransactionsCurrentPage(Math.min(transactionsTotalPages, transactionsCurrentPage + 1))}
                  disabled={transactionsCurrentPage === transactionsTotalPages}
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
