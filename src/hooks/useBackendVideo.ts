/**
 * useBackendVideo — WebSocket connection for live camera streaming & AI detection:
 * 1. Checks configured VITE_RASPBERRY_PI_URL (Cloudflare tunnel)
 * 2. In parallel, auto-discovers active tunnel from Supabase `pi_devices` table
 * 3. Falls back to Render Backend WebSocket relay (/ws/video-feed)
 */
import { useState, useEffect, useRef, useCallback, type RefObject } from 'react';
import { supabase } from '../lib/supabase';

const HEARTBEAT_MS = 30_000;
const CONNECT_TIMEOUT_MS = 12_000;
const MAX_RECONNECT_ATTEMPTS = 3;

interface UseBackendVideoOptions {
  autoConnect?: boolean;
  videoRef?: RefObject<HTMLImageElement | null>;
}

interface ResolvedEndpoint {
  wsUrl: string;
  label: string;
}

async function probeUrl(url: string, timeoutMs = 2500): Promise<boolean> {
  if (!url) return false;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(`${url.replace(/\/$/, '')}/health`, { signal: ctrl.signal });
    clearTimeout(t);
    return res.ok;
  } catch {
    return false;
  }
}

async function resolveVideoEndpoint(): Promise<ResolvedEndpoint> {
  const envPiUrl = (import.meta.env.VITE_RASPBERRY_PI_URL || '').trim().replace(/\/$/, '');
  const backendUrl = (import.meta.env.VITE_BACKEND_URL || 'https://sys-admin-62ro.onrender.com').trim().replace(/\/$/, '');

  // Probe explicit env URL and Supabase pi_devices registration concurrently
  const [envProbe, dbResult] = await Promise.allSettled([
    envPiUrl ? probeUrl(envPiUrl, 2500) : Promise.resolve(false),
    supabase.from('pi_devices').select('backend_url, ip_address, port').eq('bus_number', 1).maybeSingle(),
  ]);

  // 1. If explicit env URL responded healthy, use it
  if (envProbe.status === 'fulfilled' && envProbe.value) {
    return {
      wsUrl: envPiUrl.replace(/^http/, 'ws') + '/ws',
      label: 'Raspberry Pi (Direct Stream)',
    };
  }

  // 2. If Supabase holds a live tunnel URL, probe and use it
  if (dbResult.status === 'fulfilled' && (dbResult.value as any)?.data) {
    const { backend_url, ip_address, port } = (dbResult.value as any).data;

    if (backend_url && backend_url.startsWith('https://')) {
      if (await probeUrl(backend_url, 2500)) {
        return {
          wsUrl: backend_url.replace(/^http/, 'ws') + '/ws',
          label: 'Raspberry Pi (Cloudflare Tunnel)',
        };
      }
    }

    // On local HTTP origins, try direct LAN IP
    if (ip_address && typeof window !== 'undefined' && window.location.protocol === 'http:') {
      const lanUrl = `http://${ip_address}:${port || 8080}`;
      if (await probeUrl(lanUrl, 1500)) {
        return {
          wsUrl: lanUrl.replace(/^http/, 'ws') + '/ws',
          label: 'Raspberry Pi (Local LAN)',
        };
      }
    }
  }

  // 3. Fallback to centralized Backend WebSocket
  return {
    wsUrl: backendUrl.replace(/^http/, 'ws') + '/ws/video-feed',
    label: 'Backend Video Relay',
  };
}

