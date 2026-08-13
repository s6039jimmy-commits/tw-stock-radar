import { useState, useEffect, useCallback, useRef } from 'react';

export function useWebSocket(url = import.meta.env.VITE_WS_URL || 'ws://localhost:3001') {
  const [lastMessage, setLastMessage] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);

  const connect = useCallback(() => {
    try {
      const ws = new WebSocket(url);
      
      ws.onopen = () => {
        setIsConnected(true);
        if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          setLastMessage(data);
        } catch (e) {
          console.error('WebSocket message parse error:', e);
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        // Exponential backoff or simple reconnect
        reconnectTimeoutRef.current = setTimeout(connect, 3000);
      };

      ws.onerror = (err) => {
        console.error('WebSocket error:', err);
        ws.close();
      };

      wsRef.current = ws;
    } catch (err) {
      console.error('WebSocket connection error:', err);
      reconnectTimeoutRef.current = setTimeout(connect, 3000);
    }
  }, [url]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, [connect]);

  const sendMessage = useCallback((msg) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  return { lastMessage, isConnected, sendMessage };
}
