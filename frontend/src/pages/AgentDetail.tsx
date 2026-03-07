/**
 * AgentDetail - Full detail view for a single agent.
 * Route: /agents/:agentId
 * Tabs: Overview | Logs
 */
import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { agentsApi, logsApi } from '@/api/client';
import { STATUS_CONFIG, TIER_CONFIG } from '@/types';
import type { Task, LogEntry } from '@/types';
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
const LEVEL_COLORS: Record<string, string> = {
  debug: 'bg-mc-text-muted/10 text-mc-text-muted',
  info: 'bg-mc-accent-blue/10 text-mc-accent-blue',
  warn: 'bg-mc-accent-amber/10 text-mc-accent-amber',
  error: 'bg-mc-accent-red/10 text-mc-accent-red',
};
function LoadingSkeleton() {
  return (<div className="space-y-4 max-w-4xl animate-pulse"><div className="h-8 bg-mc-bg-tertiary rounded w-1/3" /><div className="h-24 bg-mc-bg-tertiary rounded" /><div className="h-32 bg-mc-bg-tertiary rounded" /><div className="h-48 bg-mc-bg-tertiary rounded" /></div>);
}
type ActiveTab = 'overview' | 'logs' | 'metrics';

function VolumeChart({ data }: { data: Array<{ date: string; count: number }> }) {
  const max = Math.max(...data.map((d) => d.count), 1);
  const barW = 28, gap = 8, H = 56;
  const totalW = data.length * (barW + gap) - gap;
  return (
    <svg viewBox={`0 0 ${totalW} ${H}`} className="w-full h-14">
      {data.map((d, i) => {
        const barH = Math.max((d.count / max) * (H - 18), d.count > 0 ? 3 : 0);
        const x = i * (barW + gap);
        const y = H - barH - 14;
        return (
          <g key={d.date}>
            <rect x={x} y={y} width={barW} height={barH} fill="#3b82f6" fillOpacity="0.75" rx="2" />
            <text x={x + barW / 2} y={H - 1} textAnchor="middle" fontSize="7" fill="#555">{d.date.slice(5)}</text>
            {d.count > 0 && (
              <text x={x + barW / 2} y={y - 2} textAnchor="middle" fontSize="8" fill="#3b82f6">{d.count}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function StatusSegmentBar({ breakdown, total }: { breakdown: Record<string, number>; total: number }) {
  if (total === 0) return <div className="h-3 bg-mc-bg-tertiary rounded" />;
  const segments = [
    { key: 'completed', color: '#16a34a', label: 'Done' },
    { key: 'failed', color: '#ef4444', label: 'Failed' },
    { key: 'running', color: '#3b82f6', label: 'Running' },
    { key: 'queued', color: '#d97706', label: 'Queued' },
    { key: 'cancelled', color: '#555', label: 'Cancelled' },
  ];
  return (
    <div className="space-y-2">
      <div className="h-3 rounded overflow-hidden flex">
        {segments.map(({ key, color }) => {
          const count = breakdown[key] || 0;
          if (count === 0) return null;
          return (
            <div
              key={key}
              style={{ width: `${(count / total) * 100}%`, backgroundColor: color }}
              title={`${key}: ${count}`}
            />
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {segments.map(({ key, color, label }) => {
          const count = breakdown[key] || 0;
          if (count === 0) return null;
          return (
            <span key={key} className="flex items-center gap-1 text-[10px] text-mc-text-muted">
              <span className="inline-block w-2 h-2 rounded-sm" style={{ backgroundColor: color }} />
              {label}: {count}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function AgentMetricsTab({ agentId }: { agentId: string }) {
  const { data: m, isLoading, isError } = useQuery({
    queryKey: ['agent-metrics', agentId],
    queryFn: () => agentsApi.metrics(agentId),
    refetchInterval: 30_000,
  });

  if (isLoading) return (
    <div className="space-y-4">
      {[...Array(3)].map((_, i) => <div key={i} className="h-24 bg-mc-bg-tertiary rounded animate-pulse" />)}
    </div>
  );
  if (isError || !m) return <p className="text-xs text-mc-accent-red py-6 text-center">Failed to load metrics.</p>;

  return (
    <div className="space-y-4">
      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="mc-card">
          <p className="text-xs text-mc-text-muted">Total Tasks</p>
          <p className="text-2xl font-bold text-mc-accent-blue mt-1">{m.total_tasks}</p>
        </div>
        <div className="mc-card">
          <p className="text-xs text-mc-text-muted">Success Rate</p>
          <p className={`text-2xl font-bold mt-1 ${m.success_rate >= 80 ? 'text-mc-accent-green' : m.success_rate >= 50 ? 'text-mc-accent-amber' : 'text-mc-accent-red'}`}>
            {m.success_rate}%
          </p>
        </div>
        <div className="mc-card">
          <p className="text-xs text-mc-text-muted">Avg Cost / Task</p>
          <p className="text-2xl font-bold text-mc-accent-amber mt-1">${m.avg_cost_usd.toFixed(4)}</p>
        </div>
        <div className="mc-card">
          <p className="text-xs text-mc-text-muted">Total Cost</p>
          <p className="text-2xl font-bold text-mc-accent-amber mt-1">${m.total_cost_usd.toFixed(4)}</p>
        </div>
      </div>

      {/* 7-day volume chart */}
      <div className="mc-card">
        <h3 className="text-sm font-semibold text-mc-text-secondary mb-3">7-Day Task Volume</h3>
        {m.daily_volume.every((d) => d.count === 0) ? (
          <p className="text-xs text-mc-text-muted text-center py-4">No task activity in the last 7 days.</p>
        ) : (
          <VolumeChart data={m.daily_volume} />
        )}
      </div>

      {/* Status breakdown */}
      <div className="mc-card">
        <h3 className="text-sm font-semibold text-mc-text-secondary mb-3">Status Breakdown</h3>
        <StatusSegmentBar breakdown={m.status_breakdown} total={m.total_tasks} />
        <div className="mt-3 text-xs text-mc-text-muted">
          Avg duration: <span className="text-mc-text-secondary font-medium">
            {m.avg_duration_seconds > 0 ? formatDuration(m.avg_duration_seconds) : '--'}
          </span>
        </div>
      </div>
    </div>
  );
}
function AgentLogsTab({ agentId }: { agentId: string }) {
  const { data: logs, isLoading, isError } = useQuery({ queryKey: ['agent-logs', agentId], queryFn: () => logsApi.list({ agent_id: agentId, limit: 50 }), refetchInterval: 15000 });
  if (isLoading) return (<div className="space-y-2">{[...Array(5)].map((_, i) => (<div key={i} className="h-8 bg-mc-bg-tertiary rounded animate-pulse" />))}</div>);
  if (isError) return (<p className="text-xs text-mc-accent-red py-6 text-center">Failed to load logs.</p>);
  const entries: LogEntry[] = logs ? [...logs].reverse() : [];
  if (entries.length === 0) return (<p className="text-xs text-mc-text-muted py-8 text-center">No log entries found.</p>);
  return (
    <div className="mc-card">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-mc-text-secondary">Agent Logs<span className="ml-2 font-normal text-mc-text-muted">({entries.length})</span></h3>
        <span className="text-[10px] text-mc-text-muted">Last 50 · refreshes every 15s</span>
      </div>
      <div className="flex gap-2 text-[9px] text-mc-text-muted uppercase tracking-wider border-b border-mc-border-primary pb-1.5 mb-1 font-mono px-2">
        <span className="w-16 flex-shrink-0">Age</span><span className="w-14 flex-shrink-0">Level</span><span className="flex-1">Message</span><span className="w-20 text-right flex-shrink-0">Task</span>
      </div>
      <div className="font-mono text-xs max-h-[55vh] overflow-y-auto space-y-px">
        {entries.map((log: LogEntry) => (
          <div key={log.id} className="flex items-start gap-2 py-1 px-2 rounded hover:bg-mc-bg-hover transition-colors">
            <span className="text-mc-text-muted whitespace-nowrap flex-shrink-0 w-16" title={new Date(log.timestamp).toLocaleString()}>{formatRelativeTime(log.timestamp)}</span>
            <span className={`mc-badge text-[9px] flex-shrink-0 w-14 justify-center ${LEVEL_COLORS[log.level] || LEVEL_COLORS.info}`}>{log.level.toUpperCase()}</span>
            <span className="text-mc-text-secondary break-all flex-1">{log.message}</span>
            {log.task_id ? (<Link to={`/tasks/${log.task_id}`} className="text-mc-accent-teal hover:text-mc-accent-teal/80 flex-shrink-0 w-20 truncate text-right font-mono" title={log.task_id}>{log.task_id.slice(0, 8)}...</Link>) : (<span className="text-mc-text-muted flex-shrink-0 w-20 text-right">--</span>)}
          </div>))}
      </div>
    </div>
  );
}
export default function AgentDetail() {
  const { agentId } = useParams<{ agentId: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');
  const { data: agent, isLoading, isError } = useQuery({ queryKey: ['agent', agentId], queryFn: () => agentsApi.get(agentId!), enabled: !!agentId, refetchInterval: 15000 });
  const { data: tasksData, isLoading: tasksLoading } = useQuery({ queryKey: ['agent-tasks', agentId], queryFn: () => agentsApi.tasks(agentId!, { limit: 50 }), enabled: !!agentId && activeTab === 'overview', refetchInterval: 15000 });
  const { data: metrics } = useQuery({ queryKey: ['agent-metrics', agentId], queryFn: () => agentsApi.metrics(agentId!), enabled: !!agentId, refetchInterval: 30000 });
  if (!agentId) return <p className="text-mc-accent-red">No agent ID provided.</p>;
  if (isLoading) return <LoadingSkeleton />;
  if (isError || !agent) return (<div className="mc-card text-center py-16"><p className="text-mc-accent-red font-semibold mb-2">Agent not found</p><button className="mc-btn-secondary text-xs mt-4" onClick={() => navigate('/agents')}>Back to Agents</button></div>);
  const tierConfig = TIER_CONFIG[agent.tier as keyof typeof TIER_CONFIG];
  const statusConfig = STATUS_CONFIG[agent.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.offline;
  const tasks: Task[] = tasksData?.tasks || [];
  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <div className="flex items-center gap-2 text-xs text-mc-text-muted mb-3">
          <Link to="/agents" className="hover:text-mc-text-primary transition-colors">Agents</Link>
          <span>/</span>
          <span className="text-mc-text-secondary truncate max-w-xs">{agent.name}</span>
        </div>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <span className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: statusConfig.color }} title={statusConfig.label} />
            <div className="min-w-0">
              <h2 className="text-xl font-bold text-mc-text-primary">{agent.name}</h2>
              <div className="flex items-center flex-wrap gap-2 mt-1">
                {tierConfig && (<span className="mc-badge text-[10px]" style={{ backgroundColor: `${tierConfig.color}20`, color: tierConfig.color }}>{tierConfig.label}</span>)}
                <span className="mc-badge bg-mc-bg-tertiary text-mc-text-secondary text-[10px]">{agent.type}</span>
                <span className="text-xs text-mc-text-muted font-mono">{agent.model}</span>
                <span className="text-xs font-semibold" style={{ color: statusConfig.color }}>{statusConfig.label}</span>
              </div>
            </div>
          </div>
          <button className="mc-btn-secondary text-xs flex-shrink-0" onClick={() => navigate('/agents')}>Back</button>
        </div>
        {agent.description && <p className="text-sm text-mc-text-secondary mt-3">{agent.description}</p>}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="mc-card"><p className="text-xs text-mc-text-muted">Total Tasks</p><p className="text-2xl font-bold text-mc-accent-blue mt-1">{agent.total_tasks}</p></div>
        <div className="mc-card"><p className="text-xs text-mc-text-muted">Total Cost</p><p className="text-2xl font-bold text-mc-accent-amber mt-1">${agent.total_cost.toFixed(4)}</p></div>
        <div className="mc-card"><p className="text-xs text-mc-text-muted">Token Budget / Day</p><p className="text-2xl font-bold text-mc-text-primary mt-1">{agent.token_budget_daily.toLocaleString()}</p></div>
        <div className="mc-card"><p className="text-xs text-mc-text-muted">Last Heartbeat</p><p className="text-sm font-semibold text-mc-text-primary mt-1">{agent.last_heartbeat ? formatRelativeTime(agent.last_heartbeat) : 'Never'}</p></div>
      </div>
      <div className="flex gap-1 border-b border-mc-border-primary">
        {(['overview', 'logs', 'metrics'] as ActiveTab[]).map((tab) => (<button key={tab} onClick={() => setActiveTab(tab)} className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${activeTab === tab ? 'border-mc-accent-blue text-mc-accent-blue' : 'border-transparent text-mc-text-muted hover:text-mc-text-secondary'}`}>{tab === 'overview' ? 'Overview' : tab === 'logs' ? 'Logs' : 'Metrics'}</button>))}
      </div>
      {activeTab === 'overview' && (<>
        {metrics && (<div className="mc-card"><h3 className="text-sm font-semibold text-mc-text-secondary mb-3">Performance Metrics</h3><div className="grid grid-cols-2 sm:grid-cols-4 gap-4"><div><p className="text-xs text-mc-text-muted">Success Rate</p><p className="text-2xl font-bold text-mc-accent-green mt-1">{metrics.success_rate}%</p></div><div><p className="text-xs text-mc-text-muted">Total / Done / Failed</p><p className="text-lg font-bold text-mc-text-primary mt-1">{metrics.total_tasks}<span className="text-sm font-normal text-mc-text-muted"> / </span><span className="text-mc-accent-green">{metrics.completed}</span><span className="text-sm font-normal text-mc-text-muted"> / </span><span className="text-mc-accent-red">{metrics.failed}</span></p></div><div><p className="text-xs text-mc-text-muted">Avg Duration</p><p className="text-2xl font-bold text-mc-accent-blue mt-1">{metrics.avg_duration_seconds > 0 ? formatDuration(metrics.avg_duration_seconds) : '--'}</p></div><div><p className="text-xs text-mc-text-muted">Total Cost</p><p className="text-2xl font-bold text-mc-accent-amber mt-1">${metrics.total_cost_usd.toFixed(4)}</p></div></div></div>)}
        <div className="mc-card space-y-4"><h3 className="text-sm font-semibold text-mc-text-secondary">Configuration</h3>
          {agent.capabilities.length > 0 && (<div><p className="text-xs text-mc-text-muted mb-1.5">Capabilities</p><div className="flex flex-wrap gap-1.5">{agent.capabilities.map(cap => (<span key={cap} className="mc-badge bg-mc-bg-tertiary text-mc-text-secondary text-[10px]">{cap}</span>))}</div></div>)}
          {agent.allowed_tools.length > 0 && (<div><p className="text-xs text-mc-text-muted mb-1.5">Allowed Tools</p><div className="flex flex-wrap gap-1.5">{agent.allowed_tools.map(t => (<span key={t} className="mc-badge bg-mc-accent-purple/10 text-mc-accent-purple text-[10px]">{t}</span>))}</div></div>)}
          {agent.delegation_targets.length > 0 && (<div><p className="text-xs text-mc-text-muted mb-1.5">Can Delegate To</p><div className="flex flex-wrap gap-1.5">{agent.delegation_targets.map(target => (<span key={target} className="mc-badge bg-mc-accent-teal/10 text-mc-accent-teal text-[10px]">{target}</span>))}</div></div>)}
          {agent.delegation_targets.length === 0 && agent.allowed_tools.length === 0 && agent.capabilities.length === 0 && (<p className="text-xs text-mc-text-muted">No configuration data.</p>)}
        </div>
        <div className="mc-card"><h3 className="text-sm font-semibold text-mc-text-secondary mb-3">Recent Tasks ({tasksData?.total ?? 0})</h3>
          {tasksLoading ? (<div className="space-y-2">{[...Array(3)].map((_, i) => (<div key={i} className="h-10 bg-mc-bg-tertiary rounded animate-pulse" />))}</div>) : tasks.length === 0 ? (<p className="text-xs text-mc-text-muted py-6 text-center">No tasks yet.</p>) : (<div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="border-b border-mc-border-primary text-mc-text-muted"><th className="text-left pb-2 font-medium">Status</th><th className="text-left pb-2 font-medium pl-3">Title</th><th className="text-left pb-2 font-medium pl-3 hidden sm:table-cell">Created</th><th className="text-right pb-2 font-medium pl-3">Cost</th></tr></thead><tbody className="divide-y divide-mc-border-primary/50">{tasks.map((task: Task) => (<tr key={task.id} className="hover:bg-mc-bg-tertiary/30 transition-colors"><td className="py-2 pr-1"><span className={`mc-badge border text-[10px] ${TASK_STATUS_COLORS[task.status] || ''}`}>{task.status.replace('_', ' ')}</span></td><td className="py-2 pl-3 max-w-[200px] sm:max-w-xs"><Link to={`/tasks/${task.id}`} className="text-mc-text-primary hover:text-mc-accent-blue transition-colors truncate block" title={task.title}>{task.title}</Link></td><td className="py-2 pl-3 text-mc-text-muted hidden sm:table-cell whitespace-nowrap">{formatRelativeTime(task.created_at)}</td><td className="py-2 pl-3 text-right text-mc-accent-amber whitespace-nowrap">${task.cost.toFixed(6)}</td></tr>))}</tbody></table></div>)}
        </div>
      </>)}
      {activeTab === 'logs' && <AgentLogsTab agentId={agentId} />}
      {activeTab === 'metrics' && <AgentMetricsTab agentId={agentId} />}
    </div>
  );
}
