import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { agentsApi, tasksApi, dashboardApi, devApi, costsApi, activityApi } from '@/api/client';
import { useWSStore } from '@/stores/websocket';
import { STATUS_CONFIG, TIER_CONFIG } from '@/types';
import type { Agent, Task, WSEvent, ActivityEvent } from '@/types';

// ── Live Events helpers ─────────────────────────────────────────────────────

const EVENT_TYPE_COLOR: Record<string, string> = {
  task_created: 'bg-mc-accent-blue/10 text-mc-accent-blue',
  task_updated: 'bg-mc-accent-blue/10 text-mc-accent-blue',
  task_completed: 'bg-mc-accent-blue/10 text-mc-accent-blue',
  task_failed: 'bg-mc-accent-red/10 text-mc-accent-red',
  agent_status_change: 'bg-mc-accent-green/10 text-mc-accent-green',
  agent_registered: 'bg-mc-accent-green/10 text-mc-accent-green',
  log_entry: 'bg-mc-text-muted/10 text-mc-text-muted',
  alert_triggered: 'bg-mc-accent-amber/10 text-mc-accent-amber',
  cost_update: 'bg-mc-accent-purple/10 text-mc-accent-purple',
};

function eventColor(type: string): string {
  return EVENT_TYPE_COLOR[type] ?? 'bg-mc-bg-tertiary text-mc-text-secondary';
}

function eventDescription(event: WSEvent): string {
  const d = event.data;
  switch (event.type) {
    case 'task_created':
      return `Task created: ${(d.title as string) ?? (d.id as string) ?? ''}`;
    case 'task_updated':
      return `Task updated → ${(d.status as string) ?? ''}`;
    case 'task_completed':
      return `Task completed: ${(d.title as string) ?? (d.id as string) ?? ''}`;
    case 'task_failed':
      return `Task failed: ${(d.error_message as string) ?? (d.id as string) ?? ''}`;
    case 'agent_status_change':
      return `Agent ${(d.agent_id as string)?.slice(0, 8) ?? ''} → ${(d.status as string) ?? ''}`;
    case 'agent_registered':
      return `Agent registered: ${(d.name as string) ?? (d.id as string) ?? ''}`;
    case 'log_entry':
      return (d.message as string) ?? '';
    case 'alert_triggered':
      return `Alert: ${(d.message as string) ?? (d.type as string) ?? ''}`;
    case 'cost_update':
      return `Cost update: $${typeof d.cost === 'number' ? d.cost.toFixed(6) : d.cost ?? ''}`;
    default:
      return JSON.stringify(d).slice(0, 80);
  }
}

