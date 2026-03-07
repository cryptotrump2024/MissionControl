import { useState, useMemo, useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useWSStore } from '@/stores/websocket';
import { useQuery } from '@tanstack/react-query';
import { alertsApi } from '@/api/client';
import { ToastContainer, useWSToasts } from '@/components/Toast';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import ShortcutsOverlay from '@/components/ShortcutsOverlay';
import CommandPalette from '@/components/CommandPalette';

const navItems = [
  { path: '/', label: 'Dashboard', icon: '◉' },
  { path: '/agents', label: 'Agents', icon: '⬡' },
  { path: '/tasks', label: 'Tasks', icon: '☐' },
  { path: '/templates', label: 'Templates', icon: '⊞' },
  { path: '/logs', label: 'Logs', icon: '≡' },
  { path: '/costs', label: 'Costs', icon: '$' },
  { path: '/approvals', label: 'Approvals', icon: '✓' },
  { path: '/alerts', label: 'Alerts', icon: '⚠' },
  { path: '/settings', label: 'Settings', icon: '⚙' },
];

export default function Layout() {
  const { connected, connect, events } = useWSStore();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    connect();
  }, [connect]);

  // Close sidebar on navigation
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  // Wire WS → toast notifications
  useWSToasts();

  const { data: unreadData } = useQuery({
    queryKey: ['alerts-unread-count'],
    queryFn: () => alertsApi.unreadCount(),
    refetchInterval: 30_000,
    // Gracefully handle if endpoint not yet available
    retry: false,
  });
  const unreadCount = unreadData?.count ?? 0;

  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showPalette, setShowPalette] = useState(false);

  const shortcutCallbacks = useMemo(() => ({
    onShowShortcuts: () => setShowShortcuts((v) => !v),
    onEscape: () => { setShowShortcuts(false); setShowPalette(false); },
    onCommandPalette: () => setShowPalette((v) => !v),
  }), []);

  useKeyboardShortcuts(shortcutCallbacks);

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className="p-4 border-b border-mc-border-primary">
        <h1 className="text-lg font-bold text-mc-text-primary">
          ◈ Mission Control
        </h1>
        <p className="text-xs text-mc-text-muted mt-1">AI Agent Command Center</p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-2">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-2.5 mx-2 rounded-md text-sm transition-colors ${
                isActive
                  ? 'bg-mc-accent-blue/10 text-mc-accent-blue border border-mc-accent-blue/20'
                  : 'text-mc-text-secondary hover:bg-mc-bg-hover hover:text-mc-text-primary'
              }`
            }
          >
            <span className="text-base w-5 text-center">{item.icon}</span>
            <span className="flex-1">{item.label}</span>
            {item.path === '/alerts' && unreadCount > 0 && (
              <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 rounded-full bg-mc-accent-red text-white text-[10px] font-bold leading-none">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Connection Status */}
      <div className="p-4 border-t border-mc-border-primary">
        <div className="flex items-center gap-2 text-xs">
          <span
            className={`w-2 h-2 rounded-full ${
              connected ? 'bg-mc-accent-green animate-pulse' : 'bg-mc-accent-red'
            }`}
          />
          <span className="text-mc-text-muted">
            {connected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
        <div className="text-xs text-mc-text-muted mt-1">
          {events.length} events
        </div>
      </div>
    </>
  );

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Mobile backdrop overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-40 w-60 bg-mc-bg-secondary border-r border-mc-border-primary flex flex-col
          transform transition-transform duration-200 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          md:relative md:translate-x-0
        `}
      >
        {sidebarContent}
      </aside>

      {/* Main Content */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Mobile top bar */}
        <header className="h-12 flex items-center gap-3 px-4 border-b border-mc-border-primary bg-mc-bg-secondary md:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-mc-text-secondary hover:text-mc-text-primary p-1"
            aria-label={sidebarOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={sidebarOpen}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <rect y="3" width="20" height="2" rx="1"/>
              <rect y="9" width="20" height="2" rx="1"/>
              <rect y="15" width="20" height="2" rx="1"/>
            </svg>
          </button>
          <span className="text-sm font-semibold text-mc-text-primary">Mission Control</span>
        </header>

        {/* Desktop top bar */}
        <header className="h-14 bg-mc-bg-secondary border-b border-mc-border-primary items-center px-6 hidden md:flex">
          <div className="flex-1" />
          <div className="flex items-center gap-4">
            <button
              className="hidden md:flex items-center gap-1.5 text-xs text-mc-text-muted bg-mc-bg-secondary border border-mc-border-primary rounded px-2 py-1 hover:border-mc-accent-blue transition-colors cursor-pointer"
              onClick={() => setShowPalette(true)}
              title="Command Palette (⌘K)"
            >
              <span className="font-mono">⌘K</span>
            </button>
            <span className="text-xs text-mc-text-muted">v0.1.0</span>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto">
          <div className="p-6">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Toast notifications — rendered at root so they overlay everything */}
      <ToastContainer />
      <ShortcutsOverlay open={showShortcuts} onClose={() => setShowShortcuts(false)} />
      <CommandPalette open={showPalette} onClose={() => setShowPalette(false)} />
    </div>
  );
}
