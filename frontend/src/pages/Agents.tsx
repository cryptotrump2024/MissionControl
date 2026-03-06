import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { agentsApi } from '@/api/client';
import { STATUS_CONFIG, TIER_CONFIG } from '@/types';
import type { Agent } from '@/types';

function AgentCard({ agent }: { agent: Agent }) {
  const [expanded, setExpanded] = useState(false);
  const tierConfig = TIER_CONFIG[agent.tier as keyof typeof TIER_CONFIG];
  const statusConfig = STATUS_CONFIG[agent.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.offline;

  return (
    <div className={`mc-card cursor-pointer transition-all ${expanded ? 'ring-1 ring-mc-accent-blue/30' : ''}`} onClick={() => setExpanded(!expanded)}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <span
            className="w-3 h-3 rounded-full flex-shrink-0"
            style={{ backgroundColor: statusConfig.color }}
          />
          <div>
            <h3 className="text-sm font-semibold text-mc-text-primary">{agent.name}</h3>
            <div className="flex items-center gap-2 mt-1">
              <span
                className="mc-badge text-[10px]"
                style={{
                  backgroundColor: `${tierConfig?.color}20`,
                  color: tierConfig?.color,
                }}
              >
                {tierConfig?.label}
              </span>
              <span className="text-xs text-mc-text-muted">{agent.model}</span>
            </div>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs text-mc-text-muted">{agent.total_tasks} tasks</p>
          <p className="text-xs text-mc-accent-amber">${agent.total_cost.toFixed(4)}</p>
        </div>
      </div>

      {expanded && (
        <div className="mt-4 pt-4 border-t border-mc-border-primary space-y-3">
          {agent.description && (
            <p className="text-xs text-mc-text-secondary">{agent.description}</p>
          )}

          <div>
            <p className="text-xs text-mc-text-muted mb-1">Capabilities</p>
            <div className="flex flex-wrap gap-1">
              {agent.capabilities.map((cap) => (
                <span key={cap} className="mc-badge bg-mc-bg-tertiary text-mc-text-secondary text-[10px]">
                  {cap}
                </span>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs text-mc-text-muted mb-1">Tools</p>
            <div className="flex flex-wrap gap-1">
              {agent.allowed_tools.map((tool) => (
                <span key={tool} className="mc-badge bg-mc-accent-purple/10 text-mc-accent-purple text-[10px]">
                  {tool}
                </span>
              ))}
            </div>
          </div>

          {agent.delegation_targets.length > 0 && (
            <div>
              <p className="text-xs text-mc-text-muted mb-1">Can delegate to</p>
              <div className="flex flex-wrap gap-1">
                {agent.delegation_targets.map((target) => (
                  <span key={target} className="mc-badge bg-mc-accent-teal/10 text-mc-accent-teal text-[10px]">
                    {target}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-mc-text-muted">Token Budget: </span>
              <span className="text-mc-text-primary">{agent.token_budget_daily.toLocaleString()}/day</span>
            </div>
            <div>
              <span className="text-mc-text-muted">Last Heartbeat: </span>
              <span className="text-mc-text-primary">
                {agent.last_heartbeat ? new Date(agent.last_heartbeat).toLocaleTimeString() : 'Never'}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Agents() {
  const [filterTier, setFilterTier] = useState<number | undefined>();
  const [filterStatus, setFilterStatus] = useState<string | undefined>();

  const { data, isLoading } = useQuery({
    queryKey: ['agents', filterTier, filterStatus],
    queryFn: () => agentsApi.list({ tier: filterTier, status: filterStatus }),
  });

  const agents = data?.agents || [];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold">Agents ({data?.total || 0})</h2>
        <div className="flex gap-2">
          <select
            className="mc-input text-xs"
            value={filterTier ?? ''}
            onChange={(e) => setFilterTier(e.target.value ? Number(e.target.value) : undefined)}
          >
            <option value="">All Tiers</option>
            <option value="0">Governance</option>
            <option value="1">Executive</option>
            <option value="2">Management</option>
            <option value="3">Operational</option>
          </select>
          <select
            className="mc-input text-xs"
            value={filterStatus ?? ''}
            onChange={(e) => setFilterStatus(e.target.value || undefined)}
          >
            <option value="">All Status</option>
            <option value="idle">Idle</option>
            <option value="working">Working</option>
            <option value="error">Error</option>
            <option value="offline">Offline</option>
          </select>
        </div>
      </div>

      {isLoading ? (
        <p className="text-mc-text-muted">Loading agents...</p>
      ) : agents.length === 0 ? (
        <div className="mc-card text-center py-12">
          <p className="text-mc-text-muted mb-2">No agents registered yet.</p>
          <p className="text-xs text-mc-text-muted">
            Start agents with: <code className="bg-mc-bg-tertiary px-2 py-1 rounded">python -m agents.runner</code>
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {agents.map((agent: Agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>
      )}
    </div>
  );
}
