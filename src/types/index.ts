export interface StaffUser {
  id: string;
  full_name: string;
  email: string;
  role: 'admin' | 'conductor' | 'cs_desk' | 'operator';
  is_active: boolean;
  created_at: string;
}

export interface Bus {
  id: string;
  plate_number: string;
  bus_number: number;
  route: string;
  seat_capacity: number;
  status: 'active' | 'maintenance' | 'inactive';
  created_at: string;
}

export interface Trip {
  id: string;
  bus_id: string;
  conductor_id: string;
  operator_id?: string;
  started_at: string;
  ended_at?: string;
  status: 'in_progress' | 'completed' | 'cancelled';
  current_lat?: number;
  current_lng?: number;
  gps_updated_at?: string;
}

export interface QRCard {
  id: string;
  card_uid: string;
  owner_name: string;
  contact_number?: string;
  balance: number;
  status: 'active' | 'lost' | 'replaced' | 'deactivated';
  card_type: 'regular' | 'student' | 'senior_citizen' | 'pwd';
  purchase_price: number;
  allowed_routes: string[];
  passenger_id?: string;
  issued_by?: string;
  created_at: string;
}

export interface TemporaryTicket {
  id: string;
  ticket_uid: string;
  fare_amount: number;
  status: 'issued' | 'validated' | 'expired';
  allowed_routes: string[];
  passenger_id?: string;
  trip_id?: string;
  issued_by?: string;
  issued_at: string;
  validated_at?: string;
}

export interface Transaction {
  id: string;
  card_id?: string;
  temp_ticket_id?: string;
  trip_id?: string;
  type: 'fare_validation' | 'balance_topup' | 'card_issuance';
  amount: number;
  channel: string;
  staff_id?: string;
  created_at: string;
}

export interface PassengerCount {
  id: string;
  trip_id: string;
  count: number;
  ai_count?: number;
  source: 'manual' | 'ai' | 'scan';
  recorded_at: string;
}

export interface BoardedPassenger {
  id: string;
  trip_id: string;
  passenger_id?: string;
  card_id?: string;
  temp_ticket_id?: string;
  boarded_at: string;
}

export interface FareIrregularity {
  id: string;
  trip_id: string;
  type: 'double_scan' | 'count_mismatch' | 'fare_evasion' | 'other';
  description: string;
  detected_at: string;
  resolved: boolean;
  resolved_by?: string;
  resolved_at?: string;
}

export interface EmergencyAlert {
  id: string;
  trip_id: string;
  conductor_id: string;
  bus_id?: string;
  lat?: number;
  lng?: number;
  status: 'active' | 'acknowledged' | 'resolved';
  notes?: string;
  created_at: string;
  acknowledged_at?: string;
  acknowledged_by?: string;
  resolved_at?: string;
}

export interface Announcement {
  id: string;
  title: string;
  message: string;
  priority: 'low' | 'normal' | 'high' | 'emergency';
  is_public: boolean;
  created_by?: string;
  start_date: string;
  end_date?: string;
  status: 'draft' | 'active' | 'archived';
  created_at: string;
  updated_at: string;
}

export interface BaggageFeeMatrix {
  id: string;
  category: string;
  max_weight_kg: number;
  fee: number;
  remarks?: string;
  created_at: string;
}

export interface AuditLog {
  id: number;
  username: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'VIEW' | 'EXPORT';
  module?: string;
  details?: string;
  ip_address?: string;
  created_at: string;
}
