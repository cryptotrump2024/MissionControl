import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { approvalsApi } from '@/api/client';
import type { Task } from '@/types';

export default function Approvals() {
  const queryClient = useQueryClient();

  const { data: pendingTasks, isLoading } = useQuery({
    queryKey: ['approvals'],
    queryFn: approvalsApi.list,
    refetchInterval: 5000,
  });

  const approveMutation = useMutation({
    mutationFn: (taskId: string) => approvalsApi.approve(taskId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['approvals'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (taskId: string) => approvalsApi.reject(taskId, 'Rejected by operator'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['approvals'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  const tasks = pendingTasks || [];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold">
          Approvals
          {tasks.length > 0 && (
            <span className="ml-2 mc-badge bg-mc-accent-amber/20 text-mc-accent-amber text-xs">
              {tasks.length} pending
            </span>
          )}
        </h2>
      </div>

      {isLoading ? (
        <p className="text-mc-text-muted">Loading approvals...</p>
      ) : tasks.length === 0 ? (
        <div className="mc-card text-center py-16">
          <p className="text-3xl mb-3">✓</p>
          <p className="text-mc-text-secondary font-semibold">All clear</p>
          <p className="text-xs text-mc-text-muted mt-1">No tasks awaiting approval</p>
        </div>
      ) : (
        <div className="space-y-4">
          {tasks.map((task: Task) => (
            <div key={task.id} className="mc-card border-l-2 border-mc-accent-amber">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-mc-text-primary">{task.title}</h3>
                  {task.description && (
                    <p className="text-xs text-mc-text-secondary mt-1">{task.description}</p>
                  )}
                  <div className="flex items-center gap-4 mt-2 text-xs text-mc-text-muted">
                    <span>Priority: {task.priority}</span>
                    <span>Created: {new Date(task.created_at).toLocaleString()}</span>
                    {task.delegated_by && <span>Delegated by: {task.delegated_by}</span>}
                  </div>

                  {task.input_data && (
                    <details className="mt-2">
                      <summary className="text-xs text-mc-text-muted cursor-pointer hover:text-mc-text-secondary">
                        View input data
                      </summary>
                      <pre className="bg-mc-bg-secondary p-2 rounded text-[11px] mt-1 overflow-x-auto max-h-32">
                        {JSON.stringify(task.input_data, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>

                <div className="flex gap-2 ml-4">
                  <button
                    className="mc-btn text-xs bg-mc-accent-green/20 text-mc-accent-green hover:bg-mc-accent-green/30"
                    onClick={() => approveMutation.mutate(task.id)}
                    disabled={approveMutation.isPending}
                  >
                    ✓ Approve
                  </button>
                  <button
                    className="mc-btn text-xs bg-mc-accent-red/20 text-mc-accent-red hover:bg-mc-accent-red/30"
                    onClick={() => rejectMutation.mutate(task.id)}
                    disabled={rejectMutation.isPending}
                  >
                    ✕ Reject
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
