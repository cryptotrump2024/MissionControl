/**
 * useWebSocket — React hook wrapping the Zustand WSStore.
 * Provides a convenient subscribe(type, handler) API for
 * components that want to react to specific WebSocket event types.
 */

import { useEffect, useRef, useCallback } from 'react';
import { useWSStore } from '@/stores/websocket';
import type { WSEvent } from '@/types';

export interface UseWebSocketReturn {
  isConnected: boolean;
  lastMessage: WSEvent | null;
  subscribe: (type: string, handler: (data: WSEvent['data']) => void) => () => void;
}

export function useWebSocket(): UseWebSocketReturn {
  const { connected, events, onEvent } = useWSStore();
  const lastMessage = events.length > 0 ? events[0] : null;

  /**
   * Subscribe to a specific WebSocket event type.
   * Returns an unsubscribe function — safe to call in useEffect cleanup.
   */
  const subscribe = useCallback(
    (type: string, handler: (data: WSEvent['data']) => void): (() => void) => {
      return onEvent((event: WSEvent) => {
        if (event.type === type) {
          handler(event.data);
        }
      });
    },
    [onEvent],
  );

  return {
    isConnected: connected,
    lastMessage,
    subscribe,
  };
}