function formatEventAge(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

function StatCard({ label, value, subtext, color }: { label: string; value: string | number; subtext?: string; color?: string }) {
  return (
    <div className="mc-card">
      <p className="text-xs text-mc-text-muted uppercase tracking-wider">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color || 'text-mc-text-primary'}`}>{value}</p>
      {subtext && <p className="text-xs text-mc-text-muted mt-1">{subtext}</p>}
    </div>
  );
}

function AgentStatusDot({ status }: { status: string }) {
  const config = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.offline;
  return (
    <span
      className="w-2.5 h-2.5 rounded-full inline-block"
      style={{ backgroundColor: config.color }}
      title={config.label}
    />
  );
}

export default function Dashboard() {
  const { events, connected } = useWSStore();
  const queryClient = useQueryClient();
  const [seedMsg, setSeedMsg] = useState<string | null>(null);
  const seedMutation = useMutation({
    mutationFn: devApi.seed,
    onSuccess: () => {
      queryClient.invalidateQueries();
      setSeedMsg('Seeded!');
      setTimeout(() => setSeedMsg(null), 2000);
    },
  });

  const { data: demoStatus } = useQuery({
    queryKey: ['demo-status'],
    queryFn: devApi.demoStatus,
    refetchInterval: 5000,
  });

  const demoStartMutation = useMutation({
    mutationFn: devApi.demoStart,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['demo-status'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    },
  });

  const demoStopMutation = useMutation({
    mutationFn: devApi.demoStop,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['demo-status'] }),
  });

  const isDemo = demoStatus?.running ?? false;

  const { data: stats } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: dashboardApi.stats,
    refetchInterval: 10000,
  });

  // Agent list and task list are kept for the detail panels below
  const { data: agentData } = useQuery({
    queryKey: ['agents'],
    queryFn: () => agentsApi.list(),
  });

  const { data: taskData } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => tasksApi.list(),
  });

  const { data: todayCost } = useQuery({
    queryKey: ['costs', 'today'],
    queryFn: costsApi.today,
    refetchInterval: 30_000,
  });

  const { data: activityData } = useQuery({
    queryKey: ['activity-dashboard'],
    queryFn: () => activityApi.list({ limit: 5 }),
    refetchInterval: 30_000,
  });
  const recentEvents = activityData?.events ?? [];

  const agents = agentData?.agents || [];
  const tasks = taskData?.tasks || [];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold">Command Center</h2>
        <div className="flex items-center gap-2">
          {seedMsg && <span className="text-xs text-mc-accent-green">{seedMsg}</span>}
          <button
            className="mc-btn bg-mc-bg-tertiary text-mc-text-muted text-xs py-1 px-3 hover:text-mc-text-primary"
            onClick={() => seedMutation.mutate()}
            disabled={seedMutation.isPending}
            title="Create demo agents, tasks, and logs"
          >
            {seedMutation.isPending ? "Seeding..." : "Seed Demo Data"}
          </button>
          <button
            className={`mc-btn text-xs flex items-center gap-2 ${
              isDemo
                ? 'bg-mc-accent-green/20 text-mc-accent-green hover:bg-mc-accent-green/30'
                : 'mc-btn-secondary'
            }`}
            onClick={() => isDemo ? demoStopMutation.mutate() : demoStartMutation.mutate()}
            disabled={demoStartMutation.isPending || demoStopMutation.isPending}
          >
            {isDemo && (
              <span className="w-2 h-2 rounded-full bg-mc-accent-green animate-pulse inline-block" />
            )}
            {isDemo ? 'Stop Demo' : '▶ Demo Mode'}
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Total Agents"
          value={stats ? stats.agents.total : '—'}
          subtext={stats ? `${stats.agents.active} active` : undefined}
          color="text-mc-accent-blue"
        />
        <StatCard
          label="Active Tasks"
          value={stats ? stats.tasks.running : '—'}
          subtext={stats ? `${stats.tasks.total} total` : undefined}
          color="text-mc-accent-green"
        />
        <StatCard
          label="Today's Cost"
          value={stats ? `$${stats.costs.today_usd.toFixed(4)}` : '—'}
          color="text-mc-accent-amber"
        />
        <StatCard
          label="Error Rate"
          value={stats ? `${stats.tasks.error_rate.toFixed(1)}%` : '—'}
          color={stats && stats.tasks.error_rate > 5 ? 'text-mc-accent-red' : 'text-mc-accent-green'}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Agent Status Grid */}
        <div className="mc-card">
          <h3 className="text-sm font-semibold text-mc-text-secondary mb-3">Agent Status</h3>
          <div className="space-y-2">
            {agents.length === 0 ? (
              <p className="text-sm text-mc-text-muted">No agents registered. Start agents with: python -m agents.runner</p>
            ) : (
              agents.map((agent: Agent) => (
                <div key={agent.id} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-mc-bg-hover">
                  <div className="flex items-center gap-2">
                    <AgentStatusDot status={agent.status} />
                    <span className="text-sm text-mc-text-primary">{agent.name}</span>
                    <span
                      className="mc-badge text-[10px]"
                      style={{
                        backgroundColor: `${TIER_CONFIG[agent.tier as keyof typeof TIER_CONFIG]?.color}20`,
                        color: TIER_CONFIG[agent.tier as keyof typeof TIER_CONFIG]?.color,
                      }}
                    >
                      T{agent.tier}
                    </span>
                  </div>
                  <span className="text-xs text-mc-text-muted">{agent.total_tasks} tasks</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent Activity Feed */}
        <div className="mc-card">
          <h3 className="text-sm font-semibold text-mc-text-secondary mb-3">Activity Feed</h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {events.length === 0 ? (
              <p className="text-sm text-mc-text-muted">Waiting for events...</p>
            ) : (
              events.slice(0, 20).map((event: WSEvent) => (
                <div key={`${event.type}-${event.timestamp}`} className="flex items-start gap-2 py-1 text-xs">
                  <span className="text-mc-text-muted whitespace-nowrap">
                    {new Date(event.timestamp).toLocaleTimeString()}
                  </span>
                  <span className="text-mc-accent-teal">[{event.type}]</span>
                  <span className="text-mc-text-secondary truncate">
                    {JSON.stringify(event.data).slice(0, 80)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Active Tasks */}
        <div className="mc-card">
          <h3 className="text-sm font-semibold text-mc-text-secondary mb-3">Active Tasks</h3>
          <div className="space-y-2">
            {tasks.filter((t: Task) => ['running', 'queued'].includes(t.status)).length === 0 ? (
              <p className="text-sm text-mc-text-muted">No active tasks</p>
            ) : (
              tasks
                .filter((t: Task) => ['running', 'queued'].includes(t.status))
                .slice(0, 10)
                .map((task: Task) => (
                  <div key={task.id} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-mc-bg-hover">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${task.status === 'running' ? 'bg-mc-accent-blue animate-pulse' : 'bg-mc-accent-amber'}`} />
                      <span className="text-sm text-mc-text-primary truncate max-w-[200px]">{task.title}</span>
                    </div>
                    <span className="text-xs text-mc-text-muted">{task.status}</span>
                  </div>
                ))
            )}
          </div>
        </div>

        {/* Cost Overview */}
        <div className="mc-card">
          <h3 className="text-sm font-semibold text-mc-text-secondary mb-3">Cost Breakdown (Today)</h3>
          {stats ? (
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-mc-text-muted">Total Today</span>
                <span className="text-mc-accent-amber">${stats.costs.today_usd.toFixed(4)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-mc-text-muted">Unread Alerts</span>
                <span className={stats.alerts.unread > 0 ? 'text-mc-accent-red' : 'text-mc-text-primary'}>
                  {stats.alerts.unread}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-mc-text-muted">Tasks Completed</span>
                <span className="text-mc-text-primary">{stats.tasks.completed}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-mc-text-muted">Tasks Failed</span>
                <span className={stats.tasks.failed > 0 ? 'text-mc-accent-red' : 'text-mc-text-primary'}>
                  {stats.tasks.failed}
                </span>
              </div>
              {todayCost && todayCost.total_usd > 0 && (
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-mc-text-muted">Daily budget</span>
                    <span className={todayCost.total_usd > 0.8 ? 'text-mc-accent-red' : 'text-mc-accent-amber'}>
                      {((todayCost.total_usd / 1.0) * 100).toFixed(1)}% used
                    </span>
                  </div>
                  <div className="h-1.5 bg-mc-bg-tertiary rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${todayCost.total_usd > 0.8 ? 'bg-mc-accent-red' : 'bg-mc-accent-amber'}`}
                      style={{ width: `${Math.min(100, (todayCost.total_usd / 1.0) * 100)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-mc-text-muted">No cost data yet</p>
          )}
        </div>
      </div>

      {/* Recent Activity Widget */}
      <div className="mc-card mt-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-mc-text-secondary">Recent Activity</h3>
          <Link to="/activity" className="text-xs text-mc-accent-blue hover:underline">View all →</Link>
        </div>
        <div className="space-y-2">
          {recentEvents.length === 0 ? (
            <p className="text-xs text-mc-text-muted">No recent activity.</p>
          ) : (
            recentEvents.map((event: ActivityEvent) => {
              const dot =
                event.type === 'task.completed'    ? 'bg-mc-accent-green' :
                event.type === 'task.failed'       ? 'bg-mc-accent-red' :
                event.type.startsWith('alert.')    ? 'bg-mc-accent-amber' :
                                                    'bg-mc-accent-blue';
              const diff = Date.now() - new Date(event.timestamp).getTime();
              const s = Math.floor(diff / 1000);
              const rel = s < 60 ? `${s}s ago` :
                          s < 3600 ? `${Math.floor(s / 60)}m ago` :
                          `${Math.floor(s / 3600)}h ago`;
              return (
                <div key={event.id} className="flex items-center gap-2 py-1">
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dot}`} />
                  <span className="text-xs text-mc-text-secondary truncate flex-1">{event.title}</span>
                  <span className="text-[10px] text-mc-text-muted flex-shrink-0">{rel}</span>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ── Live Events Panel ── */}
      <div className="mc-card mt-6">
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-sm font-semibold text-mc-text-secondary">Live Events</h3>
          <span
            className={`w-2 h-2 rounded-full flex-shrink-0 ${
              connected ? 'bg-mc-accent-green animate-pulse' : 'bg-mc-accent-red'
            }`}
            title={connected ? 'WebSocket connected' : 'WebSocket disconnected'}
          />
        </div>
        <div className="space-y-1.5 max-h-56 overflow-y-auto font-mono text-xs">
          {events.length === 0 ? (
            <p className="text-mc-text-muted py-4 text-center text-sm font-sans">
              Waiting for events...
            </p>
          ) : (
            events.slice(0, 10).map((event: WSEvent) => (
              <div key={`${event.type}-${event.timestamp}`} className="flex items-start gap-2 py-1 px-1 rounded hover:bg-mc-bg-hover">
                <span className="text-mc-text-muted whitespace-nowrap flex-shrink-0 w-14">
                  {formatEventAge(event.timestamp)}
                </span>
                <span
                  className={`mc-badge text-[9px] flex-shrink-0 whitespace-nowrap ${eventColor(event.type)}`}
                >
                  {event.type}
                </span>
                <span className="text-mc-text-secondary truncate flex-1">
                  {eventDescription(event)}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
