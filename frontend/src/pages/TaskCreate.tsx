/**
 * TaskCreate — Form to create a new task.
 * Route: /tasks/create
 *
 * On success, redirects to /tasks/:newTaskId
 */

import { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { tasksApi, agentsApi, templatesApi, type TaskTemplate } from '@/api/client';

const PRIORITY_OPTIONS = [
  { value: 1, label: '1 — Critical' },
  { value: 2, label: '2 — High' },
  { value: 3, label: '3 — Elevated' },
  { value: 4, label: '4 — Above Average' },
  { value: 5, label: '5 — Normal' },
  { value: 6, label: '6 — Below Average' },
  { value: 7, label: '7 — Low' },
  { value: 8, label: '8 — Background' },
  { value: 9, label: '9 — Minimal' },
  { value: 10, label: '10 — Lowest' },
];

interface FormState {
  title: string;
  description: string;
  delegated_to: string;
  priority: number;
  saveAsTemplate: boolean;
  showSchedule: boolean;
  scheduledAt: string;
}

export default function TaskCreate() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const templateId = searchParams.get("template");
  const qc = useQueryClient();

  const [form, setForm] = useState<FormState>({
    title: '',
    description: '',
    delegated_to: '',
    priority: 5,
    saveAsTemplate: false,
    showSchedule: false,
    scheduledAt: '',
  });

  const { data: agentData } = useQuery({
    queryKey: ['agents'],
    queryFn: () => agentsApi.list(),
    staleTime: 30_000,
  });
  const agents = agentData?.agents || [];

  const { data: templateData } = useQuery({
    queryKey: ["template-prefill", templateId],
    queryFn: () => {
      const cached = qc.getQueryData<TaskTemplate[]>(["templates"]);
      const fromCache = cached?.find(t => t.id === templateId);
      if (fromCache) return Promise.resolve(fromCache);
      return templatesApi.list().then(ts => ts.find(t => t.id === templateId) ?? null);
    },
    enabled: !!templateId,
  });

  useEffect(() => {
    if (templateData) {
      setForm(prev => ({
        ...prev,
        title: templateData.name,
        description: templateData.description ?? "",
        delegated_to: templateData.agent_id ?? "",
        priority: templateData.priority,
      }));
    }
  }, [templateData]);

  const createMutation = useMutation({
    mutationFn: () =>
      tasksApi.create({
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        delegated_to: form.delegated_to || undefined,
        priority: form.priority,
        scheduled_at: form.scheduledAt ? new Date(form.scheduledAt).toISOString() : undefined,
      }),
    onSuccess: async (task) => {
      if (form.saveAsTemplate && form.title.trim()) {
        try {
          await templatesApi.create({
            name: form.title.trim(),
            description: form.description.trim() || null,
            // form.delegated_to holds agent type string (e.g. "ceo"), look up UUID
            agent_id: agents.find(a => a.id === form.delegated_to || a.type === form.delegated_to)?.id ?? null,
            priority: form.priority,
            payload: null,
          });
        } catch {
          // non-blocking
        }
      }
      navigate(`/tasks/${task.id}`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    createMutation.mutate();
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: name === 'priority' ? Number(value) : value,
    }));
  };

  return (
    <div className="max-w-2xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-mc-text-muted mb-4">
        <Link to="/tasks" className="hover:text-mc-text-primary transition-colors">
          Tasks
        </Link>
        <span>/</span>
        <span className="text-mc-text-secondary">New Task</span>
      </div>

      <h2 className="text-xl font-bold mb-6">Create New Task</h2>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Title */}
        <div>
          <label className="block text-xs font-semibold text-mc-text-secondary mb-1.5">
            Title <span className="text-mc-accent-red">*</span>
          </label>
          <input
            name="title"
            className="mc-input w-full"
            placeholder="Describe what needs to be done..."
            value={form.title}
            onChange={handleChange}
            autoFocus
            required
            maxLength={256}
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-xs font-semibold text-mc-text-secondary mb-1.5">
            Description
          </label>
          <textarea
            name="description"
            className="mc-input w-full resize-none h-28"
            placeholder="Optional: provide context, requirements, or any additional details..."
            value={form.description}
            onChange={handleChange}
          />
        </div>

        {/* Agent + Priority row */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-mc-text-secondary mb-1.5">
              Assign to Agent
            </label>
            <select name="delegated_to" className="mc-input w-full" value={form.delegated_to} onChange={handleChange}>
              <option value="">No specific agent (auto-assign)</option>
              {agents.map((agent) => (
                <option key={agent.type} value={agent.type}>
                  {agent.name} ({agent.type})
                </option>
              ))}
              {/* Fallback options if no agents registered */}
              {agents.length === 0 && (
                <>
                  <option value="ceo">CEO (Executive)</option>
                  <option value="researcher">Researcher</option>
                  <option value="writer">Writer</option>
                  <option value="developer">Developer</option>
                  <option value="auditor">Auditor</option>
                </>
              )}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-mc-text-secondary mb-1.5">
              Priority
            </label>
            <select
              name="priority"
              className="mc-input w-full"
              value={form.priority}
              onChange={handleChange}
            >
              {PRIORITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Error message */}
        {createMutation.isError && (
          <div className="mc-card border border-mc-accent-red/30 bg-mc-accent-red/5">
            <p className="text-xs text-mc-accent-red">
              {createMutation.error instanceof Error
                ? createMutation.error.message
                : 'Failed to create task. Please try again.'}
            </p>
          </div>
        )}

        {/* Schedule for later */}
        <div className="border-t border-mc-border-primary pt-4">
          <button
            type="button"
            className="flex items-center gap-1.5 text-xs text-mc-text-muted hover:text-mc-text-primary transition-colors"
            onClick={() => setForm((prev) => ({ ...prev, showSchedule: !prev.showSchedule, scheduledAt: '' }))}
          >
            <span>{form.showSchedule ? '▾' : '▸'}</span>
            Schedule for later (optional)
          </button>
          {form.showSchedule && (
            <div className="mt-2">
              <label className="block text-xs font-semibold text-mc-text-secondary mb-1.5">
                Run at
              </label>
              <input
                type="datetime-local"
                className="mc-input w-full"
                min={new Date().toISOString().slice(0, 16)}
                value={form.scheduledAt}
                onChange={(e) => setForm((prev) => ({ ...prev, scheduledAt: e.target.value }))}
              />
              <p className="text-[10px] text-mc-text-muted mt-1">
                Task will stay queued until this time, then activate automatically.
              </p>
            </div>
          )}
        </div>

        {/* Save as template checkbox */}
        <label className="flex items-center gap-2 text-xs text-mc-text-muted cursor-pointer select-none">
          <input
            type="checkbox"
            checked={form.saveAsTemplate}
            onChange={e => setForm(prev => ({ ...prev, saveAsTemplate: e.target.checked }))}
            className="rounded"
          />
          Save as template for reuse
        </label>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            className="mc-btn-secondary text-sm"
            onClick={() => navigate('/tasks')}
            disabled={createMutation.isPending}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="mc-btn-primary text-sm min-w-28"
            disabled={!form.title.trim() || createMutation.isPending}
          >
            {createMutation.isPending ? (
              <span className="flex items-center gap-2">
                <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Creating…
              </span>
            ) : (
              'Create Task'
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
