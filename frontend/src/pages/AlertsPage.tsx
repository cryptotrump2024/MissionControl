/**
 * AlertsPage — System alert management.
 * Route: /alerts
 *
 * Features:
 *  - Header with unacknowledged count badge
 *  - Filter by severity (all/info/warning/critical) and status (all/unacknowledged/acknowledged)
 *  - Alert cards with colored left border by severity
 *  - Acknowledge action via PATCH mutation
 *  - Empty state and loading skeleton
 *  - Auto-refetch every 15 seconds
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Alert } from '@/types';

// ── Inline API (will be merged into @/api/client when alertsApi is added) ──

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path}`;
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }
  return response.json();
}

const alertsApi = {
  list: (params?: { severity?: string; acknowledged?: boolean }) => {
    const searchParams = new URLSearchParams();
    if (params?.severity) searchParams.set('severity', params.severity);
    if (params?.acknowledged !== undefined) searchParams.set('acknowledged', String(params.acknowledged));
    const qs = searchParams.toString();
    return request<Alert[]>(`/api/alerts${qs ? `?${qs}` : ''}`);
  },
  acknowledge: (id: string) =>
    request<Alert>(`/api/alerts/${id}/acknowledge`, { method: 'PATCH' }),
};

// ── Constants ───────────────────────────────────────────────────────────────

const SEVERITY_BORDER: Record<string, string> = {
  critical: 'border-l-mc-accent-red',
  warning: 'border-l-mc-accent-amber',
  info: 'border-l-mc-accent-blue',
};

const SEVERITY_BADGE: Record<string, string> = {
  critical: 'bg-mc-accent-red/10 text-mc-accent-red',
  warning: 'bg-mc-accent-amber/10 text-mc-accent-amber',
  info: 'bg-mc-accent-blue/10 text-mc-accent-blue',
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString();
}

// ── Skeleton ─────────────────────────────────────────────────────────────────

function AlertSkeleton() {
  return (
    <div className="mc-card border-l-4 border-l-mc-border-primary animate-pulse">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <div className="h-4 w-24 bg-mc-bg-tertiary rounded" />
            <div className="h-4 w-16 bg-mc-bg-tertiary rounded" />
          </div>
          <div className="h-4 w-3/4 bg-mc-bg-tertiary rounded" />
          <div className="h-3 w-16 bg-mc-bg-tertiary rounded" />
        </div>
        <div className="h-7 w-24 bg-mc-bg-tertiary rounded flex-shrink-0" />
      </div>
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

type SeverityFilter = 'all' | 'info' | 'warning' | 'critical';
type StatusFilter = 'all' | 'unacknowledged' | 'acknowledged';

export default function AlertsPage() {
  const [filterSeverity, setFilterSeverity] = useState<SeverityFilter>('all');
  const [filterStatus, setFilterStatus] = useState<StatusFilter>('all');

  const queryClient = useQueryClient();

  const { data: alerts, isLoading } = useQuery({
    queryKey: ['alerts', filterSeverity, filterStatus],
    queryFn: () =>
      alertsApi.list({
        severity: filterSeverity !== 'all' ? filterSeverity : undefined,
        acknowledged:
          filterStatus === 'unacknowledged' ? false
          : filterStatus === 'acknowledged' ? true
          : undefined,
      }),
    refetchInterval: 15_000,
  });

  const acknowledgeMutation = useMutation({
    mutationFn: (id: string) => alertsApi.acknowledge(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      queryClient.invalidateQueries({ queryKey: ['alerts-unread-count'] });
    },
  });

  const allAlerts = alerts ?? [];
  const unacknowledgedCount = allAlerts.filter((a) => !a.acknowledged).length;

  return (
    <div>
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold">Alerts</h2>
          {unacknowledgedCount > 0 && (
            <span className="inline-flex items-center justify-center min-w-[1.4rem] h-5 px-1.5 rounded-full bg-mc-accent-red text-white text-xs font-bold">
              {unacknowledgedCount}
            </span>
          )}
        </div>
      </div>

      {/* ── Filter Bar ── */}
      <div className="mc-card mb-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Severity filter */}
          <select
            className="mc-input text-xs"
            value={filterSeverity}
            onChange={(e) => setFilterSeverity(e.target.value as SeverityFilter)}
          >
            <option value="all">All Severities</option>
            <option value="info">Info</option>
            <option value="warning">Warning</option>
            <option value="critical">Critical</option>
          </select>

          {/* Status filter */}
          <select
            className="mc-input text-xs"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as StatusFilter)}
          >
            <option value="all">All Status</option>
            <option value="unacknowledged">Unacknowledged</option>
            <option value="acknowledged">Acknowledged</option>
          </select>
        </div>
      </div>

      {/* ── Alert List ── */}
      <div className="space-y-3">
        {isLoading ? (
          <>
            <AlertSkeleton />
            <AlertSkeleton />
            <AlertSkeleton />
          </>
        ) : allAlerts.length === 0 ? (
          <div className="mc-card py-12 text-center">
            <p className="text-mc-text-muted text-sm">All clear — no alerts</p>
          </div>
        ) : (
          allAlerts.map((alert: Alert) => (
            <div
              key={alert.id}
              className={`mc-card border-l-4 ${SEVERITY_BORDER[alert.severity] ?? 'border-l-mc-border-primary'} ${
                alert.acknowledged ? 'opacity-60' : ''
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  {/* Type tag + severity badge */}
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="font-mono text-xs bg-mc-bg-tertiary text-mc-text-secondary px-2 py-0.5 rounded">
                      {alert.type}
                    </span>
                    <span
                      className={`mc-badge text-[10px] ${SEVERITY_BADGE[alert.severity] ?? ''}`}
                    >
                      {alert.severity.toUpperCase()}
                    </span>
                  </div>

                  {/* Message */}
                  <p className="text-sm text-mc-text-primary break-words">{alert.message}</p>

                  {/* Timestamp */}
                  <p
                    className="text-xs text-mc-text-muted mt-1.5"
                    title={new Date(alert.created_at).toLocaleString()}
                  >
                    {formatRelative(alert.created_at)}
                  </p>
                </div>

                {/* Acknowledge action */}
                <div className="flex-shrink-0">
                  {alert.acknowledged ? (
                    <span className="text-xs text-mc-text-muted">&#10003; Acknowledged</span>
                  ) : (
                    <button
                      className="mc-btn-secondary text-xs px-3 py-1.5 disabled:opacity-50"
                      disabled={acknowledgeMutation.isPending}
                      onClick={() => acknowledgeMutation.mutate(alert.id)}
                    >
                      {acknowledgeMutation.isPending && acknowledgeMutation.variables === alert.id
                        ? 'Saving…'
                        : 'Acknowledge'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
