/**
 * Toast notification system.
 * - Zustand store for toast state
 * - ToastContainer: renders toasts fixed bottom-right
 * - Auto-dismisses after 4 seconds
 * - useWSToasts: subscribes to WS events and fires appropriate toasts
 */

import { useEffect } from 'react';
import { create } from 'zustand';
import { useWSStore } from '@/stores/websocket';
import type { WSEvent } from '@/types';

// ── Types ──────────────────────────────────────────────────────────────────

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
}

// ── Zustand Store ──────────────────────────────────────────────────────────

interface ToastStore {
  toasts: ToastItem[];
  addToast: (message: string, type: ToastType) => void;
  removeToast: (id: string) => void;
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],

  addToast: (message, type) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    set((state) => ({
      toasts: [...state.toasts, { id, message, type }],
    }));
    // Auto-dismiss after 4 seconds
    setTimeout(() => {
      set((state) => ({
        toasts: state.toasts.filter((t) => t.id !== id),
      }));
    }, 4000);
  },

  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },
}));

// ── Style Map ──────────────────────────────────────────────────────────────

const TOAST_STYLES: Record<ToastType, { border: string; icon: string; iconText: string }> = {
  success: {
    border: 'border-mc-accent-green',
    icon: 'bg-mc-accent-green/20 text-mc-accent-green',
    iconText: '✓',
  },
  error: {
    border: 'border-mc-accent-red',
    icon: 'bg-mc-accent-red/20 text-mc-accent-red',
    iconText: '✕',
  },
  info: {
    border: 'border-mc-accent-blue',
    icon: 'bg-mc-accent-blue/20 text-mc-accent-blue',
    iconText: 'i',
  },
  warning: {
    border: 'border-mc-accent-amber',
    icon: 'bg-mc-accent-amber/20 text-mc-accent-amber',
    iconText: '!',
  },
};

// ── Single Toast Item ──────────────────────────────────────────────────────

function ToastEntry({ toast }: { toast: ToastItem }) {
  const { removeToast } = useToastStore();
  const styles = TOAST_STYLES[toast.type];

  return (
    <div
      className={`
        flex items-start gap-3 px-3 py-2.5 rounded-lg border shadow-lg
        bg-mc-bg-card
        min-w-[260px] max-w-[360px] w-full
        ${styles.border}
      `}
      role="alert"
    >
      {/* Icon badge */}
      <span
        className={`
          flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center
          text-[10px] font-bold mt-0.5 ${styles.icon}
        `}
        aria-hidden="true"
      >
        {styles.iconText}
      </span>

      {/* Message */}
      <p className="flex-1 text-xs text-mc-text-primary leading-relaxed">
        {toast.message}
      </p>

      {/* Dismiss */}
      <button
        onClick={() => removeToast(toast.id)}
        className="flex-shrink-0 text-mc-text-muted hover:text-mc-text-primary transition-colors text-xs leading-none mt-0.5 ml-1"
        aria-label="Dismiss notification"
      >
        ✕
      </button>
    </div>
  );
}

// ── Toast Container ────────────────────────────────────────────────────────

export function ToastContainer() {
  const { toasts } = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed bottom-20 md:bottom-6 right-4 md:right-6 z-50 flex flex-col gap-2 items-end"
      aria-live="polite"
      aria-label="Notifications"
    >
      {toasts.map((toast) => (
        <ToastEntry key={toast.id} toast={toast} />
      ))}
    </div>
  );
}

// ── WS Toast Hook ──────────────────────────────────────────────────────────

/**
 * useWSToasts — subscribes to WebSocket events and fires toast notifications.
 * Mount once at the Layout level.
 */
export function useWSToasts(): void {
  const { addToast } = useToastStore();
  const onEvent = useWSStore((state) => state.onEvent);

  useEffect(() => {
    const unsubscribe = onEvent((event: WSEvent) => {
      const data = event.data as Record<string, unknown>;

      switch (event.type) {
        case 'task_failed': {
          const title =
            (data.title as string | undefined) ||
            (data.task_id as string | undefined) ||
            'Unknown task';
          addToast(`Task failed: ${title}`, 'error');
          break;
        }
        case 'task_completed': {
          const title =
            (data.title as string | undefined) ||
            (data.task_id as string | undefined) ||
            'Unknown task';
          addToast(`Task completed: ${title}`, 'success');
          break;
        }
        case 'agent_status_change': {
          const name =
            (data.name as string | undefined) ||
            (data.agent_id as string | undefined) ||
            'Agent';
          const status = (data.status as string | undefined) || 'unknown';
          addToast(`Agent ${name} is now ${status}`, 'info');
          break;
        }
        case 'alert_triggered': {
          const msg =
            (data.message as string | undefined) ||
            (data.alert_type as string | undefined) ||
            'System alert';
          addToast(`Alert: ${msg}`, 'warning');
          break;
        }
        default:
          break;
      }
    });

    return unsubscribe;
  }, [onEvent, addToast]);
}
