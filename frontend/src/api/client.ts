/**
 * Mission Control API Client
 * Typed HTTP client for all REST endpoints.
 */

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path}`;
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }

  return response.json();
}

// ── Agents ──────────────────────────────────────────────────────────

import type { Agent, AgentListResponse, Task, TaskListResponse, LogEntry, CostSummary, CostRecord, AlertResponse, ActivityResponse } from '@/types';

export const agentsApi = {
  list: (params?: { status?: string; tier?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.set('status', params.status);
    if (params?.tier !== undefined) searchParams.set('tier', String(params.tier));
    const qs = searchParams.toString();
    return request<AgentListResponse>(`/api/agents${qs ? `?${qs}` : ''}`);
  },

  get: (id: string) =>
    request<Agent>(`/api/agents/${id}`),

  register: (data: Partial<Agent>) =>
    request<Agent>('/api/agents/register', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateStatus: (id: string, status: string) =>
    request<Agent>(`/api/agents/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),

  tasks: (agentId: string, params?: { status?: string; limit?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.set('status', params.status);
    if (params?.limit) searchParams.set('limit', String(params.limit));
    const qs = searchParams.toString();
    return request<TaskListResponse>(`/api/agents/${agentId}/tasks${qs ? `?${qs}` : ''}`);
  },

  metrics: (agentId: string) =>
    request<{
      agent_id: string;
      total_tasks: number;
      completed: number;
      failed: number;
      running: number;
      queued: number;
      success_rate: number;
      failure_rate: number;
      avg_duration_seconds: number;
      avg_cost_usd: number;
      total_cost_usd: number;
      status_breakdown: Record<string, number>;
      daily_volume: Array<{ date: string; count: number }>;
    }>(`/api/agents/${agentId}/metrics`),
};

// ── Tasks ───────────────────────────────────────────────────────────

