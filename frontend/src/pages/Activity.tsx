/**
 * ActivityPage — Unified chronological event stream.
 * Route: /activity
 *
 * Shows a merged feed of task and alert events from the API,
 * with live WebSocket updates prepended at top.
 * Cursor-based "Load more" pagination.
 */
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { activityApi } from '@/api/client';
import { useWebSocket } from '@/hooks/useWebSocket';
import type { ActivityEvent } from '@/types';

function dotColor(type: string): string {
  if (type === 'task.completed') return 'bg-mc-accent-green';
  if (type === 'task.failed')    return 'bg-mc-accent-red';
  if (type === 'task.cancelled') return 'bg-mc-text-muted';
  if (type.startsWith('task.'))  return 'bg-mc-accent-blue';
  if (type.includes('critical')) return 'bg-mc-accent-red';
  if (type.startsWith('alert.')) return 'bg-mc-accent-amber';
  return 'bg-mc-text-muted';
}

function typeLabel(type: string): string {
  const parts = type.split('.');
  return parts.length === 2 ? `${parts[0]} ${parts[1]}` : type;
}

function formatRel(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString();
}

export default function Activity() {
  const [liveEvents, setLiveEvents] = useState<ActivityEvent[]>([]);
  const [before, setBefore] = useState<string | undefined>();
  const [allEvents, setAllEvents] = useState<ActivityEvent[]>([]);

  const { subscribe } = useWebSocket();

  const { data, isFetching } = useQuery({
    queryKey: ['activity', before],
    queryFn: () => activityApi.list({ limit: 50, before }),
    staleTime: 0,
  });

  // Append new page results, deduplicate by id
  useEffect(() => {
    if (!data) return;
    setAllEvents((prev) => {
      const ids = new Set(prev.map((e) => e.id));
      const fresh = data.events.filter((e) => !ids.has(e.id));
      return [...prev, ...fresh];
    });
  }, [data]);

  // Subscribe to live WebSocket events and convert to ActivityEvent shape
  useEffect(() => {
    const unsubs: Array<() => void> = [];

    const handleTaskEvent = (type: string) => (data: Record<string, unknown>) => {
      const event: ActivityEvent = {
        id: `ws-${type}-${data.id ?? Date.now()}`,
        type,
        title: (data.title as string) ?? type,
        timestamp: (data.updated_at as string) ?? (data.created_at as string) ?? new Date().toISOString(),
        agent_id: (data.agent_id as string) ?? null,
        task_id: (data.id as string) ?? null,
        alert_id: null,
      };
      setLiveEvents((prev) => {
        const ids = new Set(prev.map((e) => e.id));
        if (ids.has(event.id)) return prev;
        return [event, ...prev];
      });
    };

    const handleAlertEvent = (data: Record<string, unknown>) => {
      const severity = (data.severity as string) ?? 'info';
      const type = `alert.${severity}`;
      const event: ActivityEvent = {
        id: `ws-alert-${data.id ?? Date.now()}`,
        type,
        title: (data.message as string) ?? 'New alert',
        timestamp: (data.created_at as string) ?? new Date().toISOString(),
        agent_id: (data.agent_id as string) ?? null,
        task_id: (data.task_id as string) ?? null,
        alert_id: (data.id as string) ?? null,
      };
      setLiveEvents((prev) => {
        const ids = new Set(prev.map((e) => e.id));
        if (ids.has(event.id)) return prev;
        return [event, ...prev];
      });
    };

    unsubs.push(subscribe('task_updated',   (d) => handleTaskEvent('task.updated')(d as Record<string, unknown>)));
    unsubs.push(subscribe('task_completed', (d) => handleTaskEvent('task.completed')(d as Record<string, unknown>)));
    unsubs.push(subscribe('task_failed',    (d) => handleTaskEvent('task.failed')(d as Record<string, unknown>)));
    unsubs.push(subscribe('alert_created',  (d) => handleAlertEvent(d as Record<string, unknown>)));

    return () => unsubs.forEach((u) => u());
  }, [subscribe]);

  // Merge live + API events, deduplicate by id
  const combined = [...liveEvents, ...allEvents];
  const seen = new Set<string>();
  const displayed = combined.filter((e) => {
    if (seen.has(e.id)) return false;
    seen.add(e.id);
    return true;
  });

  const hasMore = data?.has_more ?? false;
  const oldest = allEvents[allEvents.length - 1]?.timestamp;

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold">Activity Feed</h2>
        <span className="text-xs text-mc-text-muted">{displayed.length} events</span>
      </div>

      <div className="space-y-0.5">
        {displayed.length === 0 && !isFetching && (
          <p className="text-mc-text-muted text-sm text-center py-12">No activity yet.</p>
        )}
        {displayed.map((event) => (
          <div
            key={event.id}
            className="flex items-start gap-3 py-2.5 px-3 rounded hover:bg-mc-bg-hover transition-colors"
          >
            <div className="mt-1.5 flex-shrink-0">
              <span className={`block w-2 h-2 rounded-full ${dotColor(event.type)}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] text-mc-text-muted font-mono bg-mc-bg-tertiary px-1.5 py-0.5 rounded flex-shrink-0">
                  {typeLabel(event.type)}
                </span>
                <span className="text-sm text-mc-text-primary truncate">
                  {event.task_id && event.type.startsWith('task.') ? (
                    <Link to={`/tasks/${event.task_id}`} className="hover:underline">{event.title}</Link>
                  ) : event.alert_id ? (
                    <Link to="/alerts" className="hover:underline">{event.title}</Link>
                  ) : (
                    event.title
                  )}
                </span>
              </div>
              {event.agent_id && (
                <p className="text-[10px] text-mc-text-muted mt-0.5">
                  <Link to={`/agents/${event.agent_id}`} className="hover:underline">
                    agent:{event.agent_id.slice(0, 8)}
                  </Link>
                </p>
              )}
            </div>
            <span className="text-[10px] text-mc-text-muted flex-shrink-0" title={event.timestamp}>
              {formatRel(event.timestamp)}
            </span>
          </div>
        ))}
      </div>

      {hasMore && (
        <div className="text-center mt-4">
          <button
            onClick={() => setBefore(oldest)}
            disabled={isFetching}
            className="mc-btn-secondary text-xs"
          >
            {isFetching ? 'Loading...' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  );
}
