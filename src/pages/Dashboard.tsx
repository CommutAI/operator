import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Bus, Users, DollarSign, Activity, AlertTriangle, MapPin, Clock } from 'lucide-react';

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
  });

  const [recentTrips, setRecentTrips] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);

  useEffect(() => {
    fetchDashboardData();
    const subscription = supabase
      .channel('dashboard-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trips' }, fetchDashboardData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'emergency_alerts' }, fetchDashboardData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fare_irregularities' }, fetchDashboardData)
      .subscribe();

    return () => subscription.unsubscribe();
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
      });

      setRecentTrips(trips || []);
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
      title: 'AI vs QR Count',
      value: `${kpiData.aiPassengerCount} / ${kpiData.qrPassengerCount}`,
      subtitle: `Difference: ${kpiData.aiPassengerCount - kpiData.qrPassengerCount}`,
      icon: Brain,
      color: 'text-purple-400',
    },
    {
      title: 'Active Irregularities',
      value: kpiData.activeIrregularities,
      subtitle: 'Require attention',
      icon: AlertTriangle,
      color: 'text-red-400',
    },
    {
      title: 'Buses Online',
      value: kpiData.busesOnline,
      subtitle: 'GPS connected',
      icon: MapPin,
      color: 'text-cyan-400',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Operations Dashboard</h1>
        <p className="text-white/60">Real-time transportation monitoring</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {kpiCards.map((kpi, index) => {
          const Icon = kpi.icon;
          return (
            <div key={index} className="glass-card p-6 hover:bg-white/10 transition-colors">
              <div className="flex items-start justify-between mb-4">
                <div className={`p-3 rounded-lg bg-white/10 ${kpi.color}`}>
                  <Icon size={24} />
                </div>
              </div>
              <h3 className="text-white/60 text-sm font-medium mb-1">{kpi.title}</h3>
              <p className="text-white text-2xl font-bold mb-1">{kpi.value}</p>
              {kpi.subtitle && (
                <p className="text-white/40 text-xs">{kpi.subtitle}</p>
              )}
            </div>
          );
        })}
      </div>

      {/* Recent Trips and Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Trips */}
        <div className="glass-card p-6">
          <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <Activity className="text-orange-400" size={20} />
            Active Trips
          </h2>
          {recentTrips.length > 0 ? (
            <div className="space-y-3">
              {recentTrips.map((trip) => (
                <div key={trip.id} className="bg-white/5 rounded-lg p-4 border border-white/10">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-white font-medium">
                      Bus #{trip.buses?.bus_number || 'N/A'}
                    </span>
                    <span className="px-2 py-1 bg-green-500/20 text-green-400 text-xs rounded-full">
                      Active
                    </span>
                  </div>
                  <p className="text-white/60 text-sm mb-1">
                    Route: {trip.buses?.route || 'N/A'}
                  </p>
                  <p className="text-white/40 text-xs flex items-center gap-1">
                    <Clock size={12} />
                    Started: {new Date(trip.started_at).toLocaleTimeString()}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-white/40 text-center py-8">No active trips</p>
          )}
        </div>

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
      </div>
    </div>
  );
}

function Brain({ size, className }: { size: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-4A2.5 2.5 0 0 1 9.5 2Z" />
      <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-4.44-4A2.5 2.5 0 0 0 14.5 2Z" />
    </svg>
  );
}
