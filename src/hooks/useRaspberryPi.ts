import { useRef, useState, useEffect, RefObject } from 'react';

interface RaspberryPiConfig {
  autoConnect?: boolean;
  enableHealthCheck?: boolean;
}

interface EmergencyStatus {
  emergency_active: boolean;
}

interface AssignedBus {
  busNumber?: string;
  busPlate?: string;
}

interface HardwareStatus {
  cpu_temp?: number;
  memory_usage?: number;
  disk_usage?: number;
}

interface RaspberryPiState {
  online: boolean;
  connectionStatus: string;
  cameraActive: boolean;
  passengerCount: number;
  currentTripId: string | null;
  emergencyStatus: EmergencyStatus;
  hardwareStatus: HardwareStatus | null;
  isStreaming: boolean;
  videoRef: RefObject<HTMLImageElement | null>;
  refresh: () => void;
  assignedBus: AssignedBus | null;
  activeTripId: string | null;
  averageCount: number;
  lastUpdate: string | null;
  piReachable: boolean | null;
  raspberryPiUrl: string;
  startStream: () => void;
  stopStream: () => void;
  connect: () => void;
}

export const useRaspberryPi = (config: RaspberryPiConfig = {}): RaspberryPiState => {
  const videoRef = useRef<HTMLImageElement>(null);
  const [online, setOnline] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [_cameraActive, _setCameraActive] = useState(false);
  const [_passengerCount, _setPassengerCount] = useState(0);
  const [_currentTripId, _setCurrentTripId] = useState<string | null>(null);
  const [_emergencyStatus, _setEmergencyStatus] = useState<EmergencyStatus>({ emergency_active: false });
  const [_hardwareStatus, _setHardwareStatus] = useState<HardwareStatus | null>(null);
  const [_isStreaming, _setIsStreaming] = useState(false);
  const [_assignedBus, _setAssignedBus] = useState<AssignedBus | null>(null);
  const [_averageCount, _setAverageCount] = useState(0);
  const [_lastUpdate, _setLastUpdate] = useState<string | null>(null);
  const [_piReachable, _setPiReachable] = useState<boolean | null>(null);
  const [_raspberryPiUrl, _setRaspberryPiUrl] = useState('http://raspberrypi.local:8000');

  const refresh = () => {
    console.log('Refreshing Raspberry Pi connection');
    setConnectionStatus('connecting');
    setTimeout(() => {
      setOnline(true);
      setConnectionStatus('connected');
    }, 1000);
  };

  const startStream = () => {
    console.log('Starting stream');
    _setIsStreaming(true);
  };

  const stopStream = () => {
    console.log('Stopping stream');
    _setIsStreaming(false);
  };

  const connect = () => {
    console.log('Connecting to Raspberry Pi');
    setConnectionStatus('connecting');
    setTimeout(() => {
      setOnline(true);
      setConnectionStatus('connected');
    }, 1000);
  };

  useEffect(() => {
    if (config.autoConnect) {
      setConnectionStatus('connecting');
      setTimeout(() => {
        setOnline(true);
        setConnectionStatus('connected');
      }, 1000);
    }
  }, [config.autoConnect]);

  return {
    online,
    connectionStatus,
    cameraActive: _cameraActive,
    passengerCount: _passengerCount,
    currentTripId: _currentTripId,
    emergencyStatus: _emergencyStatus,
    hardwareStatus: _hardwareStatus,
    isStreaming: _isStreaming,
    videoRef,
    refresh,
    assignedBus: _assignedBus,
    activeTripId: _currentTripId,
    averageCount: _averageCount,
    lastUpdate: _lastUpdate,
    piReachable: _piReachable,
    raspberryPiUrl: _raspberryPiUrl,
    startStream,
    stopStream,
    connect,
  };
};
