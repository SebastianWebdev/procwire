/**
 * WebSocket hook for real-time benchmark updates.
 */

import { useEffect, useRef, useCallback, useState } from "react";

export type WsStatus = "connecting" | "connected" | "disconnected" | "error";

export interface WsMessage {
  type: string;
  runId?: number;
  timestamp: string;
  [key: string]: unknown;
}

interface UseWebSocketOptions {
  onMessage?: (message: WsMessage) => void;
  autoConnect?: boolean;
}

export function useWebSocket(options: UseWebSocketOptions = {}) {
  const { onMessage, autoConnect = true } = options;
  const [status, setStatus] = useState<WsStatus>("disconnected");
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number>();
  const onMessageRef = useRef(onMessage);

  // Keep callback ref updated
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    setStatus("connecting");

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

    ws.onopen = () => {
      setStatus("connected");
    };

    ws.onclose = () => {
      setStatus("disconnected");
      wsRef.current = null;

      // Auto-reconnect after 3 seconds
      reconnectTimeoutRef.current = window.setTimeout(() => {
        connect();
      }, 3000);
    };

    ws.onerror = () => {
      setStatus("error");
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as WsMessage;
        onMessageRef.current?.(message);
      } catch {
        console.error("Failed to parse WebSocket message");
      }
    };

    wsRef.current = ws;
  }, []);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    wsRef.current?.close();
    wsRef.current = null;
    setStatus("disconnected");
  }, []);

  useEffect(() => {
    if (autoConnect) {
      connect();
    }

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      wsRef.current?.close();
    };
  }, [autoConnect, connect]);

  return {
    status,
    connect,
    disconnect,
  };
}
