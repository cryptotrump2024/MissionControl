// frontend/src/pages/Templates.tsx
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { templatesApi, type TaskTemplate } from '@/api/client';

export default function Templates() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['templates'],
    queryFn: templatesApi.list,
  });

  const deleteMutation = useMutation({
    mutationFn: templatesApi.delete,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['templates'] }),
  });

  const applyMutation = useMutation({
    mutationFn: templatesApi.apply,
    onSuccess: (task) => navigate(`/tasks/${task.id}`),
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="mc-card h-20 animate-pulse bg-mc-bg-tertiary" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Task Templates</h2>
        <button
          className="mc-btn text-xs"
          onClick={() => navigate('/tasks/create')}
        >
          + New Task
        </button>
      </div>

      {templates.length === 0 ? (
        <div className="mc-card text-center py-12">
          <p className="text-mc-text-muted text-sm">No templates yet.</p>
          <p className="text-mc-text-muted text-xs mt-1">
            Create a task and check &quot;Save as template&quot; to add one.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((t: TaskTemplate) => (
            <div key={t.id} className="mc-card flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold text-sm text-mc-text-primary truncate">{t.name}</h3>
                <button
                  className="text-mc-text-muted hover:text-mc-accent-red text-xs flex-shrink-0"
                  aria-label={`Delete template ${t.name}`}
                  onClick={() => {
                    if (window.confirm(`Delete template "${t.name}"?`)) {
                      deleteMutation.mutate(t.id);
                    }
                  }}
                >
                  ✕
                </button>
              </div>
              {t.description && (
                <p className="text-xs text-mc-text-muted line-clamp-2">{t.description}</p>
              )}
              <div className="flex items-center gap-2 text-xs text-mc-text-muted mt-auto">
                <span>Priority {t.priority}</span>
                {t.agent_id && <span className="mc-badge">agent</span>}
              </div>
              <button
                className="mc-btn w-full text-xs mt-1"
                disabled={applyMutation.isPending}
                onClick={() => applyMutation.mutate(t.id)}
              >
                {applyMutation.isPending ? 'Creating\u2026' : '\u25b6 Use Template'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
