import { useQuery } from '@tanstack/react-query';
import { agentsApi, tasksApi, costsApi } from '@/api/client';
import { useWSStore } from '@/stores/websocket';
import { STATUS_CONFIG, TIER_CONFIG } from '@/types';
import type { Agent, Task, WSEvent } from '@/types';

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
  const { events } = useWSStore();

  const { data: agentData } = useQuery({
    queryKey: ['agents'],
    queryFn: () => agentsApi.list(),
  });

  const { data: taskData } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => tasksApi.list(),
  });

  const { data: costData } = useQuery({
    queryKey: ['costs', 'today'],
    queryFn: () => costsApi.summary('today'),
  });

  const agents = agentData?.agents || [];
  const tasks = taskData?.tasks || [];
  const activeAgents = agents.filter((a: Agent) => a.status !== 'offline').length;
  const activeTasks = tasks.filter((t: Task) => t.status === 'running').length;
  const errorRate = tasks.length > 0
    ? ((tasks.filter((t: Task) => t.status === 'failed').length / tasks.length) * 100).toFixed(1)
    : '0.0';

  return (
    <div>
      <h2 className="text-xl font-bold mb-6">Command Center</h2>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Agents" value={agents.length} subtext={`${activeAgents} active`} color="text-mc-accent-blue" />
        <StatCard label="Active Tasks" value={activeTasks} subtext={`${tasks.length} total`} color="text-mc-accent-green" />
        <StatCard label="Today's Cost" value={`$${(costData?.total_cost || 0).toFixed(4)}`} color="text-mc-accent-amber" />
        <StatCard label="Error Rate" value={`${errorRate}%`} color={parseFloat(errorRate as string) > 5 ? 'text-mc-accent-red' : 'text-mc-accent-green'} />
      </div>

      <div className="grid grid-cols-2 gap-6">
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
              events.slice(0, 20).map((event: WSEvent, i: number) => (
                <div key={i} className="flex items-start gap-2 py-1 text-xs">
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
          {costData ? (
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-mc-text-muted">Input Tokens</span>
                <span className="text-mc-text-primary">{costData.total_input_tokens.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-mc-text-muted">Output Tokens</span>
                <span className="text-mc-text-primary">{costData.total_output_tokens.toLocaleString()}</span>
              </div>
              <div className="border-t border-mc-border-primary pt-2 mt-2">
                {Object.entries(costData.by_model).map(([model, cost]) => (
                  <div key={model} className="flex justify-between text-xs py-0.5">
                    <span className="text-mc-text-muted">{model}</span>
                    <span className="text-mc-accent-amber">${(cost as number).toFixed(4)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-mc-text-muted">No cost data yet</p>
          )}
        </div>
      </div>
    </div>
  );
}
