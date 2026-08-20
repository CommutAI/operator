import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { supabase } from '../lib/supabase';
import { Bus, Users, Clock, Activity } from 'lucide-react';
import L from 'leaflet';

// Fix for default marker icons in Leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface BusLocation {
  id: string;
  trip_id: string;
  bus_number: number;
  route: string;
  conductor_name: string;
  lat: number;
  lng: number;
  passengers: number;
  capacity: number;
  speed?: number;
  gps_updated_at: string;
  status: string;
}

function MapView({ buses, selectedBus, setSelectedBus }: { 
  buses: BusLocation[]; 
  selectedBus: BusLocation | null;
  setSelectedBus: (bus: BusLocation | null) => void;
}) {
  const map = useMap();

  useEffect(() => {
    if (selectedBus) {
      map.setView([selectedBus.lat, selectedBus.lng], 15);
    }
  }, [selectedBus, map]);

  return (
    <>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {buses.map((bus) => (
        <Marker
          key={bus.id}
          position={[bus.lat, bus.lng]}
          eventHandlers={{
            click: () => setSelectedBus(bus),
          }}
        >
          <Popup>
            <div className="p-2 min-w-[200px]">
              <h3 className="font-bold text-lg mb-2">Bus #{bus.bus_number}</h3>
              <div className="space-y-1 text-sm">
                <p><strong>Route:</strong> {bus.route}</p>
                <p><strong>Conductor:</strong> {bus.conductor_name}</p>
                <p><strong>Passengers:</strong> {bus.passengers}/{bus.capacity}</p>
                <p><strong>Status:</strong> {bus.status}</p>
                <p className="text-gray-500 text-xs">
                  Last update: {new Date(bus.gps_updated_at).toLocaleTimeString()}
                </p>
              </div>
            </div>
          </Popup>
        </Marker>
      ))}
    </>
  );
}

