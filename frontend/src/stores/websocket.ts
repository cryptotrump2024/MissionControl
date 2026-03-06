/**
 * WebSocket Store — Manages real-time connection and event streaming.
 * Uses Zustand for state management with automatic reconnection.
 */

import { create } from 'zustand';
import type { WSEvent } from '@/types';

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8000';

interface WSState {
  connected: boolean;
  events: WSEvent[];
  maxEvents: number;
  connect: () => void;
  disconnect: () => void;
  addEvent: (event: WSEvent) => void;
  clearEvents: () => void;
  onEvent: (handler: (event: WSEvent) => void) => () => void;
}

let ws: WebSocket | null = null;
let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
let reconnectDelay = 1000;
const eventHandlers = new Set<(event: WSEvent) => void>();

export const useWSStore = create<WSState>((set, get) => ({
  connected: false,
  events: [],
  maxEvents: 500,

  connect: () => {
    if (ws?.readyState === WebSocket.OPEN) return;

    try {
      ws = new WebSocket(`${WS_URL}/ws/events`);

      ws.onopen = () => {
        set({ connected: true });
        reconnectDelay = 1000; // Reset reconnect delay
        console.log('[WS] Connected to Mission Control');

        // Start ping interval
        const pingInterval = setInterval(() => {
          if (ws?.readyState === WebSocket.OPEN) {
            ws.send('ping');
          } else {
            clearInterval(pingInterval);
          }
        }, 30000);
      };

      ws.onmessage = (event) => {
        try {
          const parsed: WSEvent = JSON.parse(event.data);
          if (parsed.type === 'pong') return; // Ignore pong

          get().addEvent(parsed);

          // Notify all registered handlers
          eventHandlers.forEach(handler => handler(parsed));
        } catch {
          // Ignore parse errors
        }
      };

      ws.onclose = () => {
        set({ connected: false });
        console.log('[WS] Disconnected. Reconnecting...');

        // Exponential backoff reconnection
        reconnectTimeout = setTimeout(() => {
          reconnectDelay = Math.min(reconnectDelay * 2, 30000);
          get().connect();
        }, reconnectDelay);
      };

      ws.onerror = () => {
        ws?.close();
      };
    } catch (err) {
      console.error('[WS] Connection error:', err);
    }
  },

  disconnect: () => {
    if (reconnectTimeout) clearTimeout(reconnectTimeout);
    ws?.close();
    ws = null;
    set({ connected: false });
  },

  addEvent: (event: WSEvent) => {
    set((state) => ({
      events: [event, ...state.events].slice(0, state.maxEvents),
    }));
  },

  clearEvents: () => set({ events: [] }),

  onEvent: (handler: (event: WSEvent) => void) => {
    eventHandlers.add(handler);
    return () => eventHandlers.delete(handler);
  },
}));
