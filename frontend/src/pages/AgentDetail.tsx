/**
 * AgentDetail — Full detail view for a single agent.
 * Route: /agents/:agentId
 *
 * Sections:
 *   - Header: name, status dot, tier badge, type, model, back button
 *   - Stats row: total_tasks, total_cost, token_budget_daily, last_heartbeat
 *   - Capabilities, allowed tools, delegation targets (badge lists)
 *   - Recent tasks table (GET /api/agents/:agentId/tasks)
 */

import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { agentsApi } from '@/api/client';
import { STATUS_CONFIG, TIER_CONFIG } from '@/types';
import type { Task } from '@/types';

// ── Helpers ────────────────────────────────────────────────────────────────

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

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

const TASK_STATUS_COLORS: Record<string, string> = {
  queued: 'bg-mc-accent-amber/20 text-mc-accent-amber border-mc-accent-amber/30',
  running: 'bg-mc-accent-blue/20 text-mc-accent-blue border-mc-accent-blue/30',
  completed: 'bg-mc-accent-green/20 text-mc-accent-green border-mc-accent-green/30',
  failed: 'bg-mc-accent-red/20 text-mc-accent-red border-mc-accent-red/30',
  cancelled: 'bg-mc-text-muted/20 text-mc-text-muted border-mc-text-muted/30',
  awaiting_approval: 'bg-mc-accent-purple/20 text-mc-accent-purple border-mc-accent-purple/30',
};

