import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { tasksApi, agentsApi, exportApi } from '@/api/client';
import type { Task } from '@/types';

const STATUS_COLORS: Record<string, string> = {
  queued: 'bg-mc-accent-amber/20 text-mc-accent-amber',
  running: 'bg-mc-accent-blue/20 text-mc-accent-blue',
  completed: 'bg-mc-accent-green/20 text-mc-accent-green',
  failed: 'bg-mc-accent-red/20 text-mc-accent-red',
  cancelled: 'bg-mc-text-muted/20 text-mc-text-muted',
  awaiting_approval: 'bg-mc-accent-purple/20 text-mc-accent-purple',
};

const PAGE_SIZE = 25;

export default function Tasks() {
  const navigate = useNavigate();
  const [filterStatus, setFilterStatus] = useState<string | undefined>();
  const [filterAgent, setFilterAgent] = useState<string | undefined>();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);

  const { data: agentData } = useQuery({
    queryKey: ['agents'],
    queryFn: () => agentsApi.list(),
    staleTime: 60_000,
  });

  // Reset page when filters change
  const handleStatusChange = (val: string) => { setFilterStatus(val || undefined); setPage(0); };
  const handleAgentChange = (val: string) => { setFilterAgent(val || undefined); setPage(0); };
  const handleSearchChange = (val: string) => { setSearch(val); setPage(0); };

  const { data, isLoading } = useQuery({
    queryKey: ['tasks', filterStatus, filterAgent, page],
    queryFn: () => tasksApi.list({ status: filterStatus, agent_id: filterAgent }),
    refetchInterval: 10_000,
  });

  const allTasks = data?.tasks || [];

  // Client-side title search filter
  const tasks = useMemo(() => {
    if (!search.trim()) return allTasks;
    const q = search.toLowerCase();
    return allTasks.filter((t: Task) => t.title.toLowerCase().includes(q));
  }, [allTasks, search]);

  // Paginate the (possibly filtered) list
  const pagedTasks = tasks.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(tasks.length / PAGE_SIZE);
  const showingFrom = tasks.length === 0 ? 0 : page * PAGE_SIZE + 1;
  const showingTo = Math.min((page + 1) * PAGE_SIZE, tasks.length);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold">
          Tasks
          <span className="text-sm font-normal text-mc-text-muted ml-2">
            {search
              ? `(${tasks.length} of ${data?.total || 0})`
              : `(${data?.total || 0})`}
          </span>
        </h2>
        <div className="flex gap-2 flex-wrap">
          {/* Title search */}
          <div className="relative">
            <input
              type="text"
              placeholder="Search titles…"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="bg-mc-bg-secondary border border-mc-border-primary rounded px-3 py-1.5 text-sm text-mc-text-primary placeholder-mc-text-muted focus:outline-none focus:border-mc-accent-blue w-40 pr-7"
            />
            {search && (
              <button
                className="absolute right-2 top-1/2 -translate-y-1/2 text-mc-text-muted hover:text-mc-text-primary transition-colors"
                onClick={() => handleSearchChange('')}
                title="Clear search"
              >
                ✕
              </button>
            )}
          </div>
          <select
            className="mc-input text-xs"
            value={filterStatus ?? ''}
            onChange={(e) => handleStatusChange(e.target.value)}
          >
            <option value="">All Status</option>
            <option value="queued">Queued</option>
            <option value="running">Running</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
            <option value="cancelled">Cancelled</option>
            <option value="awaiting_approval">Awaiting Approval</option>
          </select>
          <select
            className="mc-input text-xs"
            value={filterAgent ?? ''}
            onChange={(e) => handleAgentChange(e.target.value)}
          >
            <option value="">All Agents</option>
            {(agentData?.agents || []).map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </select>
          <a
              href={exportApi.tasksUrl({ status: filterStatus, agent_id: filterAgent })}
              download="tasks.csv"
              className="mc-btn-secondary text-xs flex items-center gap-1 no-underline"
            >
              &#8595; CSV
            </a>
          <button className="mc-btn-primary text-xs" onClick={() => navigate('/tasks/create')}>
            + New Task
          </button>
        </div>
      </div>

      {/* Task List */}
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-12 bg-mc-bg-tertiary rounded animate-pulse" />
          ))}
        </div>
      ) : tasks.length === 0 ? (
        <div className="mc-card text-center py-12">
          {search ? (
            <>
              <p className="text-mc-text-muted mb-2">No tasks match "{search}"</p>
              <button className="mc-btn-secondary text-xs mt-2" onClick={() => handleSearchChange('')}>Clear search</button>
            </>
          ) : (
            <>
              <p className="text-mc-text-muted">No tasks yet.</p>
              <button className="mc-btn-primary text-xs mt-4" onClick={() => navigate('/tasks/create')}>
                + Create your first task
              </button>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
          <div className="space-y-2">
            {pagedTasks.map((task: Task) => (
              <div
                key={task.id}
                className="mc-card flex items-center justify-between cursor-pointer hover:border-mc-border-secondary transition-colors"
                onClick={() => navigate(`/tasks/${task.id}`)}
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <span className={`mc-badge text-[10px] whitespace-nowrap ${STATUS_COLORS[task.status] || ''}`}>
                    {task.status.replace('_', ' ')}
                  </span>
                  <span className="text-sm text-mc-text-primary truncate max-w-[180px]">{task.title}</span>
                  {task.parent_task_id && (
                    <span className="text-[10px] text-mc-text-muted flex-shrink-0">↳ subtask</span>
                  )}
                </div>
                <div className="flex items-center gap-4 text-xs text-mc-text-muted flex-shrink-0">
                  <span className="hidden sm:inline">P{task.priority}</span>
                  {task.tokens_used > 0 && <span className="hidden sm:inline">{task.tokens_used.toLocaleString()} tokens</span>}
                  {task.cost > 0 && <span className="text-mc-accent-amber">${task.cost.toFixed(4)}</span>}
                  <span className="hidden sm:inline">{new Date(task.created_at).toLocaleTimeString()}</span>
                  <span className="text-mc-accent-blue text-[10px]">→</span>
                </div>
              </div>
            ))}
          </div>
          </div>

          {/* Pagination controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 text-xs text-mc-text-muted">
              <span>
                Showing {showingFrom}–{showingTo} of {tasks.length}
              </span>
              <div className="flex items-center gap-2">
                <button
                  className="mc-btn-secondary text-xs py-1 px-2 disabled:opacity-40"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                >
                  ← Prev
                </button>
                <span className="text-mc-text-secondary font-medium">
                  {page + 1} / {totalPages}
                </span>
                <button
                  className="mc-btn-secondary text-xs py-1 px-2 disabled:opacity-40"
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
