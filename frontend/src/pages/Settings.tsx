import { useState, useEffect } from 'react';
import { healthApi, costsApi, settingsApi } from '@/api/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8000';

export default function Settings() {
  const [copied, setCopied] = useState(false);
  const [budgetInput, setBudgetInput] = useState('');
  const [webhookInput, setWebhookInput] = useState('');
  const [webhookTesting, setWebhookTesting] = useState(false);
  const [webhookResult, setWebhookResult] = useState<{ ok: boolean; message: string } | null>(null);

  const queryClient = useQueryClient();

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

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: settingsApi.get,
  });

  useEffect(() => {
    if (settings) {
      if (settings.daily_budget_usd !== undefined) {
        setBudgetInput(settings.daily_budget_usd);
      }
      if (settings.webhook_url !== undefined) {
        setWebhookInput(settings.webhook_url);
      }
    }
  }, [settings]);

  const budgetMutation = useMutation({
    mutationFn: (value: string) => settingsApi.update('daily_budget_usd', value),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      queryClient.invalidateQueries({ queryKey: ['costs', 'today'] });
    },
  });

  const webhookMutation = useMutation({
    mutationFn: (value: string) => settingsApi.update('webhook_url', value),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings'] }),
  });

  const handleTestWebhook = async () => {
    setWebhookTesting(true);
    setWebhookResult(null);
    try {
      const result = await settingsApi.testWebhook();
      setWebhookResult({ ok: true, message: `Delivered (HTTP ${result.http_status})` });
    } catch (err: unknown) {
      const detail = (err as { detail?: string })?.detail ?? String(err);
      setWebhookResult({ ok: false, message: detail });
    } finally {
      setWebhookTesting(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const budgetValue = todayCost?.budget_usd ?? 1.0;

  return (
    <div className="max-w-2xl space-y-6">
      <h2 className="text-xl font-bold">Settings</h2>

      {/* Configuration */}
      <div className="mc-card">
        <h3 className="text-sm font-semibold text-mc-text-secondary mb-4">Configuration</h3>
        <div className="space-y-5">
          {/* Daily Budget Input */}
          <div>
            <label className="block text-xs text-mc-text-muted mb-1.5">Daily Budget (USD)</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0.01}
                max={100}
                step={0.01}
                value={budgetInput}
                onChange={e => setBudgetInput(e.target.value)}
                className="flex-1 bg-mc-bg-tertiary border border-mc-border rounded px-3 py-1.5 text-xs text-mc-text-primary focus:outline-none focus:border-mc-accent-blue"
                placeholder="1.00"
              />
              <button
                className="mc-btn text-[10px] bg-mc-accent-blue text-white hover:opacity-90 disabled:opacity-50"
                disabled={budgetMutation.isPending}
                onClick={() => budgetMutation.mutate(budgetInput)}
              >
                {budgetMutation.isPending ? 'Saving...' : 'Save'}
              </button>
            </div>
            {budgetMutation.isError && (
              <p className="text-xs text-mc-accent-red mt-1">
                {String((budgetMutation.error as { detail?: string })?.detail ?? budgetMutation.error)}
              </p>
            )}
            {budgetMutation.isSuccess && (
              <p className="text-xs text-mc-accent-green mt-1">Budget saved.</p>
            )}
          </div>

          {/* Webhook URL Input */}
          <div>
            <label className="block text-xs text-mc-text-muted mb-1.5">Webhook URL (optional)</label>
            <div className="flex items-center gap-2">
              <input
                type="url"
                value={webhookInput}
                onChange={e => setWebhookInput(e.target.value)}
                className="flex-1 bg-mc-bg-tertiary border border-mc-border rounded px-3 py-1.5 text-xs text-mc-text-primary focus:outline-none focus:border-mc-accent-blue font-mono"
                placeholder="https://hooks.example.com/..."
              />
              <button
                className="mc-btn text-[10px] bg-mc-accent-blue text-white hover:opacity-90 disabled:opacity-50"
                disabled={webhookMutation.isPending}
                onClick={() => webhookMutation.mutate(webhookInput)}
              >
                {webhookMutation.isPending ? 'Saving...' : 'Save'}
              </button>
              <button
                className="mc-btn text-[10px] bg-mc-bg-tertiary text-mc-text-secondary hover:bg-mc-bg-hover disabled:opacity-50"
                disabled={webhookTesting || !webhookInput}
                onClick={handleTestWebhook}
              >
                {webhookTesting ? 'Testing...' : 'Test'}
              </button>
            </div>
            {webhookResult && (
              <p className={`text-xs mt-1 ${webhookResult.ok ? 'text-mc-accent-green' : 'text-mc-accent-red'}`}>
                {webhookResult.ok ? 'OK' : 'FAIL'} {webhookResult.message}
              </p>
            )}
            {webhookMutation.isError && (
              <p className="text-xs text-mc-accent-red mt-1">
                {String((webhookMutation.error as { detail?: string })?.detail ?? webhookMutation.error)}
              </p>
            )}
            {webhookMutation.isSuccess && (
              <p className="text-xs text-mc-accent-green mt-1">Webhook URL saved.</p>
            )}
            <p className="text-[10px] text-mc-text-muted mt-1.5">
              Receives a POST with JSON on each new alert. Must start with https://.
            </p>
          </div>
        </div>
      </div>

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
                {copied ? 'Copied' : 'Copy'}
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

      {/* Daily Budget Display */}
      <div className="mc-card">
        <h3 className="text-sm font-semibold text-mc-text-secondary mb-4">Daily Budget</h3>
        {todayCost ? (
          <div className="space-y-3">
            <div className="flex justify-between text-xs">
              <span className="text-mc-text-muted">Spent today</span>
              <span className={`font-semibold ${todayCost.total_usd > budgetValue * 0.8 ? 'text-mc-accent-red' : 'text-mc-accent-amber'}`}>
                ${todayCost.total_usd.toFixed(4)}
              </span>
            </div>
            <div className="h-2 bg-mc-bg-tertiary rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${todayCost.total_usd > budgetValue * 0.8 ? 'bg-mc-accent-red' : 'bg-mc-accent-amber'}`}
                style={{ width: `${Math.min(100, (todayCost.total_usd / budgetValue) * 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-mc-text-muted">
              <span>$0</span>
              <span>${budgetValue.toFixed(2)} daily limit</span>
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
