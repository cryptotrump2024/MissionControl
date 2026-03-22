/**
 * TaskDetail — Full detail view for a single task.
 * Route: /tasks/:taskId
 *
 * Sections:
 *   - Header: title, status badge, timestamps, back button
 *   - Description
 *   - Delegation tree (parent → current → children)
 *   - Live log viewer (WebSocket + initial API fetch)
 *   - Cost breakdown
 */

import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tasksApi, logsApi } from '@/api/client';
import { useWebSocket } from '@/hooks/useWebSocket';
import DelegationTree from '@/components/DelegationTree';
import type { LogEntry } from '@/types';

// ── Helpers ────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  queued: 'bg-mc-accent-amber/20 text-mc-accent-amber border-mc-accent-amber/30',
  running: 'bg-mc-accent-blue/20 text-mc-accent-blue border-mc-accent-blue/30',
  completed: 'bg-mc-accent-green/20 text-mc-accent-green border-mc-accent-green/30',
  failed: 'bg-mc-accent-red/20 text-mc-accent-red border-mc-accent-red/30',
  cancelled: 'bg-mc-text-muted/20 text-mc-text-muted border-mc-text-muted/30',
  awaiting_approval: 'bg-mc-accent-purple/20 text-mc-accent-purple border-mc-accent-purple/30',
};

const LOG_LEVEL_COLORS: Record<string, string> = {
  debug: 'text-mc-text-muted',
  info: 'text-mc-accent-blue',
  warn: 'text-mc-accent-amber',
  error: 'text-mc-accent-red',
};

const LOG_LEVEL_BG: Record<string, string> = {
  debug: '',
  info: '',
  warn: 'bg-mc-accent-amber/5',
  error: 'bg-mc-accent-red/5',
};

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString();
}

// ── Log Viewer ─────────────────────────────────────────────────────────────

