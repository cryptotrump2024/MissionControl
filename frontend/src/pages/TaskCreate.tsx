/**
 * TaskCreate — Form to create a new task.
 * Route: /tasks/create
 *
 * On success, redirects to /tasks/:newTaskId
 */

import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { tasksApi } from '@/api/client';

const AGENT_OPTIONS = [
  { value: '', label: 'No specific agent (auto-assign)' },
  { value: 'ceo', label: 'CEO (Executive)' },
  { value: 'researcher', label: 'Researcher' },
  { value: 'writer', label: 'Writer' },
  { value: 'developer', label: 'Developer' },
  { value: 'auditor', label: 'Auditor' },
];

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
}

export default function TaskCreate() {
  const navigate = useNavigate();

  const [form, setForm] = useState<FormState>({
    title: '',
    description: '',
    delegated_to: '',
    priority: 5,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      tasksApi.create({
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        delegated_to: form.delegated_to || undefined,
        priority: form.priority,
      }),
    onSuccess: (task) => {
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
            <select
              name="delegated_to"
              className="mc-input w-full"
              value={form.delegated_to}
              onChange={handleChange}
            >
              {AGENT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
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
