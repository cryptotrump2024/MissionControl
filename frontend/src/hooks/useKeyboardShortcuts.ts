// frontend/src/hooks/useKeyboardShortcuts.ts
import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Global keyboard shortcut handler.
 *
 * Chord sequences (press g, then second key within 1s):
 *   g d → / (dashboard)
 *   g a → /agents
 *   g t → /tasks
 *   g l → /logs
 *   g c → /costs
 *   g x → /alerts
 *
 * Two-key sequences:
 *   n t → /tasks/create
 *
 * Single keys:
 *   ? → onShowShortcuts()
 *   Escape → onEscape()
 *   Ctrl+K / Cmd+K → onCommandPalette()
 */
export function useKeyboardShortcuts(callbacks: {
  onShowShortcuts: () => void;
  onEscape: () => void;
  onCommandPalette: () => void;
}) {
  const navigate = useNavigate();
  const pendingChord = useRef<string | null>(null);
  const chordTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function clearChord() {
      pendingChord.current = null;
      if (chordTimer.current) clearTimeout(chordTimer.current);
    }

    function handler(e: KeyboardEvent) {
      // Ignore when typing in inputs/textareas/selects
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if ((e.target as HTMLElement).isContentEditable) return;

      const key = e.key.toLowerCase();

      // Ctrl+K / Cmd+K → command palette
      if ((e.ctrlKey || e.metaKey) && key === 'k') {
        e.preventDefault();
        callbacks.onCommandPalette();
        return;
      }

      // Escape
      if (key === 'escape') {
        callbacks.onEscape();
        clearChord();
        return;
      }

      // ? → shortcuts overlay (only if no modifier keys)
      if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        callbacks.onShowShortcuts();
        clearChord();
        return;
      }

      // Handle chord: waiting for second key
      if (pendingChord.current === 'g') {
        clearChord();
        const routes: Record<string, string> = {
          d: '/',
          a: '/agents',
          t: '/tasks',
          l: '/logs',
          c: '/costs',
          x: '/alerts',
        };
        if (routes[key]) navigate(routes[key]);
        return;
      }
      if (pendingChord.current === 'n') {
        clearChord();
        if (key === 't') navigate('/tasks/create');
        return;
      }

      // Start chord sequence
      if (key === 'g' || key === 'n') {
        pendingChord.current = key;
        chordTimer.current = setTimeout(clearChord, 1000);
      }
    }

    window.addEventListener('keydown', handler);
    return () => {
      window.removeEventListener('keydown', handler);
      clearChord();
    };
  }, [navigate, callbacks]);
}