function LogViewer({ taskId }: { taskId: string }) {
  const [liveEntries, setLiveEntries] = useState<LogEntry[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const { subscribe } = useWebSocket();

  // Initial fetch
  const { data: apiLogs, isLoading } = useQuery({
    queryKey: ['logs', 'task', taskId],
    queryFn: () => logsApi.list({ task_id: taskId, limit: 200 }),
  });

  // Subscribe to live log events for this task
  useEffect(() => {
    const unsub = subscribe('log_entry', (data) => {
      const entry = data as unknown as LogEntry;
      if (!entry.task_id || entry.task_id !== taskId) return;
      setLiveEntries((prev) => [...prev, entry]);
    });
    return unsub;
  }, [subscribe, taskId]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [liveEntries, apiLogs, autoScroll]);

  // Merge API logs + live entries, deduplicated by id
  const apiLogsArr = apiLogs || [];
  const allLogs: LogEntry[] = [...apiLogsArr].reverse(); // API returns newest-first; show oldest-first
  const liveIds = new Set(apiLogsArr.map((l) => l.id));
  for (const entry of liveEntries) {
    if (!liveIds.has(entry.id)) {
      allLogs.push(entry);
    }
  }

  return (
    <div className="mc-card">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-mc-text-secondary">Log Stream</h3>
        <div className="flex items-center gap-3">
          <span className="text-xs text-mc-text-muted">{allLogs.length} entries</span>
          <label className="flex items-center gap-1.5 text-xs text-mc-text-muted cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="rounded"
            />
            Auto-scroll
          </label>
        </div>
      </div>

      <div className="font-mono text-xs space-y-0 max-h-80 overflow-y-auto bg-mc-bg-secondary rounded-md p-2">
        {isLoading ? (
          <p className="text-mc-text-muted py-4 text-center">Loading logs...</p>
        ) : allLogs.length === 0 ? (
          <p className="text-mc-text-muted py-4 text-center">No log entries for this task yet.</p>
        ) : (
          allLogs.map((log: LogEntry) => (
            <div
              key={log.id}
              className={`flex items-start gap-2 py-0.5 px-1 rounded ${LOG_LEVEL_BG[log.level] || ''}`}
            >
              <span
                className="text-mc-text-muted whitespace-nowrap flex-shrink-0 w-20"
                title={new Date(log.timestamp).toLocaleString()}
              >
                {new Date(log.timestamp).toLocaleTimeString()}
              </span>
              <span
                className={`uppercase w-12 flex-shrink-0 font-bold ${LOG_LEVEL_COLORS[log.level] || 'text-mc-text-muted'}`}
              >
                [{log.level}]
              </span>
              <span className="text-mc-text-secondary break-all flex-1">{log.message}</span>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function TaskDetail() {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { subscribe } = useWebSocket();

  const { data: task, isLoading, isError } = useQuery({
    queryKey: ['task', taskId],
    queryFn: () => tasksApi.get(taskId!),
    enabled: !!taskId,
    refetchInterval: 5000, // Poll for status updates
  });

  // Invalidate task query on WebSocket task events
  useEffect(() => {
    if (!taskId) return;
    const events = ['task_updated', 'task_completed', 'task_failed'] as const;
    const unsubs = events.map((evtType) =>
      subscribe(evtType, (data) => {
        const d = data as unknown as { id?: string };
        if (d?.id === taskId) {
          queryClient.invalidateQueries({ queryKey: ['task', taskId] });
        }
      })
    );
    return () => unsubs.forEach((u) => u());
  }, [subscribe, taskId, queryClient]);

  const cancelMutation = useMutation({
    mutationFn: () => tasksApi.cancel(taskId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task', taskId] });
    },
  });

  const retryMutation = useMutation({
    mutationFn: () => tasksApi.retry(taskId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task', taskId] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  if (!taskId) {
    return <p className="text-mc-accent-red">No task ID provided.</p>;
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-10 bg-mc-bg-tertiary rounded animate-pulse w-1/2" />
        <div className="h-32 bg-mc-bg-tertiary rounded animate-pulse" />
        <div className="h-48 bg-mc-bg-tertiary rounded animate-pulse" />
      </div>
    );
  }

  if (isError || !task) {
    return (
      <div className="mc-card text-center py-16">
        <p className="text-mc-accent-red font-semibold mb-2">Task not found</p>
        <button className="mc-btn-secondary text-xs mt-4" onClick={() => navigate('/tasks')}>
          ← Back to Tasks
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* ── Header ── */}
      <div>
        <div className="flex items-center gap-2 text-xs text-mc-text-muted mb-3">
          <Link to="/tasks" className="hover:text-mc-text-primary transition-colors">
            Tasks
          </Link>
          <span>/</span>
          <span className="text-mc-text-secondary truncate max-w-xs">{task.title}</span>
        </div>

        <div className="flex flex-col sm:flex-row items-start justify-between gap-3 sm:gap-4">
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold text-mc-text-primary break-words">{task.title}</h2>
            <div className="flex items-center flex-wrap gap-3 mt-2">
              <span
                className={`mc-badge border text-xs ${STATUS_COLORS[task.status] || ''}`}
              >
                {task.status.replace('_', ' ')}
              </span>
              <span className="text-xs text-mc-text-muted">Priority {task.priority}</span>
              {task.agent_id && (
                <Link
                  to={`/agents/${task.agent_id}`}
                  className="text-xs text-mc-accent-blue hover:underline"
                  title={task.agent_id}
                >
                  Agent: {task.agent_id.slice(0, 8)}…
                </Link>
              )}
              {task.delegated_to && (
                <span className="text-xs text-mc-text-muted">
                  Delegated to: <span className="text-mc-accent-teal">{task.delegated_to}</span>
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
            {task.status === 'queued' || task.status === 'running' ? (
              <button
                className="mc-btn text-xs bg-mc-accent-red/20 text-mc-accent-red hover:bg-mc-accent-red/30 border-mc-accent-red/30"
                onClick={() => cancelMutation.mutate()}
                disabled={cancelMutation.isPending}
              >
                {cancelMutation.isPending ? 'Cancelling…' : '✕ Cancel'}
              </button>
            ) : null}
            {task.status === 'failed' || task.status === 'cancelled' ? (
              <button
                className="mc-btn text-xs bg-mc-accent-amber/20 text-mc-accent-amber hover:bg-mc-accent-amber/30 border-mc-accent-amber/30"
                onClick={() => retryMutation.mutate()}
                disabled={retryMutation.isPending}
              >
                {retryMutation.isPending ? 'Retrying…' : '↺ Retry'}
              </button>
            ) : null}
            <button
              className="mc-btn-secondary text-xs"
              onClick={() => navigate('/tasks')}
            >
              ← Back
            </button>
          </div>
        </div>

        {/* Timestamps */}
        <div className="flex flex-wrap gap-4 mt-3 text-xs text-mc-text-muted">
          <span title={task.created_at}>Created {formatRelativeTime(task.created_at)}</span>
          {task.started_at && (
            <span title={task.started_at}>Started {formatRelativeTime(task.started_at)}</span>
          )}
          {task.completed_at && (
            <span title={task.completed_at}>Completed {formatRelativeTime(task.completed_at)}</span>
          )}
          {task.scheduled_at && (
            <span title={task.scheduled_at}>
              🕐 Scheduled for {new Date(task.scheduled_at).toLocaleString()}
            </span>
          )}
        </div>
      </div>

      {/* ── Description ── */}
      {task.description && (
        <div className="mc-card">
          <h3 className="text-sm font-semibold text-mc-text-secondary mb-2">Description</h3>
          <p className="text-sm text-mc-text-primary whitespace-pre-wrap">{task.description}</p>
        </div>
      )}

      {/* ── Error ── */}
      {task.error_message && (
        <div className="mc-card border-l-2 border-mc-accent-red">
          <h3 className="text-sm font-semibold text-mc-accent-red mb-1">Error</h3>
          <p className="text-xs text-mc-text-secondary font-mono whitespace-pre-wrap">{task.error_message}</p>
        </div>
      )}

      {/* ── Delegation Tree ── */}
      <div className="mc-card">
        <h3 className="text-sm font-semibold text-mc-text-secondary mb-3">Delegation Tree</h3>
        <DelegationTree taskId={taskId} />
      </div>

      {/* ── Live Logs ── */}
      <LogViewer taskId={taskId} />

      {/* ── Cost & Tokens ── */}
      <div className="mc-card">
        <h3 className="text-sm font-semibold text-mc-text-secondary mb-3">Cost & Usage</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-mc-text-muted">Tokens Used</p>
            <p className="text-lg font-bold text-mc-accent-blue mt-0.5">
              {task.tokens_used.toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-xs text-mc-text-muted">Cost (USD)</p>
            <p className="text-lg font-bold text-mc-accent-amber mt-0.5">
              ${task.cost.toFixed(6)}
            </p>
          </div>
          <div>
            <p className="text-xs text-mc-text-muted">Status</p>
            <p className="text-sm font-semibold text-mc-text-primary mt-0.5 capitalize">
              {task.status.replace('_', ' ')}
            </p>
          </div>
          <div>
            <p className="text-xs text-mc-text-muted">Requires Approval</p>
            <p className="text-sm font-semibold text-mc-text-primary mt-0.5">
              {task.requires_approval ? 'Yes' : 'No'}
            </p>
          </div>
        </div>
      </div>

      {/* ── Output Data ── */}
      {task.output_data && Object.keys(task.output_data).length > 0 && (
        <div className="mc-card">
          <h3 className="text-sm font-semibold text-mc-text-secondary mb-2">Output</h3>
          <pre className="bg-mc-bg-secondary p-3 rounded text-xs overflow-x-auto max-h-60 text-mc-text-secondary">
            {JSON.stringify(task.output_data, null, 2)}
          </pre>
        </div>
      )}

      {/* ── Input Data ── */}
      {task.input_data && Object.keys(task.input_data).length > 0 && (
        <div className="mc-card">
          <h3 className="text-sm font-semibold text-mc-text-secondary mb-2">Input Data</h3>
          <pre className="bg-mc-bg-secondary p-3 rounded text-xs overflow-x-auto max-h-60 text-mc-text-secondary">
            {JSON.stringify(task.input_data, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
