/**
 * useBackendVideo - Connect to Raspberry Pi WebSocket for processed video stream
 * Receives video frames with YOLOv8n detection boxes directly from Pi
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { getPersistedIp, discoverRaspberryPi } from '../services/piAutoDiscovery';

const HEARTBEAT_MS = 30_000;

interface UseBackendVideoOptions {
  autoConnect?: boolean;
}

export function useBackendVideo({ autoConnect = false }: UseBackendVideoOptions = {}) {
  const [isStreaming, setIsStreaming] = useState(false);
  const [passengerCount, setPassengerCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [connectionMessage, setConnectionMessage] = useState<string>('');

  const wsRef = useRef<WebSocket | null>(null);
  const videoRef = useRef<HTMLImageElement>(null);
  const heartbeatTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const deadRef = useRef(false);

  // Auto-detect Pi IP from localStorage
  const [piUrl, setPiUrl] = useState(() => {
    const piIp = getPersistedIp();
    return piIp ? `http://${piIp}:5000` : null;
  });

  const wsUrl = piUrl ? piUrl.replace(/^http/, 'ws') + '/ws' : null;

  // Auto-discover Pi if no IP is persisted
  useEffect(() => {
    if (!getPersistedIp()) {
      console.log('[Backend Video] No persisted IP, starting discovery...');
      discoverRaspberryPi().then(ip => {
        console.log('[Backend Video] Discovery result:', ip);
        if (ip) {
          setPiUrl(`http://${ip}:5000`);
        }
      });
    } else {
      console.log('[Backend Video] Using persisted IP:', getPersistedIp());
    }
  }, []);

  function clearTimers() {
    if (heartbeatTimer.current !== null) {
      clearInterval(heartbeatTimer.current);
      heartbeatTimer.current = null;
    }
  }

  function closeSocket(ws: WebSocket | null) {
    if (!ws) return;
    ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
    if (ws.readyState < WebSocket.CLOSING) ws.close();
  }

  const connect = useCallback(() => {
    if (deadRef.current) return;

    if (!piUrl) {
      console.log('[Backend Video] No Pi URL configured');
      setConnectionStatus('not configured');
      setConnectionMessage('No Raspberry Pi IP configured. Click refresh to discover Pi.');
      setIsStreaming(false);
      setError(null);
      return;
    }

    console.log('[Backend Video] Connecting to:', piUrl);
    closeSocket(wsRef.current);
    wsRef.current = null;
    clearTimers();

    setConnectionStatus('connecting');
    setConnectionMessage(`Connecting to Raspberry Pi at ${piUrl}...`);
    setError(null);
    setIsStreaming(false);

    try {
      const currentWsUrl = piUrl.replace(/^http/, 'ws') + '/ws';
      console.log('[Backend Video] WebSocket URL:', currentWsUrl);
      const ws = new WebSocket(currentWsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (deadRef.current || wsRef.current !== ws) {
          closeSocket(ws);
          return;
        }

        setConnectionStatus('connected');
        setConnectionMessage('Connected to Raspberry Pi');
        setIsStreaming(true);
        setError(null);

        // Start heartbeat
        heartbeatTimer.current = window.setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          } else {
            clearTimers();
          }
        }, HEARTBEAT_MS);
      };

      ws.onmessage = (event) => {
        if (deadRef.current) return;

        try {
          const data = JSON.parse(event.data);

          // Handle Pi server format: {'video_frame': frame_base64}
          if (data.video_frame && videoRef.current) {
            videoRef.current.src = `data:image/jpeg;base64,${data.video_frame}`;
            setIsStreaming(true);
          }

          // Handle passenger count from separate message
          if (data.count !== undefined) {
            setPassengerCount(data.count);
          }

          // Handle combined format (backward compatibility)
          if (data.type === 'video_frame' && data.frame && videoRef.current) {
            videoRef.current.src = `data:image/jpeg;base64,${data.frame}`;
            setIsStreaming(true);
          }
        } catch (err) {
          console.error('[Backend Video] Error parsing message:', err);
        }
      };

      ws.onclose = () => {
        if (wsRef.current !== ws) return;
        clearTimers();

        if (!deadRef.current) {
          setConnectionStatus('disconnected');
          setConnectionMessage('Disconnected from Raspberry Pi');
          setIsStreaming(false);
          setError('Connection closed');
        }
      };

      ws.onerror = (err) => {
        console.error('[Backend Video] WebSocket error:', err);
        if (!deadRef.current) {
          setError('Connection error');
        }
      };
    } catch (err) {
      console.error('[Backend Video] Connection error:', err);
      setError('Failed to connect');
      setConnectionStatus('error');
    }
  }, [piUrl]);

  const disconnect = useCallback(() => {
    clearTimers();
    closeSocket(wsRef.current);
    wsRef.current = null;
    setIsStreaming(false);
    setConnectionStatus('disconnected');
  }, []);

  const refresh = useCallback(() => {
    disconnect();
    setTimeout(connect, 300);
  }, [disconnect, connect]);

  useEffect(() => {
    deadRef.current = false;

    console.log('[Backend Video] useEffect triggered', { autoConnect, piUrl });
    if (autoConnect && piUrl) {
      console.log('[Backend Video] Calling connect()');
      connect();
    } else {
      console.log('[Backend Video] Not connecting - autoConnect:', autoConnect, 'piUrl:', piUrl);
    }

    return () => {
      deadRef.current = true;
      clearTimers();
      closeSocket(wsRef.current);
      wsRef.current = null;
    };
  }, [autoConnect, connect, disconnect, piUrl]);

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
