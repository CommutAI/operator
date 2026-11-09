declare module '../services/piAutoDiscovery' {
  export interface DiscoveredDevice {
    id: string;
    name: string;
    ip: string;
    port: number;
    status: 'online' | 'offline';
  }

  export function discoverDevices(): Promise<DiscoveredDevice[]>;
  export function connectToDevice(deviceId: string): Promise<boolean>;
  export function disconnectFromDevice(deviceId: string): Promise<void>;
}
