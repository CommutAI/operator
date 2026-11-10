/**
 * useBackendVideo - Connect to Raspberry Pi WebSocket for processed video stream
 * Receives video frames with YOLOv8n detection boxes directly from Pi
 */

import { useState, useEffect, useRef, useCallback } from 'react';

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

  // Use environment variable for Raspberry Pi URL (Cloudflare tunnel/ngrok)
  const piUrl = import.meta.env.VITE_RASPBERRY_PI_URL || 'http://192.168.1.54:5000';
  const wsUrl = piUrl.replace('http', 'ws') + '/ws';

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

    closeSocket(wsRef.current);
    wsRef.current = null;
    clearTimers();

    setConnectionStatus('connecting');
    setConnectionMessage(`Connecting to Raspberry Pi at ${piUrl}...`);
    setError(null);
    setIsStreaming(false);

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      // Connection timeout - if no connection in 10 seconds, give up
      const connectionTimeout = setTimeout(() => {
        if (ws.readyState === WebSocket.CONNECTING) {
          closeSocket(ws);
          setConnectionStatus('error');
          setConnectionMessage('Connection timeout - Raspberry Pi may be offline');
          setError('Connection timeout');
        }
      }, 10000);

      ws.onopen = () => {
        clearTimeout(connectionTimeout);
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
          // Silent error handling for video streaming
        }
      };

      ws.onclose = () => {
        clearTimeout(connectionTimeout);
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
        clearTimeout(connectionTimeout);
        if (!deadRef.current) {
          setError('Connection error');
          setConnectionStatus('error');
          setConnectionMessage('Failed to connect to Raspberry Pi - check if ngrok tunnel is running');
        }
      };
    } catch (err) {
      setError('Failed to connect');
      setConnectionStatus('error');
      setConnectionMessage('WebSocket connection failed');
    }
  }, [wsUrl]);

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

    if (autoConnect) {
      connect();
    }

    return () => {
      deadRef.current = true;
      clearTimers();
      closeSocket(wsRef.current);
      wsRef.current = null;
    };
  }, [autoConnect, connect, disconnect]);

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