export const tasksApi = {
  list: (params?: { status?: string; agent_id?: string; search?: string; limit?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.set('status', params.status);
    if (params?.agent_id) searchParams.set('agent_id', params.agent_id);
    if (params?.search) searchParams.set('search', params.search);
    if (params?.limit) searchParams.set('limit', String(params.limit));
    const qs = searchParams.toString();
    return request<TaskListResponse>(`/api/tasks${qs ? `?${qs}` : ''}`);
  },

  get: (id: string) =>
    request<Task>(`/api/tasks/${id}`),

  /** Fetch all direct children of a task (tasks with parent_task_id === id). */
  subtasks: (parentId: string) => {
    const searchParams = new URLSearchParams();
    searchParams.set('parent_task_id', parentId);
    return request<TaskListResponse>(`/api/tasks?${searchParams.toString()}`);
  },

  create: (data: {
    title: string;
    description?: string;
    priority?: number;
    input_data?: Record<string, unknown>;
    delegated_to?: string;
    scheduled_at?: string;
  }) =>
    request<Task>('/api/tasks', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: string, data: Partial<Task>) =>
    request<Task>(`/api/tasks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  cancel: (id: string) =>
    request<Task>(`/api/tasks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'cancelled' }),
    }),

  retry: (id: string) =>
    request<Task>(`/api/tasks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'queued' }),
    }),

  bulk: (body: { action: 'cancel' | 'reassign'; task_ids: string[]; agent_id?: string }) =>
    request<{ updated: number; skipped: number }>('/api/tasks/bulk', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
};

// ── Logs ────────────────────────────────────────────────────────────

export const logsApi = {
  list: (params?: { agent_id?: string; task_id?: string; level?: string; search?: string; limit?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.agent_id) searchParams.set('agent_id', params.agent_id);
    if (params?.task_id) searchParams.set('task_id', params.task_id);
    if (params?.level) searchParams.set('level', params.level);
    if (params?.search) searchParams.set('search', params.search);
    if (params?.limit) searchParams.set('limit', String(params.limit));
    const qs = searchParams.toString();
    return request<LogEntry[]>(`/api/logs${qs ? `?${qs}` : ''}`);
  },
};

// ── Costs ───────────────────────────────────────────────────────────

export const costsApi = {
  today: () => request<{
    date: string;
    total_usd: number;
    input_tokens: number;
    output_tokens: number;
    record_count: number;
    budget_usd: number;
    budget_remaining_usd: number;
  }>('/api/costs/today'),

  summary: (period: string = 'today') =>
    request<CostSummary>(`/api/costs/summary?period=${period}`),

  daily: (days: number = 30) =>
    request<Array<{ date: string; cost: number; input_tokens: number; output_tokens: number }>>(
      `/api/costs/daily?days=${days}`
    ),

  /** List individual cost records for the detailed table. */
  records: (params?: { agent_id?: string; task_id?: string; limit?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.agent_id) searchParams.set('agent_id', params.agent_id);
    if (params?.task_id) searchParams.set('task_id', params.task_id);
    if (params?.limit) searchParams.set('limit', String(params.limit));
    const qs = searchParams.toString();
    return request<CostRecord[]>(`/api/costs${qs ? `?${qs}` : ''}`);
  },

  byAgent: () => request<Array<{
    agent_id: string;
    agent_name: string;
    total_usd: number;
    record_count: number;
    input_tokens: number;
    output_tokens: number;
    pct_of_total: number;
  }>>('/api/costs/by-agent'),
};

export const exportApi = {
  tasksUrl: (params?: { status?: string; agent_id?: string }): string => {
    const sp = new URLSearchParams();
    if (params?.status) sp.set('status', params.status);
    if (params?.agent_id) sp.set('agent_id', params.agent_id);
    const qs = sp.toString();
    return `${API_BASE}/api/export/tasks.csv${qs ? `?${qs}` : ''}`;
  },
  logsUrl: (params?: { level?: string; agent_id?: string; task_id?: string }): string => {
    const sp = new URLSearchParams();
    if (params?.level) sp.set('level', params.level);
    if (params?.agent_id) sp.set('agent_id', params.agent_id);
    if (params?.task_id) sp.set('task_id', params.task_id);
    const qs = sp.toString();
    return `${API_BASE}/api/export/logs.csv${qs ? `?${qs}` : ''}`;
  },
};

// ── Approvals ───────────────────────────────────────────────────────

export const approvalsApi = {
  list: () =>
    request<Task[]>('/api/approvals'),

  approve: (taskId: string) =>
    request<Task>(`/api/approvals/${taskId}/approve`, { method: 'POST' }),

  reject: (taskId: string, reason?: string) =>
    request<Task>(`/api/approvals/${taskId}/reject?reason=${encodeURIComponent(reason || '')}`, { method: 'POST' }),
};

// ── Alerts ──────────────────────────────────────────────────────────

export const alertsApi = {
  list: (params?: { severity?: string; acknowledged?: boolean; limit?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.severity) searchParams.set('severity', params.severity);
    if (params?.acknowledged !== undefined) searchParams.set('acknowledged', String(params.acknowledged));
    if (params?.limit) searchParams.set('limit', String(params.limit));
    const qs = searchParams.toString();
    return request<AlertResponse[]>(`/api/alerts${qs ? `?${qs}` : ''}`);
  },
  acknowledge: (id: string) =>
    request<AlertResponse>(`/api/alerts/${id}/acknowledge`, { method: 'PATCH' }),
  unreadCount: () =>
    request<{ count: number }>('/api/alerts/unread-count'),
};


// ── Activity ─────────────────────────────────────────────────────────

export const activityApi = {
  list: (params?: { limit?: number; before?: string }) => {
    const sp = new URLSearchParams();
    if (params?.limit) sp.set('limit', String(params.limit));
    if (params?.before) sp.set('before', params.before);
    const qs = sp.toString();
    return request<ActivityResponse>(`/api/activity${qs ? `?${qs}` : ''}`);
  },
};

// ── Dashboard ────────────────────────────────────────────────────────

export const dashboardApi = {
  stats: () => request<{
    agents: { total: number; active: number; working: number };
    tasks: { total: number; running: number; completed: number; failed: number; queued: number; error_rate: number };
    costs: { today_usd: number };
    alerts: { unread: number };
  }>('/api/dashboard/stats'),
};

// ── Health ──────────────────────────────────────────────────────────

export const healthApi = {
  check: () =>
    request<{ status: string; database: string; version: string }>('/api/health'),
};

// ── Dev Tools ────────────────────────────────────────────────────────

export const devApi = {
  seed: () => request<{ created: { agents: number; tasks: number; logs: number } }>('/api/seed', { method: 'POST' }),
  demoStart:  () => request<{ status: string }>('/api/demo/start',  { method: 'POST' }),
  demoStop:   () => request<{ status: string }>('/api/demo/stop',   { method: 'POST' }),
  demoStatus: () => request<{ running: boolean; tick: number }>('/api/demo/status'),
};

// ── Settings ─────────────────────────────────────────────────────────

export const settingsApi = {
  get: (): Promise<Record<string, string>> =>
    request<Record<string, string>>('/api/settings'),

  update: (key: string, value: string): Promise<{ key: string; value: string }> =>
    fetch(`${API_BASE}/api/settings/${key}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value }),
    }).then(r => {
      if (!r.ok) return r.json().then((e: unknown) => Promise.reject(e));
      return r.json();
    }),

  testWebhook: (): Promise<{ status: string; http_status: number }> =>
    fetch(`${API_BASE}/api/settings/test-webhook`, { method: 'POST' }).then(r => {
      if (!r.ok) return r.json().then((e: unknown) => Promise.reject(e));
      return r.json();
    }),
};

// ── Templates ────────────────────────────────────────────────────────

export interface TaskTemplate {
  id: string;
  name: string;
  description: string | null;
  agent_id: string | null;
  priority: number;
  payload: Record<string, unknown> | null;
  created_at: string;
}

export const templatesApi = {
  list: (): Promise<TaskTemplate[]> =>
    request<TaskTemplate[]>('/api/templates'),

  create: (body: Omit<TaskTemplate, 'id' | 'created_at'>): Promise<TaskTemplate> =>
    fetch(`${API_BASE}/api/templates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(r => {
      if (!r.ok) return r.json().then((e: unknown) => Promise.reject(e));
      return r.json();
    }),

  delete: (id: string): Promise<void> =>
    fetch(`${API_BASE}/api/templates/${id}`, { method: 'DELETE' }).then(r => {
      if (!r.ok) return r.json().catch(() => ({})).then((e: { detail?: string }) => Promise.reject(new Error(e.detail ?? `HTTP ${r.status}`)));
    }),

  apply: (id: string): Promise<{ id: string; title: string; status: string }> =>
    fetch(`${API_BASE}/api/templates/${id}/apply`, { method: 'POST' }).then(r => {
      if (!r.ok) return r.json().then((e: unknown) => Promise.reject(e));
      return r.json();
    }),
};