// ── Skeleton ───────────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="space-y-4 max-w-4xl animate-pulse">
      <div className="h-8 bg-mc-bg-tertiary rounded w-1/3" />
      <div className="h-24 bg-mc-bg-tertiary rounded" />
      <div className="h-32 bg-mc-bg-tertiary rounded" />
      <div className="h-48 bg-mc-bg-tertiary rounded" />
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function AgentDetail() {
  const { agentId } = useParams<{ agentId: string }>();
  const navigate = useNavigate();

  const { data: agent, isLoading, isError } = useQuery({
    queryKey: ['agent', agentId],
    queryFn: () => agentsApi.get(agentId!),
    enabled: !!agentId,
    refetchInterval: 15000,
  });

  const { data: tasksData, isLoading: tasksLoading } = useQuery({
    queryKey: ['agent-tasks', agentId],
    queryFn: () => agentsApi.tasks(agentId!, { limit: 50 }),
    enabled: !!agentId,
    refetchInterval: 15000,
  });

  const { data: metrics } = useQuery({
    queryKey: ['agent-metrics', agentId],
    queryFn: () => agentsApi.metrics(agentId!),
    enabled: !!agentId,
    refetchInterval: 30000,
  });

  if (!agentId) {
    return <p className="text-mc-accent-red">No agent ID provided.</p>;
  }

  if (isLoading) {
    return <LoadingSkeleton />;
  }

  if (isError || !agent) {
    return (
      <div className="mc-card text-center py-16">
        <p className="text-mc-accent-red font-semibold mb-2">Agent not found</p>
        <button className="mc-btn-secondary text-xs mt-4" onClick={() => navigate('/agents')}>
          Back to Agents
        </button>
      </div>
    );
  }

  const tierConfig = TIER_CONFIG[agent.tier as keyof typeof TIER_CONFIG];
  const statusConfig = STATUS_CONFIG[agent.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.offline;
  const tasks: Task[] = tasksData?.tasks || [];

  return (
    <div className="space-y-6 max-w-4xl">
      {/* ── Breadcrumb + Header ── */}
      <div>
        <div className="flex items-center gap-2 text-xs text-mc-text-muted mb-3">
          <Link to="/agents" className="hover:text-mc-text-primary transition-colors">
            Agents
          </Link>
          <span>/</span>
          <span className="text-mc-text-secondary truncate max-w-xs">{agent.name}</span>
        </div>

        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <span
              className="w-4 h-4 rounded-full flex-shrink-0"
              style={{ backgroundColor: statusConfig.color }}
              title={statusConfig.label}
            />
            <div className="min-w-0">
              <h2 className="text-xl font-bold text-mc-text-primary">{agent.name}</h2>
              <div className="flex items-center flex-wrap gap-2 mt-1">
                {tierConfig && (
                  <span
                    className="mc-badge text-[10px]"
                    style={{
                      backgroundColor: `${tierConfig.color}20`,
                      color: tierConfig.color,
                    }}
                  >
                    {tierConfig.label}
                  </span>
                )}
                <span className="mc-badge bg-mc-bg-tertiary text-mc-text-secondary text-[10px]">
                  {agent.type}
                </span>
                <span className="text-xs text-mc-text-muted font-mono">{agent.model}</span>
                <span
                  className="text-xs font-semibold"
                  style={{ color: statusConfig.color }}
                >
                  {statusConfig.label}
                </span>
              </div>
            </div>
          </div>

          <button
            className="mc-btn-secondary text-xs flex-shrink-0"
            onClick={() => navigate('/agents')}
          >
            Back
          </button>
        </div>

        {agent.description && (
          <p className="text-sm text-mc-text-secondary mt-3">{agent.description}</p>
        )}
      </div>

      {/* ── Stats Row ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="mc-card">
          <p className="text-xs text-mc-text-muted">Total Tasks</p>
          <p className="text-2xl font-bold text-mc-accent-blue mt-1">{agent.total_tasks}</p>
        </div>
        <div className="mc-card">
          <p className="text-xs text-mc-text-muted">Total Cost</p>
          <p className="text-2xl font-bold text-mc-accent-amber mt-1">${agent.total_cost.toFixed(4)}</p>
        </div>
        <div className="mc-card">
          <p className="text-xs text-mc-text-muted">Token Budget / Day</p>
          <p className="text-2xl font-bold text-mc-text-primary mt-1">
            {agent.token_budget_daily.toLocaleString()}
          </p>
        </div>
        <div className="mc-card">
          <p className="text-xs text-mc-text-muted">Last Heartbeat</p>
          <p className="text-sm font-semibold text-mc-text-primary mt-1">
            {agent.last_heartbeat ? formatRelativeTime(agent.last_heartbeat) : 'Never'}
          </p>
        </div>
      </div>

      {/* ── Performance Metrics ── */}
      {metrics && (
        <div className="mc-card">
          <h3 className="text-sm font-semibold text-mc-text-secondary mb-3">Performance Metrics</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-mc-text-muted">Success Rate</p>
              <p className="text-2xl font-bold text-mc-accent-green mt-1">{metrics.success_rate}%</p>
            </div>
            <div>
              <p className="text-xs text-mc-text-muted">Total / Done / Failed</p>
              <p className="text-lg font-bold text-mc-text-primary mt-1">
                {metrics.total_tasks}
                <span className="text-sm font-normal text-mc-text-muted"> / </span>
                <span className="text-mc-accent-green">{metrics.completed}</span>
                <span className="text-sm font-normal text-mc-text-muted"> / </span>
                <span className="text-mc-accent-red">{metrics.failed}</span>
              </p>
            </div>
            <div>
              <p className="text-xs text-mc-text-muted">Avg Duration</p>
              <p className="text-2xl font-bold text-mc-accent-blue mt-1">
                {metrics.avg_duration_seconds > 0 ? formatDuration(metrics.avg_duration_seconds) : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-mc-text-muted">Total Cost</p>
              <p className="text-2xl font-bold text-mc-accent-amber mt-1">
                ${metrics.total_cost_usd.toFixed(4)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Capabilities, Tools, Delegation Targets ── */}
      <div className="mc-card space-y-4">
        <h3 className="text-sm font-semibold text-mc-text-secondary">Configuration</h3>

        {agent.capabilities.length > 0 && (
          <div>
            <p className="text-xs text-mc-text-muted mb-1.5">Capabilities</p>
            <div className="flex flex-wrap gap-1.5">
              {agent.capabilities.map((cap) => (
                <span
                  key={cap}
                  className="mc-badge bg-mc-bg-tertiary text-mc-text-secondary text-[10px]"
                >
                  {cap}
                </span>
              ))}
            </div>
          </div>
        )}

        {agent.allowed_tools.length > 0 && (
          <div>
            <p className="text-xs text-mc-text-muted mb-1.5">Allowed Tools</p>
            <div className="flex flex-wrap gap-1.5">
              {agent.allowed_tools.map((t) => (
                <span
                  key={t}
                  className="mc-badge bg-mc-accent-purple/10 text-mc-accent-purple text-[10px]"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
        )}

        {agent.delegation_targets.length > 0 && (
          <div>
            <p className="text-xs text-mc-text-muted mb-1.5">Can Delegate To</p>
            <div className="flex flex-wrap gap-1.5">
              {agent.delegation_targets.map((target) => (
                <span
                  key={target}
                  className="mc-badge bg-mc-accent-teal/10 text-mc-accent-teal text-[10px]"
                >
                  {target}
                </span>
              ))}
            </div>
          </div>
        )}

        {agent.delegation_targets.length === 0 &&
          agent.allowed_tools.length === 0 &&
          agent.capabilities.length === 0 && (
          <p className="text-xs text-mc-text-muted">No configuration data available.</p>
        )}
      </div>

      {/* ── Recent Tasks Table ── */}
      <div className="mc-card">
        <h3 className="text-sm font-semibold text-mc-text-secondary mb-3">
          Recent Tasks ({tasksData?.total ?? 0})
        </h3>

        {tasksLoading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-10 bg-mc-bg-tertiary rounded animate-pulse" />
            ))}
          </div>
        ) : tasks.length === 0 ? (
          <p className="text-xs text-mc-text-muted py-6 text-center">
            No tasks assigned to this agent yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-mc-border-primary text-mc-text-muted">
                  <th className="text-left pb-2 font-medium">Status</th>
                  <th className="text-left pb-2 font-medium pl-3">Title</th>
                  <th className="text-left pb-2 font-medium pl-3 hidden sm:table-cell">Created</th>
                  <th className="text-right pb-2 font-medium pl-3">Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-mc-border-primary/50">
                {tasks.map((task: Task) => (
                  <tr key={task.id} className="hover:bg-mc-bg-tertiary/30 transition-colors">
                    <td className="py-2 pr-1">
                      <span
                        className={`mc-badge border text-[10px] ${TASK_STATUS_COLORS[task.status] || ''}`}
                      >
                        {task.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="py-2 pl-3 max-w-[200px] sm:max-w-xs">
                      <Link
                        to={`/tasks/${task.id}`}
                        className="text-mc-text-primary hover:text-mc-accent-blue transition-colors truncate block"
                        title={task.title}
                      >
                        {task.title}
                      </Link>
                    </td>
                    <td className="py-2 pl-3 text-mc-text-muted hidden sm:table-cell whitespace-nowrap">
                      {formatRelativeTime(task.created_at)}
                    </td>
                    <td className="py-2 pl-3 text-right text-mc-accent-amber whitespace-nowrap">
                      ${task.cost.toFixed(6)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
