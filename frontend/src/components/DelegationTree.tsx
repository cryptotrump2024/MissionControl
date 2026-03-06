/**
 * DelegationTree — Recursive component that renders the task hierarchy.
 * Each node shows status, title, agent, and is clickable to navigate.
 */

import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
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

const STATUS_ICONS: Record<string, string> = {
  queued: '○',
  running: '◉',
  completed: '✓',
  failed: '✕',
  cancelled: '–',
  awaiting_approval: '?',
};

const MAX_DEPTH = 5;

interface TreeNodeProps {
  task: Task;
  depth: number;
  currentTaskId: string;
}

function TreeNode({ task, depth, currentTaskId }: TreeNodeProps) {
  const navigate = useNavigate();
  const isCurrentTask = task.id === currentTaskId;

  // Only fetch children if we're within depth limit
  const { data: childData, isLoading } = useQuery({
    queryKey: ['tasks-subtasks', task.id],
    queryFn: () => tasksApi.subtasks(task.id),
    enabled: depth < MAX_DEPTH,
  });

  const children = childData?.tasks || [];

  return (
    <div>
      {/* Node row */}
      <div
        className={`flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors cursor-pointer group
          ${isCurrentTask
            ? 'bg-mc-accent-blue/10 border border-mc-accent-blue/20'
            : 'hover:bg-mc-bg-hover border border-transparent'
          }`}
        style={{ marginLeft: `${depth * 20}px` }}
        onClick={() => navigate(`/tasks/${task.id}`)}
        title={task.id}
      >
        {/* Indentation connector line */}
        {depth > 0 && (
          <span className="text-mc-border-secondary text-xs mr-1 flex-shrink-0">↳</span>
        )}

        {/* Status icon */}
        <span
          className={`text-xs w-4 text-center flex-shrink-0 font-mono ${STATUS_COLORS[task.status]?.split(' ')[1] || 'text-mc-text-muted'}`}
        >
          {STATUS_ICONS[task.status] || '○'}
        </span>

        {/* Title */}
        <span
          className={`text-xs flex-1 truncate ${
            isCurrentTask ? 'text-mc-accent-blue font-semibold' : 'text-mc-text-primary group-hover:text-mc-text-primary'
          }`}
        >
          {task.title}
        </span>

        {/* Status badge */}
        <span className={`mc-badge text-[9px] flex-shrink-0 ${STATUS_COLORS[task.status] || ''}`}>
          {task.status}
        </span>

        {/* Priority */}
        <span className="text-[10px] text-mc-text-muted flex-shrink-0">P{task.priority}</span>
      </div>

      {/* Children */}
      {isLoading && depth < MAX_DEPTH && (
        <div
          className="flex items-center gap-2 px-2 py-1 text-xs text-mc-text-muted"
          style={{ marginLeft: `${(depth + 1) * 20}px` }}
        >
          <span className="animate-pulse">Loading subtasks...</span>
        </div>
      )}

      {children.map((child: Task) => (
        <TreeNode
          key={child.id}
          task={child}
          depth={depth + 1}
          currentTaskId={currentTaskId}
        />
      ))}
    </div>
  );
}

export interface DelegationTreeProps {
  taskId: string;
  depth?: number;
}

export default function DelegationTree({ taskId }: DelegationTreeProps) {
  // Fetch the root task first
  const { data: task, isLoading, isError } = useQuery({
    queryKey: ['task', taskId],
    queryFn: () => tasksApi.get(taskId),
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-8 bg-mc-bg-tertiary rounded animate-pulse" />
        ))}
      </div>
    );
  }

  if (isError || !task) {
    return (
      <p className="text-xs text-mc-accent-red">Failed to load delegation tree.</p>
    );
  }

  // If this task has a parent, we ideally want to show from root.
  // For simplicity we show from the current task downward.
  return (
    <div className="space-y-0.5">
      <TreeNode task={task} depth={0} currentTaskId={taskId} />
    </div>
  );
}
