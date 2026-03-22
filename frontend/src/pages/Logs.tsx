/**
 * LogsPage — Real-time log viewer for all system logs.
 * Route: /logs
 *
 * Features:
 *  - Filter by agent, level, text search
 *  - Live toggle (WebSocket subscription)
 *  - Auto-scroll to newest entry
 *  - Relative + absolute timestamps on hover
 *  - Clickable task IDs → task detail
 *  - Clear button
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { logsApi, agentsApi, exportApi } from '@/api/client';
import { useWebSocket } from '@/hooks/useWebSocket';
import type { LogEntry } from '@/types';

// ── Constants ──────────────────────────────────────────────────────────────

const LEVEL_COLORS: Record<string, string> = {
  debug: 'bg-mc-text-muted/10 text-mc-text-muted',
  info: 'bg-mc-accent-blue/10 text-mc-accent-blue',
  warn: 'bg-mc-accent-amber/10 text-mc-accent-amber',
  error: 'bg-mc-accent-red/10 text-mc-accent-red',
};

const ROW_HIGHLIGHT: Record<string, string> = {
  debug: '',
  info: '',
  warn: 'bg-mc-accent-amber/5',
  error: 'bg-mc-accent-red/5',
};

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString();
}

// ── Component ──────────────────────────────────────────────────────────────

export default function Logs() {
  const [filterLevel, setFilterLevel] = useState<string>('');
  const [filterAgentId, setFilterAgentId] = useState<string>('');
  const [searchText, setSearchText] = useState('');
  const [liveEnabled, setLiveEnabled] = useState(true);
  const [liveEntries, setLiveEntries] = useState<LogEntry[]>([]);
  const [cleared, setCleared] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const { isConnected, subscribe } = useWebSocket();

  // Fetch initial log batch
  const { data: apiLogs, isLoading } = useQuery({
    queryKey: ['logs', filterLevel, filterAgentId, searchText],
    queryFn: () =>
      logsApi.list({
        level: filterLevel || undefined,
        agent_id: filterAgentId || undefined,
        search: searchText || undefined,
        limit: 200,
      }),
  });

  // Fetch agents for the filter dropdown
  const { data: agentData } = useQuery({
    queryKey: ['agents'],
    queryFn: () => agentsApi.list(),
  });
  const agents = agentData?.agents || [];

  // Subscribe to live log events
  useEffect(() => {
    if (!liveEnabled) return;
    const unsub = subscribe('log_entry', (data) => {
      const entry = data as unknown as LogEntry;
      // Apply client-side filters
      if (filterLevel && entry.level !== filterLevel) return;
      if (filterAgentId && entry.agent_id !== filterAgentId) return;
      if (searchText && !entry.message.toLowerCase().includes(searchText.toLowerCase())) return;
      setLiveEntries((prev) => [...prev, entry]);
    });
    return unsub;
  }, [subscribe, liveEnabled, filterLevel, filterAgentId, searchText]);

  // Reset live entries when filters change (they'll come from fresh API data)
  useEffect(() => {
    setLiveEntries([]);
    setCleared(false);
  }, [filterLevel, filterAgentId, searchText]);

  // Merge API + live, deduplicated
  const buildDisplayLogs = useCallback((): LogEntry[] => {
    if (cleared) return liveEntries;
    const base = apiLogs ? [...apiLogs].reverse() : []; // oldest-first
    const knownIds = new Set(base.map((l) => l.id));
    for (const e of liveEntries) {
      if (!knownIds.has(e.id)) base.push(e);
    }
    return base;
  }, [apiLogs, liveEntries, cleared]);

  const displayLogs = buildDisplayLogs();

  // Auto-scroll
  useEffect(() => {
    if (liveEnabled && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [displayLogs, liveEnabled]);

  const handleClear = () => {
    setLiveEntries([]);
    setCleared(true);
  };

  return (
    <div>
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold">
          System Logs
          <span className="ml-2 text-sm font-normal text-mc-text-muted">
            ({displayLogs.length} entries)
          </span>
        </h2>
        <button
          className="mc-btn-secondary text-xs"
          onClick={handleClear}
        >
          Clear
        </button>
      </div>

      {/* ── Filter Bar ── */}
      <div className="mc-card mb-4">
        <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3">
          {/* Level filter */}
          <select
            className="mc-input text-xs"
            value={filterLevel}
            onChange={(e) => setFilterLevel(e.target.value)}
          >
            <option value="">All Levels</option>
            <option value="debug">Debug</option>
            <option value="info">Info</option>
            <option value="warn">Warning</option>
            <option value="error">Error</option>
          </select>

          {/* Agent filter */}
          <select
            className="mc-input text-xs"
            value={filterAgentId}
            onChange={(e) => setFilterAgentId(e.target.value)}
          >
            <option value="">All Agents</option>
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </select>

          {/* Text search */}
          <input
            className="mc-input text-xs w-full sm:w-52"
            placeholder="Search messages..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />

          {/* CSV Export */}
          <a
            href={exportApi.logsUrl({
              level: filterLevel || undefined,
              agent_id: filterAgentId || undefined,
            })}
            download="logs.csv"
            className="mc-btn-secondary text-xs flex items-center gap-1 no-underline"
          >
            &#8595; CSV
          </a>

          <div className="flex-1" />

          {/* Live toggle */}
          <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
            <span
              role="switch"
              aria-checked={liveEnabled}
              tabIndex={0}
              className={`relative inline-flex w-8 h-4 rounded-full transition-colors ${
                liveEnabled ? 'bg-mc-accent-green' : 'bg-mc-bg-tertiary border border-mc-border-primary'
              }`}
              onClick={() => setLiveEnabled((v) => !v)}
              onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setLiveEnabled((v) => !v); } }}
            >
              <span
                className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${
                  liveEnabled ? 'translate-x-4' : 'translate-x-0.5'
                }`}
              />
            </span>
            <span className="text-mc-text-secondary">
              Live
              {liveEnabled && (
                <span
                  className={`ml-1.5 inline-block w-1.5 h-1.5 rounded-full ${
                    isConnected ? 'bg-mc-accent-green animate-pulse' : 'bg-mc-accent-red'
                  }`}
                />
              )}
            </span>
          </label>
        </div>
      </div>

      {/* ── Log Stream ── */}
      <div className="overflow-x-auto"><div className="mc-card">
        <div className="font-mono text-xs max-h-[65vh] overflow-y-auto">
          {isLoading ? (
            <p className="text-mc-text-muted py-8 text-center">Loading logs...</p>
          ) : displayLogs.length === 0 ? (
            <p className="text-mc-text-muted py-8 text-center">
              {cleared ? 'Logs cleared. New entries will appear here.' : 'No logs found. Start agents to see activity.'}
            </p>
          ) : (
            displayLogs.map((log: LogEntry) => (
              <div
                key={log.id}
                className={`flex items-start gap-2 py-1 px-2 rounded transition-colors hover:bg-mc-bg-hover ${ROW_HIGHLIGHT[log.level] || ''}`}
              >
                {/* Timestamp */}
                <span
                  className="text-mc-text-muted whitespace-nowrap flex-shrink-0 w-16"
                  title={new Date(log.timestamp).toLocaleString()}
                >
                  {formatRelative(log.timestamp)}
                </span>

                {/* Level badge */}
                <span className={`mc-badge text-[9px] flex-shrink-0 w-14 justify-center ${LEVEL_COLORS[log.level] || ''}`}>
                  {log.level.toUpperCase()}
                </span>

                {/* Agent */}
                {log.agent_id ? (
                  <span className="text-mc-text-muted flex-shrink-0 w-20 truncate hidden sm:block" title={log.agent_id}>
                    {log.agent_id.slice(0, 8)}…
                  </span>
                ) : (
                  <span className="text-mc-text-muted flex-shrink-0 w-20 hidden sm:block">—</span>
                )}

                {/* Task ID link */}
                {log.task_id ? (
                  <Link
                    to={`/tasks/${log.task_id}`}
                    className="text-mc-accent-teal hover:text-mc-accent-teal/80 flex-shrink-0 w-20 truncate font-mono hidden sm:block"
                    title={log.task_id}
                  >
                    {log.task_id.slice(0, 8)}…
                  </Link>
                ) : (
                  <span className="text-mc-text-muted flex-shrink-0 w-20 hidden sm:block">—</span>
                )}

                {/* Message */}
                <span className="text-mc-text-secondary break-all flex-1">{log.message}</span>
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>

        {/* Column header */}
        <div className="flex items-center gap-2 text-[9px] text-mc-text-muted uppercase tracking-wider border-t border-mc-border-primary pt-2 mt-2 px-2 font-mono">
          <span className="w-16">Age</span>
          <span className="w-14">Level</span>
          <span className="w-20 hidden sm:block">Agent</span>
          <span className="w-20 hidden sm:block">Task</span>
          <span className="flex-1">Message</span>
        </div>
      </div>
      </div>

      {/* Live indicator */}
      {liveEnabled && liveEntries.length > 0 && (
        <p className="text-xs text-mc-text-muted mt-2">
          +{liveEntries.length} live entries received
        </p>
      )}
    </div>
  );
}
