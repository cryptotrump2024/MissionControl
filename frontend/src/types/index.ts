// ── Agent Types ──────────────────────────────────────────────────────

export interface Agent {
  id: string;
  name: string;
  type: string;
  status: AgentStatus;
  capabilities: string[];
  model: string;
  config: Record<string, unknown>;
  tier: number;
  parent_agent_id: string | null;
  delegation_targets: string[];
  allowed_tools: string[];
  model_preference: string;
  token_budget_daily: number;
  description: string | null;
  created_at: string;
  last_heartbeat: string | null;
  total_tasks: number;
  total_cost: number;
}

export type AgentStatus = 'idle' | 'working' | 'error' | 'paused' | 'offline';

export interface AgentListResponse {
  agents: Agent[];
  total: number;
}

// ── Task Types ──────────────────────────────────────────────────────

export interface Task {
  id: string;
  agent_id: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: number;
  input_data: Record<string, unknown> | null;
  output_data: Record<string, unknown> | null;
  error_message: string | null;
  cost: number;
  tokens_used: number;
  delegated_by: string | null;
  delegated_to: string | null;
  parent_task_id: string | null;
  requires_approval: boolean;
  approval_status: string | null;
  approved_by: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  scheduled_at: string | null;
}

export type TaskStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'awaiting_approval';

export interface TaskListResponse {
  tasks: Task[];
  total: number;
}

// ── Log Types ───────────────────────────────────────────────────────

export interface LogEntry {
  id: string;
  task_id: string | null;
  agent_id: string | null;
  level: LogLevel;
  message: string;
  metadata: Record<string, unknown> | null;
  timestamp: string;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

// ── Cost Types ──────────────────────────────────────────────────────

export interface CostRecord {
  id: string;
  agent_id: string | null;
  task_id: string | null;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  timestamp: string;
}

export interface CostSummary {
  total_cost: number;
  total_input_tokens: number;
  total_output_tokens: number;
  by_agent: Record<string, number>;
  by_model: Record<string, number>;
  period: string;
}

// ── Alert Types ─────────────────────────────────────────────────────

export interface Alert {
  id: string;
  type: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  agent_id: string | null;
  task_id: string | null;
  acknowledged: boolean;
  created_at: string;
}

/** Alias matching the backend AlertResponse schema (same shape as Alert). */
export type AlertResponse = Alert;

// ── WebSocket Events ────────────────────────────────────────────────

export interface WSEvent {
  type: string;
  data: Record<string, unknown>;
  timestamp: string;
}

// ── Tier Config ─────────────────────────────────────────────────────

export const TIER_CONFIG = {
  0: { label: 'Governance', color: '#dc2626', bgClass: 'bg-red-950/40', borderClass: 'border-red-800/50' },
  1: { label: 'Executive', color: '#d97706', bgClass: 'bg-amber-950/40', borderClass: 'border-amber-800/50' },
  2: { label: 'Management', color: '#2563eb', bgClass: 'bg-blue-950/40', borderClass: 'border-blue-800/50' },
  3: { label: 'Operational', color: '#16a34a', bgClass: 'bg-green-950/40', borderClass: 'border-green-800/50' },
} as const;

export const STATUS_CONFIG = {
  idle: { color: '#22c55e', label: 'Idle' },
  working: { color: '#3b82f6', label: 'Working' },
  error: { color: '#ef4444', label: 'Error' },
  paused: { color: '#f59e0b', label: 'Paused' },
  offline: { color: '#606070', label: 'Offline' },
} as const;

// ── Activity Types ──────────────────────────────────────────────────

export interface ActivityEvent {
  id: string;
  type: string;           // e.g. "task.completed", "alert.critical"
  title: string;
  timestamp: string;
  agent_id: string | null;
  task_id: string | null;
  alert_id: string | null;
}

export interface ActivityResponse {
  events: ActivityEvent[];
  has_more: boolean;
}
