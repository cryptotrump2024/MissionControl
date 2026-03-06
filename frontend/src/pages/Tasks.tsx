import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tasksApi } from '@/api/client';
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
  const queryClient = useQueryClient();
  const [filterStatus, setFilterStatus] = useState<string | undefined>();
  const [showCreate, setShowCreate] = useState(false);
  const [newTask, setNewTask] = useState({ title: '', description: '', priority: 5 });
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['tasks', filterStatus],
    queryFn: () => tasksApi.list({ status: filterStatus }),
  });

  const createMutation = useMutation({
    mutationFn: tasksApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      setShowCreate(false);
      setNewTask({ title: '', description: '', priority: 5 });
    },
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
          <button className="mc-btn-primary text-xs" onClick={() => setShowCreate(!showCreate)}>
            + New Task
          </button>
        </div>
      </div>

      {/* Create Task Form */}
      {showCreate && (
        <div className="mc-card mb-6">
          <h3 className="text-sm font-semibold mb-3">Create Task</h3>
          <div className="space-y-3">
            <input
              className="mc-input w-full"
              placeholder="Task title..."
              value={newTask.title}
              onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
            />
            <textarea
              className="mc-input w-full h-20 resize-none"
              placeholder="Task description (optional)..."
              value={newTask.description}
              onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
            />
            <div className="flex items-center gap-4">
              <label className="text-xs text-mc-text-muted">
                Priority:
                <select
                  className="mc-input text-xs ml-2"
                  value={newTask.priority}
                  onChange={(e) => setNewTask({ ...newTask, priority: Number(e.target.value) })}
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((p) => (
                    <option key={p} value={p}>{p} {p === 1 ? '(Highest)' : p === 10 ? '(Lowest)' : ''}</option>
                  ))}
                </select>
              </label>
              <div className="flex-1" />
              <button className="mc-btn-secondary text-xs" onClick={() => setShowCreate(false)}>Cancel</button>
              <button
                className="mc-btn-primary text-xs"
                disabled={!newTask.title || createMutation.isPending}
                onClick={() => createMutation.mutate(newTask)}
              >
                {createMutation.isPending ? 'Creating...' : 'Create Task'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Task List */}
      {isLoading ? (
        <p className="text-mc-text-muted">Loading tasks...</p>
      ) : tasks.length === 0 ? (
        <div className="mc-card text-center py-12">
          <p className="text-mc-text-muted">No tasks yet. Create one or submit via the API.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {tasks.map((task: Task) => (
            <div
              key={task.id}
              className="mc-card flex items-center justify-between cursor-pointer hover:border-mc-border-secondary transition-colors"
              onClick={() => setSelectedTask(selectedTask?.id === task.id ? null : task)}
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
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Task Detail Panel */}
      {selectedTask && (
        <div className="mc-card mt-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">{selectedTask.title}</h3>
            <button className="text-xs text-mc-text-muted hover:text-mc-text-primary" onClick={() => setSelectedTask(null)}>Close</button>
          </div>
          <div className="space-y-2 text-xs">
            {selectedTask.description && <p className="text-mc-text-secondary">{selectedTask.description}</p>}
            <div className="grid grid-cols-2 gap-2">
              <div><span className="text-mc-text-muted">Status: </span>{selectedTask.status}</div>
              <div><span className="text-mc-text-muted">Priority: </span>{selectedTask.priority}</div>
              <div><span className="text-mc-text-muted">Tokens: </span>{selectedTask.tokens_used.toLocaleString()}</div>
              <div><span className="text-mc-text-muted">Cost: </span>${selectedTask.cost.toFixed(4)}</div>
            </div>
            {selectedTask.output_data && (
              <div>
                <p className="text-mc-text-muted mb-1">Output:</p>
                <pre className="bg-mc-bg-secondary p-2 rounded text-[11px] overflow-x-auto max-h-40">
                  {JSON.stringify(selectedTask.output_data, null, 2)}
                </pre>
              </div>
            )}
            {selectedTask.error_message && (
              <div className="bg-mc-accent-red/10 border border-mc-accent-red/20 rounded p-2">
                <p className="text-mc-accent-red">{selectedTask.error_message}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