export default function LiveOperations() {
  const [buses, setBuses] = useState<BusLocation[]>([]);
  const [selectedBus, setSelectedBus] = useState<BusLocation | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchBusLocations();
    
    // Subscribe to real-time updates
    const subscription = supabase
      .channel('bus-locations')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'trips',
        },
        fetchBusLocations
      )
      .subscribe();

    // Refresh every 30 seconds
    const interval = setInterval(fetchBusLocations, 30000);

    return () => {
      subscription.unsubscribe();
      clearInterval(interval);
    };
  }, []);

  const fetchBusLocations = async () => {
    try {
      const { data: trips, error } = await supabase
        .from('trips')
        .select(`
          id,
          current_lat,
          current_lng,
          gps_updated_at,
          status,
          buses (
            id,
            bus_number,
            route,
            seat_capacity
          ),
          conductor:staff_users!trips_conductor_id_fkey (
            full_name
          ),
          passenger_counts (
            count
          )
        `)
        .eq('status', 'in_progress')
        .not('current_lat', 'is', null)
        .not('current_lng', 'is', null);

      if (error) throw error;

      const busLocations: BusLocation[] = (trips || []).map((trip: any) => ({
        id: trip.id,
        trip_id: trip.id,
        bus_number: trip.buses?.bus_number || 0,
        route: trip.buses?.route || 'Unknown',
        conductor_name: trip.conductor?.full_name || 'Unknown',
        lat: trip.current_lat || 0,
        lng: trip.current_lng || 0,
        passengers: trip.passenger_counts?.[0]?.count || 0,
        capacity: trip.buses?.seat_capacity || 50,
        gps_updated_at: trip.gps_updated_at || new Date().toISOString(),
        status: trip.status,
      }));

      setBuses(busLocations);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching bus locations:', error);
      setLoading(false);
    }
  };

  const getGPSStatus = (updatedAt: string) => {
    const now = new Date();
    const update = new Date(updatedAt);
    const diff = (now.getTime() - update.getTime()) / 1000; // seconds

    if (diff < 60) return { status: 'Connected', color: 'text-green-400' };
    if (diff < 300) return { status: 'Recent', color: 'text-yellow-400' };
    return { status: 'Delayed', color: 'text-red-400' };
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Live Operations Map</h1>
        <p className="text-white/60">Real-time bus tracking and monitoring</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Map */}
        <div className="lg:col-span-3">
          <div className="glass-card p-4 h-[600px]">
            {loading ? (
              <div className="h-full flex items-center justify-center">
                <div className="text-white">Loading map...</div>
              </div>
            ) : (
              <MapContainer
                center={[8.4, 124.6]} // Approximate center of Mindanao
                zoom={10}
                style={{ height: '100%', width: '100%' }}
                className="rounded-lg"
              >
                <MapView buses={buses} selectedBus={selectedBus} setSelectedBus={setSelectedBus} />
              </MapContainer>
            )}
          </div>
        </div>

        {/* Bus List */}
        <div className="lg:col-span-1">
          <div className="glass-card p-4 h-[600px] overflow-hidden flex flex-col">
            <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
              <Bus className="text-orange-400" size={20} />
              Active Buses ({buses.length})
            </h2>
            
            <div className="flex-1 overflow-y-auto space-y-3">
              {buses.map((bus) => {
                const gpsStatus = getGPSStatus(bus.gps_updated_at);
                const isSelected = selectedBus?.id === bus.id;
                
                return (
                  <div
                    key={bus.id}
                    onClick={() => setSelectedBus(bus)}
                    className={`p-4 rounded-lg cursor-pointer transition-colors ${
                      isSelected 
                        ? 'bg-orange-500/20 border border-orange-500/30' 
                        : 'bg-white/5 hover:bg-white/10 border border-white/10'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-white font-medium">Bus #{bus.bus_number}</span>
                      <span className={`text-xs ${gpsStatus.color}`}>{gpsStatus.status}</span>
                    </div>
                    <p className="text-white/60 text-sm mb-2">{bus.route}</p>
                    <div className="flex items-center gap-2 text-white/40 text-xs">
                      <Users size={12} />
                      <span>{bus.passengers}/{bus.capacity}</span>
                    </div>
                    <div className="flex items-center gap-2 text-white/40 text-xs mt-1">
                      <Clock size={12} />
                      <span>{new Date(bus.gps_updated_at).toLocaleTimeString()}</span>
                    </div>
                  </div>
                );
              })}
              
              {buses.length === 0 && (
                <div className="text-center py-8">
                  <Bus className="text-white/20 mx-auto mb-2" size={32} />
                  <p className="text-white/40 text-sm">No active buses</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Selected Bus Details */}
      {selectedBus && (
        <div className="glass-card p-6">
          <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <Activity className="text-orange-400" size={20} />
            Bus Details - #{selectedBus.bus_number}
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white/5 rounded-lg p-4 border border-white/10">
              <p className="text-white/60 text-sm mb-1">Route</p>
              <p className="text-white font-medium">{selectedBus.route}</p>
            </div>
            
            <div className="bg-white/5 rounded-lg p-4 border border-white/10">
              <p className="text-white/60 text-sm mb-1">Conductor</p>
              <p className="text-white font-medium">{selectedBus.conductor_name}</p>
            </div>
            
            <div className="bg-white/5 rounded-lg p-4 border border-white/10">
              <p className="text-white/60 text-sm mb-1">Passengers</p>
              <p className="text-white font-medium">{selectedBus.passengers} / {selectedBus.capacity}</p>
            </div>
            
            <div className="bg-white/5 rounded-lg p-4 border border-white/10">
              <p className="text-white/60 text-sm mb-1">GPS Status</p>
              <p className={`font-medium ${getGPSStatus(selectedBus.gps_updated_at).color}`}>
                {getGPSStatus(selectedBus.gps_updated_at).status}
              </p>
            </div>
            
            <div className="bg-white/5 rounded-lg p-4 border border-white/10">
              <p className="text-white/60 text-sm mb-1">Latitude</p>
              <p className="text-white font-medium">{selectedBus.lat.toFixed(6)}</p>
            </div>
            
            <div className="bg-white/5 rounded-lg p-4 border border-white/10">
              <p className="text-white/60 text-sm mb-1">Longitude</p>
              <p className="text-white font-medium">{selectedBus.lng.toFixed(6)}</p>
            </div>
            
            <div className="bg-white/5 rounded-lg p-4 border border-white/10">
              <p className="text-white/60 text-sm mb-1">Trip Status</p>
              <p className="text-white font-medium capitalize">{selectedBus.status}</p>
            </div>
            
            <div className="bg-white/5 rounded-lg p-4 border border-white/10">
              <p className="text-white/60 text-sm mb-1">Last Update</p>
              <p className="text-white font-medium">{new Date(selectedBus.gps_updated_at).toLocaleString()}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
