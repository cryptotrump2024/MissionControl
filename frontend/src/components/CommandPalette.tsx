// frontend/src/components/CommandPalette.tsx
import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';

interface Props {
  open: boolean;
  onClose: () => void;
}

interface PaletteItem {
  id: string;
  label: string;
  sub?: string;
  route: string;
  icon: string;
}

const STATIC_PAGES: PaletteItem[] = [
  { id: 'dash',     label: 'Dashboard',  icon: '▤',  route: '/' },
  { id: 'agents',   label: 'Agents',     icon: '◈',  route: '/agents' },
  { id: 'tasks',    label: 'Tasks',      icon: '✓',  route: '/tasks' },
  { id: 'logs',     label: 'Logs',       icon: '≡',  route: '/logs' },
  { id: 'costs',    label: 'Costs',      icon: '$',  route: '/costs' },
  { id: 'alerts',   label: 'Alerts',     icon: '⚠',  route: '/alerts' },
  { id: 'newtask',  label: 'New Task',   icon: '+',  route: '/tasks/create' },
  { id: 'settings', label: 'Settings',  icon: '⚙',  route: '/settings' },
];

export default function CommandPalette({ open, onClose }: Props) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Pull agents and tasks from TanStack Query cache — no extra API calls
  const agentData = queryClient.getQueryData<{ agents: { id: string; name: string; type: string }[] }>(['agents']);
  const taskData = queryClient.getQueryData<{ tasks: { id: string; title: string; status: string }[] }>(['tasks', undefined, undefined, 0]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setSelected(0);
    const id = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(id);
  }, [open]);

  const items: PaletteItem[] = useMemo(() => {
    const agentItems: PaletteItem[] = (agentData?.agents ?? []).map((a) => ({
      id: `agent-${a.id}`,
      label: a.name,
      sub: a.type,
      icon: '◈',
      route: `/agents/${a.id}`,
    }));
    const taskItems: PaletteItem[] = (taskData?.tasks ?? []).map((t) => ({
      id: `task-${t.id}`,
      label: t.title,
      sub: t.status,
      icon: '✓',
      route: `/tasks/${t.id}`,
    }));
    const all = [...STATIC_PAGES, ...agentItems, ...taskItems];
    if (!query.trim()) return STATIC_PAGES;
    const q = query.toLowerCase();
    return all.filter(
      (i) => i.label.toLowerCase().includes(q) || i.sub?.toLowerCase().includes(q)
    );
  }, [query, agentData, taskData]);

  useEffect(() => setSelected(0), [query]);

  function pick(item: PaletteItem) {
    navigate(item.route);
    onClose();
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected((s) => Math.min(s + 1, items.length - 1));
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
    }
    if (e.key === 'Enter' && items[selected]) pick(items[selected]);
    if (e.key === 'Escape') onClose();
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-32 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-mc-bg-secondary border border-mc-border-primary rounded-xl shadow-2xl w-full max-w-lg mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-mc-border-primary">
          <span className="text-mc-text-muted text-sm">⌘</span>
          <input
            ref={inputRef}
            type="text"
            placeholder="Search pages, agents, tasks…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKey}
            className="flex-1 bg-transparent text-sm text-mc-text-primary placeholder-mc-text-muted focus:outline-none"
          />
          {query && (
            <button
              className="text-mc-text-muted hover:text-mc-text-primary text-xs"
              onClick={() => setQuery('')}
            >
              ✕
            </button>
          )}
        </div>

        {/* Results */}
        <div className="max-h-72 overflow-y-auto py-1">
          {items.length === 0 ? (
            <p className="text-mc-text-muted text-xs text-center py-6">
              No results for "{query}"
            </p>
          ) : (
            items.map((item, i) => (
              <button
                key={item.id}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                  i === selected
                    ? 'bg-mc-accent-blue/10 text-mc-text-primary'
                    : 'text-mc-text-secondary hover:bg-mc-bg-tertiary'
                }`}
                onMouseEnter={() => setSelected(i)}
                onClick={() => pick(item)}
              >
                <span className="text-mc-text-muted w-4 flex-shrink-0 text-center text-xs">
                  {item.icon}
                </span>
                <span className="text-sm flex-1 truncate">{item.label}</span>
                {item.sub && (
                  <span className="text-[10px] text-mc-text-muted bg-mc-bg-tertiary px-1.5 py-0.5 rounded font-mono">
                    {item.sub}
                  </span>
                )}
              </button>
            ))
          )}
        </div>

        {/* Footer hints */}
        <div className="px-4 py-2 border-t border-mc-border-primary flex items-center gap-4 text-[10px] text-mc-text-muted">
          <span><kbd className="font-mono">↑↓</kbd> navigate</span>
          <span><kbd className="font-mono">↵</kbd> select</span>
          <span><kbd className="font-mono">Esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
