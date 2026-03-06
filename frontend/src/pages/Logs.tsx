import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { logsApi } from '@/api/client';
import { useWSStore } from '@/stores/websocket';
import type { LogEntry } from '@/types';

const LEVEL_COLORS: Record<string, string> = {
  debug: 'text-mc-text-muted',
  info: 'text-mc-accent-blue',
  warn: 'text-mc-accent-amber',
  error: 'text-mc-accent-red',
};

export default function Logs() {
  const [filterLevel, setFilterLevel] = useState<string | undefined>();
  const [searchText, setSearchText] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);

  // Fetch logs from API
  const { data: apiLogs, isLoading } = useQuery({
    queryKey: ['logs', filterLevel, searchText],
    queryFn: () => logsApi.list({ level: filterLevel, search: searchText || undefined, limit: 200 }),
    refetchInterval: autoScroll ? 3000 : false,
  });

  // Also get real-time log events from WebSocket
  const { events } = useWSStore();
  const wsLogs = events
    .filter((e) => e.type === 'log_entry')
    .map((e) => e.data as unknown as LogEntry);

  // Merge and deduplicate (prefer API data, prepend WS data)
  const logs = apiLogs || [];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold">Logs</h2>
        <div className="flex items-center gap-2">
          <select
            className="mc-input text-xs"
            value={filterLevel ?? ''}
            onChange={(e) => setFilterLevel(e.target.value || undefined)}
          >
            <option value="">All Levels</option>
            <option value="debug">Debug</option>
            <option value="info">Info</option>
            <option value="warn">Warning</option>
            <option value="error">Error</option>
          </select>
          <input
            className="mc-input text-xs w-48"
            placeholder="Search logs..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
          <label className="flex items-center gap-1 text-xs text-mc-text-muted cursor-pointer">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="rounded"
            />
            Auto-refresh
          </label>
        </div>
      </div>

      {/* Log Stream */}
      <div className="mc-card">
        <div className="font-mono text-xs space-y-0.5 max-h-[70vh] overflow-y-auto">
          {isLoading ? (
            <p className="text-mc-text-muted py-4 text-center">Loading logs...</p>
          ) : logs.length === 0 ? (
            <p className="text-mc-text-muted py-4 text-center">No logs yet. Logs will appear here when agents start working.</p>
          ) : (
            logs.map((log: LogEntry) => (
              <div key={log.id} className="flex items-start gap-2 py-0.5 px-1 hover:bg-mc-bg-hover rounded">
                <span className="text-mc-text-muted whitespace-nowrap flex-shrink-0">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
                <span className={`uppercase w-12 flex-shrink-0 font-semibold ${LEVEL_COLORS[log.level] || ''}`}>
                  [{log.level}]
                </span>
                <span className="text-mc-text-secondary flex-1 break-all">
                  {log.message}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Real-time indicator */}
      {wsLogs.length > 0 && (
        <div className="mt-2 text-xs text-mc-text-muted">
          {wsLogs.length} real-time events received via WebSocket
        </div>
      )}
    </div>
  );
}
