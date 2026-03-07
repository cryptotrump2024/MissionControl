import { useState } from 'react';
import { healthApi, costsApi } from '@/api/client';
import { useQuery } from '@tanstack/react-query';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8000';

export default function Settings() {
  const [copied, setCopied] = useState(false);

  const { data: health, isLoading } = useQuery({
    queryKey: ['health'],
    queryFn: healthApi.check,
    refetchInterval: 30_000,
  });

  const { data: todayCost } = useQuery({
    queryKey: ['costs', 'today'],
    queryFn: costsApi.today,
    refetchInterval: 60_000,
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="max-w-2xl space-y-6">
      <h2 className="text-xl font-bold">Settings</h2>

      {/* System Info */}
      <div className="mc-card">
        <h3 className="text-sm font-semibold text-mc-text-secondary mb-4">System</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-mc-text-muted">API Endpoint</span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-mc-text-secondary font-mono">{API_URL}</span>
              <button
                className="mc-btn text-[10px] bg-mc-bg-tertiary text-mc-text-secondary hover:bg-mc-bg-hover"
                onClick={() => copyToClipboard(API_URL)}
              >
                {copied ? '✓' : 'Copy'}
              </button>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-mc-text-muted">WebSocket</span>
            <span className="text-xs text-mc-text-secondary font-mono">{WS_URL}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-mc-text-muted">Backend Status</span>
            {isLoading ? (
              <span className="text-xs text-mc-text-muted">Checking...</span>
            ) : health ? (
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-mc-accent-green" />
                <span className="text-xs text-mc-accent-green">Online</span>
                <span className="text-xs text-mc-text-muted ml-1">v{health.version}</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-mc-accent-red" />
                <span className="text-xs text-mc-accent-red">Offline</span>
              </div>
            )}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-mc-text-muted">Database</span>
            <span className={`text-xs ${health?.database === 'connected' ? 'text-mc-accent-green' : 'text-mc-accent-red'}`}>
              {health?.database ?? '—'}
            </span>
          </div>
        </div>
      </div>

      {/* About */}
      <div className="mc-card">
        <h3 className="text-sm font-semibold text-mc-text-secondary mb-4">About</h3>
        <div className="space-y-2 text-xs text-mc-text-secondary">
          <p>Mission Control v0.1.0 — Enterprise AI Agent Orchestration Platform</p>
          <p className="text-mc-text-muted">Monitor, control, and analyze AI agents in real-time.</p>
          <div className="flex flex-wrap gap-2 mt-3">
            {['FastAPI', 'PostgreSQL', 'Redis', 'React 18', 'Tailwind CSS', 'OpenRouter'].map(tech => (
              <span key={tech} className="mc-badge bg-mc-bg-tertiary text-mc-text-muted text-[10px]">{tech}</span>
            ))}
          </div>
        </div>
      </div>

      {/* Daily Budget */}
      <div className="mc-card">
        <h3 className="text-sm font-semibold text-mc-text-secondary mb-4">Daily Budget</h3>
        {todayCost ? (
          <div className="space-y-3">
            <div className="flex justify-between text-xs">
              <span className="text-mc-text-muted">Spent today</span>
              <span className={`font-semibold ${todayCost.total_usd > 0.8 ? 'text-mc-accent-red' : 'text-mc-accent-amber'}`}>
                ${todayCost.total_usd.toFixed(4)}
              </span>
            </div>
            <div className="h-2 bg-mc-bg-tertiary rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${todayCost.total_usd > 0.8 ? 'bg-mc-accent-red' : 'bg-mc-accent-amber'}`}
                style={{ width: `${Math.min(100, (todayCost.total_usd / 1.0) * 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-mc-text-muted">
              <span>$0</span>
              <span>$1.00 daily limit</span>
            </div>
            <div className="grid grid-cols-3 gap-3 mt-2">
              <div>
                <p className="text-xs text-mc-text-muted">Input tokens</p>
                <p className="text-sm font-semibold text-mc-text-primary">{todayCost.input_tokens.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs text-mc-text-muted">Output tokens</p>
                <p className="text-sm font-semibold text-mc-text-primary">{todayCost.output_tokens.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs text-mc-text-muted">Remaining</p>
                <p className="text-sm font-semibold text-mc-accent-green">${todayCost.budget_remaining_usd.toFixed(4)}</p>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-xs text-mc-text-muted">No cost data today</p>
        )}
      </div>
    </div>
  );
}
