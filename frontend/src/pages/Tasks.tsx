import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { tasksApi, agentsApi } from '@/api/client';
import type { Task } from '@/types';

const STATUS_COLORS: Record<string, string> = {
  queued: 'bg-mc-accent-amber/20 text-mc-accent-amber',
  running: 'bg-mc-accent-blue/20 text-mc-accent-blue',
  completed: 'bg-mc-accent-green/20 text-mc-accent-green',
  failed: 'bg-mc-accent-red/20 text-mc-accent-red',
  cancelled: 'bg-mc-text-muted/20 text-mc-text-muted',
  awaiting_approval: 'bg-mc-accent-purple/20 text-mc-accent-purple',
};

export default function Tasks() {
  const navigate = useNavigate();
  const [filterStatus, setFilterStatus] = useState<string | undefined>();
  const [filterAgent, setFilterAgent] = useState<string | undefined>();

  const { data: agentData } = useQuery({
    queryKey: ['agents'],
    queryFn: () => agentsApi.list(),
    staleTime: 60_000,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['tasks', filterStatus, filterAgent],
    queryFn: () => tasksApi.list({ status: filterStatus, agent_id: filterAgent }),
  });

  const tasks = data?.tasks || [];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold">Tasks ({data?.total || 0})</h2>
        <div className="flex gap-2">
          <select
            className="mc-input text-xs"
            value={filterStatus ?? ''}
            onChange={(e) => setFilterStatus(e.target.value || undefined)}
          >
            <option value="">All Status</option>
            <option value="queued">Queued</option>
            <option value="running">Running</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
          </select>
          <select
            className="mc-input text-xs"
            value={filterAgent ?? ''}
            onChange={(e) => setFilterAgent(e.target.value || undefined)}
          >
            <option value="">All Agents</option>
            {(agentData?.agents || []).map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </select>
          <button className="mc-btn-primary text-xs" onClick={() => navigate('/tasks/create')}>
            + New Task
          </button>
        </div>
      </div>

      {/* Task List */}
      {isLoading ? (
        <p className="text-mc-text-muted">Loading tasks...</p>
      ) : tasks.length === 0 ? (
        <div className="mc-card text-center py-12">
          <p className="text-mc-text-muted">No tasks yet.</p>
          <button
            className="mc-btn-primary text-xs mt-4"
            onClick={() => navigate('/tasks/create')}
          >
            + Create your first task
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {tasks.map((task: Task) => (
            <div
              key={task.id}
              className="mc-card flex items-center justify-between cursor-pointer hover:border-mc-border-secondary transition-colors"
              onClick={() => navigate(`/tasks/${task.id}`)}
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <span className={`mc-badge text-[10px] ${STATUS_COLORS[task.status] || ''}`}>
                  {task.status}
                </span>
                <span className="text-sm text-mc-text-primary truncate">{task.title}</span>
                {task.parent_task_id && (
                  <span className="text-[10px] text-mc-text-muted">↳ subtask</span>
                )}
              </div>
              <div className="flex items-center gap-4 text-xs text-mc-text-muted flex-shrink-0">
                <span>P{task.priority}</span>
                {task.tokens_used > 0 && <span>{task.tokens_used.toLocaleString()} tokens</span>}
                {task.cost > 0 && <span className="text-mc-accent-amber">${task.cost.toFixed(4)}</span>}
                <span>{new Date(task.created_at).toLocaleTimeString()}</span>
                <span className="text-mc-accent-blue text-[10px]">→</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
