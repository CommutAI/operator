import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { 
  Bus, Users, DollarSign, Activity, AlertTriangle, MapPin, Clock, TrendingUp,
  Receipt, Package, UserCheck, ArrowUpRight, Bell
} from 'lucide-react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

interface KPICard {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: any;
  color: string;
}

export default function Dashboard() {
  const [kpiData, setKpiData] = useState({
    activeBuses: 0,
    totalBuses: 0,
    activeTrips: 0,
    currentPassengers: 0,
    totalPassengersToday: 0,
    fareCollectedToday: 0,
    aiPassengerCount: 0,
    qrPassengerCount: 0,
    activeIrregularities: 0,
    busesOnline: 0,
    totalConductors: 0,
    activeConductors: 0,
    totalBaggageToday: 0,
    totalTransactionsToday: 0,
    avgTripDuration: 0,
  });

  const [alerts, setAlerts] = useState<any[]>([]);
  const [revenueData, setRevenueData] = useState<any[]>([]);
  const [passengerData, setPassengerData] = useState<any[]>([]);
  const [tripData, setTripData] = useState<any[]>([]);
  const [recentTransactions, setRecentTransactions] = useState<any[]>([]);
  const [recentActivities, setRecentActivities] = useState<any[]>([]);
  const [busStatusData, setBusStatusData] = useState<any[]>([]);
  const [routePerformance, setRoutePerformance] = useState<any[]>([]);

  useEffect(() => {
    fetchDashboardData();
    
    // @ts-ignore - Supabase callback type issue with async functions
    const subscription = supabase
      .channel('dashboard-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trips' }, () => { void fetchDashboardData(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'emergency_alerts' }, () => { void fetchDashboardData(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fare_irregularities' }, () => { void fetchDashboardData(); })
      .subscribe();

    return () => { subscription.unsubscribe(); };
  }, []);

  const fetchDashboardData = async () => {
    try {
      // Fetch buses
      const { data: buses } = await supabase
        .from('buses')
        .select('status');
      
      const activeBuses = buses?.filter(b => b.status === 'active').length || 0;
      const totalBuses = buses?.length || 0;

      // Fetch active trips
      const { data: trips } = await supabase
        .from('trips')
        .select('*, buses(*), staff_users(*)')
        .eq('status', 'in_progress')
        .order('started_at', { ascending: false })
        .limit(5);

      // Fetch passenger counts for today
      const today = new Date().toISOString().split('T')[0];
      const { data: passengerCounts } = await supabase
        .from('passenger_counts')
        .select('count, ai_count')
        .gte('recorded_at', today);

      const currentPassengers = passengerCounts?.reduce((sum, pc) => sum + (pc.count || 0), 0) || 0;
      const aiPassengerCount = passengerCounts?.reduce((sum, pc) => sum + (pc.ai_count || 0), 0) || 0;

      // Fetch transactions for today
      const { data: transactions } = await supabase
        .from('transactions')
        .select('amount')
        .gte('created_at', today);

      const fareCollectedToday = transactions?.reduce((sum, t) => sum + (Number(t.amount) || 0), 0) || 0;

      // Fetch boarded passengers for QR count
      const { data: boardedPassengers } = await supabase
        .from('boarded_passengers')
        .select('id')
        .gte('boarded_at', today);

      const qrPassengerCount = boardedPassengers?.length || 0;

      // Fetch fare irregularities
      const { data: irregularities } = await supabase
        .from('fare_irregularities')
        .select('*')
        .eq('resolved', false);

      // Fetch emergency alerts
      const { data: emergencyAlerts } = await supabase
        .from('emergency_alerts')
        .select('*')
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(5);

      // Count buses with recent GPS updates (last 5 minutes)
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const { data: tripsWithGPS } = await supabase
        .from('trips')
        .select('id')
        .eq('status', 'in_progress')
        .gte('gps_updated_at', fiveMinutesAgo);

      const busesOnline = tripsWithGPS?.length || 0;

      // Fetch chart data - last 7 days revenue
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: chartTransactions } = await supabase
        .from('transactions')
        .select('amount, type, created_at')
        .gte('created_at', sevenDaysAgo)
        .order('created_at', { ascending: true });

      // Group revenue by date
      const revenueByDate: Record<string, any> = {};
      (chartTransactions || []).forEach((tx: any) => {
        const date = new Date(tx.created_at).toLocaleDateString();
        if (!revenueByDate[date]) {
          revenueByDate[date] = { date, fare: 0, baggage: 0, penalty: 0, total: 0 };
        }
        const amount = Number(tx.amount);
        if (tx.type === 'fare') revenueByDate[date].fare += amount;
        if (tx.type === 'baggage') revenueByDate[date].baggage += amount;
        if (tx.type === 'penalty') revenueByDate[date].penalty += amount;
        revenueByDate[date].total += amount;
      });

      setRevenueData(Object.values(revenueByDate));

      // Fetch passenger data for chart
      const { data: chartPassengers } = await supabase
        .from('passenger_counts')
        .select('count, ai_count, recorded_at')
        .gte('recorded_at', sevenDaysAgo)
        .order('recorded_at', { ascending: true });

      const passengersByDate: Record<string, any> = {};
      (chartPassengers || []).forEach((pc: any) => {
        const date = new Date(pc.recorded_at).toLocaleDateString();
        if (!passengersByDate[date]) {
          passengersByDate[date] = { date, qr: 0, ai: 0 };
        }
        passengersByDate[date].qr += pc.count;
        passengersByDate[date].ai += pc.ai_count || 0;
      });

      setPassengerData(Object.values(passengersByDate));

      // Fetch trip data for chart
      const { data: chartTrips } = await supabase
        .from('trips')
        .select('status, started_at')
        .gte('started_at', sevenDaysAgo)
        .order('started_at', { ascending: true });

      const tripsByDate: Record<string, any> = {};
      (chartTrips || []).forEach((trip: any) => {
        const date = new Date(trip.started_at).toLocaleDateString();
        if (!tripsByDate[date]) {
          tripsByDate[date] = { date, completed: 0, in_progress: 0, cancelled: 0 };
        }
        if (trip.status === 'completed') tripsByDate[date].completed++;
        if (trip.status === 'in_progress') tripsByDate[date].in_progress++;
        if (trip.status === 'cancelled') tripsByDate[date].cancelled++;
      });

      setTripData(Object.values(tripsByDate));

      // Fetch conductors
      const { data: conductors } = await supabase
        .from('staff_users')
        .select('id, is_active')
        .eq('role', 'conductor');

      const totalConductors = conductors?.length || 0;
      const activeConductors = conductors?.filter(c => c.is_active).length || 0;

      // Fetch baggage transactions for today
      const { data: baggageTransactions } = await supabase
        .from('transactions')
        .select('amount')
        .eq('type', 'baggage')
        .gte('created_at', today);

      const totalBaggageToday = baggageTransactions?.reduce((sum, t) => sum + Number(t.amount), 0) || 0;

      // Fetch total transactions for today
      const { data: allTransactions } = await supabase
        .from('transactions')
        .select('id')
        .gte('created_at', today);

      const totalTransactionsToday = allTransactions?.length || 0;

      // Calculate average trip duration
      const completedTrips = (trips || []).filter((t: any) => t.status === 'completed' && t.started_at && t.ended_at);
      const avgTripDuration = completedTrips.length > 0 
        ? completedTrips.reduce((sum: number, t: any) => {
            const duration = (new Date(t.ended_at).getTime() - new Date(t.started_at).getTime()) / 1000 / 60; // minutes
            return sum + duration;
          }, 0) / completedTrips.length
        : 0;

      // Fetch recent transactions
      const { data: recentTx } = await supabase
        .from('transactions')
        .select('amount, type, created_at, qr_cards(card_uid), trips(buses(bus_number, route))')
        .order('created_at', { ascending: false })
        .limit(5);

      setRecentTransactions(recentTx || []);

      // Fetch recent activities
      const { data: activities } = await supabase
        .from('activity_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);

      setRecentActivities(activities || []);

      // Bus status data
      const busStatus = [
        { name: 'Active', value: activeBuses, color: '#22c55e' },
        { name: 'Inactive', value: totalBuses - activeBuses, color: '#ef4444' },
      ];
      setBusStatusData(busStatus);

      // Route performance (mock data - would need actual route data)
      const routePerf = [
        { route: 'Route A', trips: 12, passengers: 450, revenue: 12500 },
        { route: 'Route B', trips: 8, passengers: 320, revenue: 8900 },
        { route: 'Route C', trips: 15, passengers: 580, revenue: 16200 },
        { route: 'Route D', trips: 6, passengers: 240, revenue: 6700 },
      ];
      setRoutePerformance(routePerf);

      setKpiData({
        activeBuses,
        totalBuses,
        activeTrips: trips?.length || 0,
        currentPassengers,
        totalPassengersToday: currentPassengers,
        fareCollectedToday,
        aiPassengerCount,
        qrPassengerCount,
        activeIrregularities: irregularities?.length || 0,
        busesOnline,
        totalConductors,
        activeConductors,
        totalBaggageToday,
        totalTransactionsToday,
        avgTripDuration,
      });

      setAlerts(emergencyAlerts || []);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    }
  };

  const kpiCards: KPICard[] = [
    {
      title: 'Active Buses',
      value: `${kpiData.activeBuses} / ${kpiData.totalBuses}`,
      subtitle: 'Currently operating',
      icon: Bus,
      color: 'text-orange-400',
    },
    {
      title: 'Active Trips',
      value: kpiData.activeTrips,
      subtitle: 'In progress',
      icon: Activity,
      color: 'text-blue-400',
    },
    {
      title: 'Current Passengers',
      value: kpiData.currentPassengers,
      subtitle: `Total today: ${kpiData.totalPassengersToday}`,
      icon: Users,
      color: 'text-green-400',
    },
    {
      title: 'Fare Collected Today',
      value: `₱${kpiData.fareCollectedToday.toLocaleString()}`,
      subtitle: 'Revenue',
      icon: DollarSign,
      color: 'text-yellow-400',
    },
    {
      title: 'Active Conductors',
      value: `${kpiData.activeConductors} / ${kpiData.totalConductors}`,
      subtitle: 'Staff available',
      icon: UserCheck,
      color: 'text-purple-400',
    },
    {
      title: 'Baggage Fees Today',
      value: `₱${kpiData.totalBaggageToday.toLocaleString()}`,
      subtitle: 'Additional revenue',
      icon: Package,
      color: 'text-pink-400',
    },
    {
      title: 'Transactions Today',
      value: kpiData.totalTransactionsToday,
      subtitle: 'QR card scans',
      icon: Receipt,
      color: 'text-cyan-400',
    },
    {
      title: 'Avg Trip Duration',
      value: `${Math.round(kpiData.avgTripDuration)}m`,
      subtitle: 'Trip efficiency',
      icon: Clock,
      color: 'text-indigo-400',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Operations Dashboard</h1>
        <p className="text-white/60">Comprehensive overview of all operations</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        {kpiCards.map((kpi, index) => {
          const Icon = kpi.icon;
          return (
            <div key={index} className="glass-card p-3 hover:bg-white/10 transition-colors">
              <div className="flex items-start justify-between mb-2">
                <div className={`p-2 rounded-lg bg-white/10 ${kpi.color}`}>
                  <Icon size={16} />
                </div>
              </div>
              <h3 className="text-white/60 text-xs font-medium mb-1">{kpi.title}</h3>
              <p className="text-white text-lg font-bold mb-1">{kpi.value}</p>
              {kpi.subtitle && (
                <p className="text-white/40 text-[10px]">{kpi.subtitle}</p>
              )}
            </div>
          );
        })}
      </div>

      {/* Live Operations Summary */}
      <div className="glass-card p-6">
        <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <Activity className="text-orange-400" size={20} />
          Live Operations Summary
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white/5 rounded-lg p-4 border border-white/10">
            <p className="text-white/60 text-sm mb-1">Active Trips</p>
            <p className="text-white text-2xl font-bold">{kpiData.activeTrips}</p>
            <p className="text-green-400 text-xs mt-1 flex items-center gap-1">
              <ArrowUpRight size={12} /> Live tracking
            </p>
          </div>
          <div className="bg-white/5 rounded-lg p-4 border border-white/10">
            <p className="text-white/60 text-sm mb-1">Buses Online</p>
            <p className="text-white text-2xl font-bold">{kpiData.busesOnline}</p>
            <p className="text-cyan-400 text-xs mt-1 flex items-center gap-1">
              <MapPin size={12} /> GPS connected
            </p>
          </div>
          <div className="bg-white/5 rounded-lg p-4 border border-white/10">
            <p className="text-white/60 text-sm mb-1">Current Passengers</p>
            <p className="text-white text-2xl font-bold">{kpiData.currentPassengers}</p>
            <p className="text-blue-400 text-xs mt-1 flex items-center gap-1">
              <Users size={12} /> On board
            </p>
          </div>
        </div>
      </div>

      {/* Revenue & Transactions Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue Chart */}
        <div className="glass-card p-6">
          <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <DollarSign className="text-green-400" size={20} />
            Revenue Trend (7 Days)
          </h2>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={revenueData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
              <XAxis dataKey="date" stroke="rgba(255,255,255,0.6)" />
              <YAxis stroke="rgba(255,255,255,0.6)" />
              <Tooltip
                contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', border: '1px solid rgba(255,255,255,0.2)' }}
                itemStyle={{ color: 'white' }}
                formatter={(value: any) => `₱${Number(value || 0).toLocaleString()}`}
              />
              <Legend />
              <Line type="monotone" dataKey="fare" stroke="#f97316" name="Fare" strokeWidth={2} />
              <Line type="monotone" dataKey="baggage" stroke="#8b5cf6" name="Baggage" strokeWidth={2} />
              <Line type="monotone" dataKey="total" stroke="#22c55e" name="Total" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Recent Transactions */}
        <div className="glass-card p-6">
          <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <Receipt className="text-cyan-400" size={20} />
            Recent Transactions
          </h2>
          {recentTransactions.length > 0 ? (
            <div className="space-y-3">
              {recentTransactions.slice(0, 5).map((tx: any) => (
                <div key={tx.id} className="bg-white/5 rounded-lg p-3 border border-white/10">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-white font-medium">₱{Number(tx.amount).toFixed(2)}</span>
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      tx.type === 'fare' ? 'bg-green-500/20 text-green-400' :
                      tx.type === 'baggage' ? 'bg-orange-500/20 text-orange-400' :
                      'bg-red-500/20 text-red-400'
                    }`}>
                      {tx.type}
                    </span>
                  </div>
                  <p className="text-white/40 text-xs">
                    Bus #{tx.trips?.buses?.bus_number || 'N/A'} • {tx.trips?.buses?.route || 'Unknown'}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-white/40 text-center py-8">No recent transactions</p>
          )}
        </div>
      </div>

      {/* Passenger & Trip Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Passenger Comparison */}
        <div className="glass-card p-6">
          <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <Users className="text-blue-400" size={20} />
            QR vs AI Count (7 Days)
          </h2>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={passengerData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
              <XAxis dataKey="date" stroke="rgba(255,255,255,0.6)" />
              <YAxis stroke="rgba(255,255,255,0.6)" />
              <Tooltip
                contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', border: '1px solid rgba(255,255,255,0.2)' }}
                itemStyle={{ color: 'white' }}
              />
              <Legend />
              <Bar dataKey="qr" fill="#3b82f6" name="QR Count" />
              <Bar dataKey="ai" fill="#8b5cf6" name="AI Count" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Trip Status */}
        <div className="glass-card p-6">
          <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <Activity className="text-orange-400" size={20} />
            Trip Status (7 Days)
          </h2>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={tripData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
              <XAxis dataKey="date" stroke="rgba(255,255,255,0.6)" />
              <YAxis stroke="rgba(255,255,255,0.6)" />
              <Tooltip
                contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', border: '1px solid rgba(255,255,255,0.2)' }}
                itemStyle={{ color: 'white' }}
              />
              <Legend />
              <Bar dataKey="completed" fill="#22c55e" name="Completed" />
              <Bar dataKey="in_progress" fill="#3b82f6" name="In Progress" />
              <Bar dataKey="cancelled" fill="#ef4444" name="Cancelled" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Bus Status & Route Performance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Bus Status */}
        <div className="glass-card p-6">
          <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <Bus className="text-orange-400" size={20} />
            Bus Status
          </h2>
          <ResponsiveContainer width="100%" height={250}>
            <RechartsPieChart>
              <Pie
                data={busStatusData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name} ${percent ? (percent * 100).toFixed(0) : 0}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {busStatusData.map((entry: any, index: number) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', border: '1px solid rgba(255,255,255,0.2)' }}
                itemStyle={{ color: 'white' }}
              />
            </RechartsPieChart>
          </ResponsiveContainer>
        </div>

        {/* Route Performance */}
        <div className="glass-card p-6">
          <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <TrendingUp className="text-purple-400" size={20} />
            Route Performance
          </h2>
          <div className="space-y-3">
            {routePerformance.map((route: any) => (
              <div key={route.route} className="bg-white/5 rounded-lg p-4 border border-white/10">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-white font-medium">{route.route}</span>
                  <span className="text-green-400 text-sm">₱{route.revenue.toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-4 text-white/60 text-sm">
                  <span>{route.trips} trips</span>
                  <span>{route.passengers} passengers</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Alerts & Activity Log */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Emergency Alerts */}
        <div className="glass-card p-6">
          <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <AlertTriangle className="text-red-400" size={20} />
            Emergency Alerts
          </h2>
          {alerts.length > 0 ? (
            <div className="space-y-3">
              {alerts.map((alert) => (
                <div key={alert.id} className="bg-red-500/10 rounded-lg p-4 border border-red-500/30">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-red-400 font-medium">Emergency</span>
                    <span className="text-white/40 text-xs">
                      {new Date(alert.created_at).toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="text-white/80 text-sm">{alert.notes || 'No details'}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-white/40 text-center py-8">No active alerts</p>
          )}
        </div>

        {/* Recent Activity */}
        <div className="glass-card p-6">
          <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <Bell className="text-yellow-400" size={20} />
            Recent Activity
          </h2>
          {recentActivities.length > 0 ? (
            <div className="space-y-3">
              {recentActivities.map((activity: any) => (
                <div key={activity.id} className="bg-white/5 rounded-lg p-3 border border-white/10">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-white font-medium">{activity.action || 'Activity'}</span>
                    <span className="text-white/40 text-xs">
                      {new Date(activity.created_at).toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="text-white/60 text-sm">{activity.details || 'No details'}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-white/40 text-center py-8">No recent activity</p>
          )}
        </div>
      </div>

      {/* Revenue Distribution */}
      <div className="glass-card p-6">
        <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <TrendingUp className="text-purple-400" size={20} />
          Revenue Distribution
        </h2>
        <ResponsiveContainer width="100%" height={250}>
          <RechartsPieChart>
            <Pie
              data={[
                { name: 'Fare', value: revenueData.reduce((sum, d) => sum + (d.fare || 0), 0) },
                { name: 'Baggage', value: revenueData.reduce((sum, d) => sum + (d.baggage || 0), 0) },
                { name: 'Penalty', value: revenueData.reduce((sum, d) => sum + (d.penalty || 0), 0) },
              ]}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={({ name, percent }) => `${name} ${percent ? (percent * 100).toFixed(0) : 0}%`}
              outerRadius={80}
              fill="#8884d8"
              dataKey="value"
            >
              <Cell fill="#f97316" />
              <Cell fill="#8b5cf6" />
              <Cell fill="#ef4444" />
            </Pie>
            <Tooltip
              contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', border: '1px solid rgba(255,255,255,0.2)' }}
              itemStyle={{ color: 'white' }}
              formatter={(value: any) => `₱${Number(value || 0).toLocaleString()}`}
            />
          </RechartsPieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
