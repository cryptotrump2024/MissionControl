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

import type { Agent, AgentListResponse, Task, TaskListResponse, LogEntry, CostSummary, CostRecord } from '@/types';

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
};

// ── Tasks ───────────────────────────────────────────────────────────

export const tasksApi = {
  list: (params?: { status?: string; agent_id?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.set('status', params.status);
    if (params?.agent_id) searchParams.set('agent_id', params.agent_id);
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

// ── Health ──────────────────────────────────────────────────────────

export const healthApi = {
  check: () =>
    request<{ status: string; database: string; version: string }>('/api/health'),
};
