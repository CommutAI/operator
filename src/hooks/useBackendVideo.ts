/**
 * useBackendVideo — WebSocket connection to Raspberry Pi video server
 * Streams JPEG frames + passenger count over a single WebSocket.
 */
import { useState, useEffect, useRef, useCallback } from 'react';

const HEARTBEAT_MS = 30_000;
const CONNECT_TIMEOUT_MS = 10_000;
const MAX_RECONNECT_ATTEMPTS = 3;

interface UseBackendVideoOptions {
  autoConnect?: boolean;
}

export function useBackendVideo({ autoConnect = false }: UseBackendVideoOptions = {}) {
  const [isStreaming, setIsStreaming]           = useState(false);
  const [passengerCount, setPassengerCount]     = useState(0);
  const [error, setError]                       = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [connectionMessage, setConnectionMessage] = useState<string>('');

  const wsRef              = useRef<WebSocket | null>(null);
  const videoRef           = useRef<HTMLImageElement>(null);
  const heartbeatRef       = useRef<ReturnType<typeof setInterval> | null>(null);
  const connectTimeoutRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deadRef            = useRef(false);
  const reconnectAttemptsRef = useRef(0);

  const piUrl = import.meta.env.VITE_RASPBERRY_PI_URL || 'http://192.168.1.54:5000';
  const wsUrl = piUrl.replace(/^http/, 'ws') + '/ws';

  const clearTimers = useCallback(() => {
    if (heartbeatRef.current)      { clearInterval(heartbeatRef.current);     heartbeatRef.current = null; }
    if (connectTimeoutRef.current) { clearTimeout(connectTimeoutRef.current); connectTimeoutRef.current = null; }
  }, []);

  const closeSocket = useCallback((ws: WebSocket | null) => {
    if (!ws) return;
    ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
    if (ws.readyState < WebSocket.CLOSING) ws.close();
  }, []);

  const connect = useCallback(() => {
    if (deadRef.current || reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) return;

    closeSocket(wsRef.current);
    wsRef.current = null;
    clearTimers();

    setConnectionStatus('connecting');
    setConnectionMessage(`Connecting to Raspberry Pi…`);
    setError(null);
    setIsStreaming(false);

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      connectTimeoutRef.current = setTimeout(() => {
        if (ws.readyState === WebSocket.CONNECTING) {
          closeSocket(ws);
          reconnectAttemptsRef.current++;
          setConnectionStatus('error');
          setConnectionMessage('Connection timeout — Raspberry Pi may be offline');
          setError('Connection timeout');
        }
      }, CONNECT_TIMEOUT_MS);

      ws.onopen = () => {
        clearTimers();
        if (deadRef.current || wsRef.current !== ws) { closeSocket(ws); return; }

        reconnectAttemptsRef.current = 0; // Reset on successful connection
        setConnectionStatus('connected');
        setConnectionMessage('Connected to Raspberry Pi');
        setIsStreaming(true);
        setError(null);

        heartbeatRef.current = window.setInterval(() => {
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
          const data = JSON.parse(event.data as string);

          if (data.video_frame && videoRef.current) {
            videoRef.current.src = `data:image/jpeg;base64,${data.video_frame}`;
            setIsStreaming(true);
          } else if (data.type === 'video_frame' && data.frame && videoRef.current) {
            videoRef.current.src = `data:image/jpeg;base64,${data.frame}`;
            setIsStreaming(true);
          }

          if (data.count !== undefined) setPassengerCount(data.count);
        } catch {
          // non-JSON frames are silently ignored
        }
      };

      ws.onclose = () => {
        clearTimers();
        if (wsRef.current !== ws) return;
        if (!deadRef.current) {
          setConnectionStatus('disconnected');
          setConnectionMessage('Disconnected from Raspberry Pi');
          setIsStreaming(false);
          setError('Connection closed');
        }
      };

      ws.onerror = () => {
        clearTimers();
        if (!deadRef.current) {
          setError('Connection error');
          setConnectionStatus('error');
          setConnectionMessage('Failed to connect — check if ngrok tunnel is running');
        }
      };
    } catch {
      clearTimers();
      setError('Failed to connect');
      setConnectionStatus('error');
      setConnectionMessage('WebSocket connection failed');
    }
  }, [wsUrl, clearTimers, closeSocket]);

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
    setTimeout(connect, 300);
  }, [disconnect, connect]);

  useEffect(() => {
    deadRef.current = false;
    reconnectAttemptsRef.current = 0;
    if (autoConnect) connect();
    return () => {
      deadRef.current = true;
      clearTimers();
      closeSocket(wsRef.current);
      wsRef.current = null;
      reconnectAttemptsRef.current = 0;
    };
  }, [autoConnect, connect, clearTimers, closeSocket]);

  return { isStreaming, passengerCount, error, connectionStatus, connectionMessage, videoRef, connect, disconnect, refresh };
}