export function useBackendVideo({ autoConnect = false, videoRef: externalVideoRef }: UseBackendVideoOptions = {}) {
  const [isStreaming, setIsStreaming]           = useState(false);
  const [passengerCount, setPassengerCount]     = useState(0);
  const [error, setError]                       = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [connectionMessage, setConnectionMessage] = useState<string>('');

  const wsRef               = useRef<WebSocket | null>(null);
  const internalVideoRef    = useRef<HTMLImageElement>(null);
  const videoRef            = externalVideoRef || internalVideoRef;
  const heartbeatRef        = useRef<number | null>(null);
  const connectTimeoutRef   = useRef<number | null>(null);
  const deadRef             = useRef(false);
  const reconnectAttemptsRef = useRef(0);

  const clearTimers = useCallback(() => {
    if (heartbeatRef.current !== null) {
      window.clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
    if (connectTimeoutRef.current !== null) {
      window.clearTimeout(connectTimeoutRef.current);
      connectTimeoutRef.current = null;
    }
  }, []);

  const closeSocket = useCallback((ws: WebSocket | null) => {
    if (!ws) return;
    ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
    if (ws.readyState < WebSocket.CLOSING) ws.close();
  }, []);

  const connect = useCallback(async () => {
    if (deadRef.current || reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) return;

    closeSocket(wsRef.current);
    wsRef.current = null;
    clearTimers();

    setConnectionStatus('connecting');
    setConnectionMessage('Locating camera stream…');
    setError(null);
    setIsStreaming(false);

    try {
      const endpoint = await resolveVideoEndpoint();
      if (deadRef.current) return;

      setConnectionMessage(`Connecting to ${endpoint.label}…`);

      const ws = new WebSocket(endpoint.wsUrl);
      wsRef.current = ws;

      connectTimeoutRef.current = window.setTimeout(() => {
        if (ws.readyState === WebSocket.CONNECTING) {
          closeSocket(ws);
          reconnectAttemptsRef.current++;
          setConnectionStatus('error');
          setConnectionMessage(`Connection timeout — ${endpoint.label} may be offline`);
          setError('Connection timeout');
        }
      }, CONNECT_TIMEOUT_MS);

      ws.onopen = () => {
        clearTimers();
        if (deadRef.current || wsRef.current !== ws) { closeSocket(ws); return; }

        reconnectAttemptsRef.current = 0;
        setConnectionStatus('connected');
        setConnectionMessage(`Connected to ${endpoint.label}`);
        setError(null);

        // Tell Pi video server to start streaming frames
        try {
          ws.send(JSON.stringify({ action: 'start_stream' }));
        } catch {
          // ignore send error
        }

        heartbeatRef.current = window.setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            try {
              ws.send(JSON.stringify({ type: 'ping' }));
            } catch {
              clearTimers();
            }
          } else {
            clearTimers();
          }
        }, HEARTBEAT_MS);
      };

      ws.onmessage = (event) => {
        if (deadRef.current) return;
        try {
          const data = JSON.parse(event.data as string);

          const frame = data.video_frame || (data.type === 'video_frame' && data.frame) || data.frame;
          if (frame) {
            if (videoRef.current) {
              videoRef.current.src = `data:image/jpeg;base64,${frame}`;
            }
            setIsStreaming(true);
          }

          const count = data.count ?? data.passenger_count;
          if (count !== undefined && typeof count === 'number') {
            setPassengerCount(count);
          }
        } catch {
          // Non-JSON frame or status string
        }
      };

      ws.onclose = () => {
        clearTimers();
        if (wsRef.current !== ws) return;
        if (!deadRef.current) {
          setConnectionStatus('disconnected');
          setConnectionMessage(`Disconnected from ${endpoint.label}`);
          setIsStreaming(false);
        }
      };

      ws.onerror = () => {
        clearTimers();
        if (!deadRef.current) {
          setError('Connection error');
          setConnectionStatus('error');
          setConnectionMessage(`Failed to connect to ${endpoint.label}`);
        }
      };
    } catch {
      clearTimers();
      setError('Failed to connect');
      setConnectionStatus('error');
      setConnectionMessage('WebSocket connection failed');
    }
  }, [clearTimers, closeSocket, videoRef]);

  const disconnect = useCallback(() => {
    clearTimers();
    closeSocket(wsRef.current);
    wsRef.current = null;
    setIsStreaming(false);
    setConnectionStatus('disconnected');
    reconnectAttemptsRef.current = 0;
  }, [clearTimers, closeSocket]);

  const refresh = useCallback(() => {
    reconnectAttemptsRef.current = 0;
    disconnect();
    setTimeout(() => {
      if (!deadRef.current) connect();
    }, 300);
  }, [disconnect, connect]);

  useEffect(() => {
    deadRef.current = false;
    reconnectAttemptsRef.current = 0;
    if (autoConnect) {
      // Defer execution so setState is not called synchronously within the effect body
      const timer = setTimeout(() => {
        if (!deadRef.current) connect();
      }, 0);
      return () => {
        clearTimeout(timer);
        deadRef.current = true;
        clearTimers();
        closeSocket(wsRef.current);
        wsRef.current = null;
        reconnectAttemptsRef.current = 0;
      };
    }
    return () => {
      deadRef.current = true;
      clearTimers();
      closeSocket(wsRef.current);
      wsRef.current = null;
      reconnectAttemptsRef.current = 0;
    };
  }, [autoConnect, connect, clearTimers, closeSocket]);

  return {
    isStreaming,
    passengerCount,
    error,
    connectionStatus,
    connectionMessage,
    videoRef,
    connect,
    disconnect,
    refresh,
  };
}
