import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { costsApi } from '@/api/client';

export default function Costs() {
  const [period, setPeriod] = useState('today');

  const { data: summary } = useQuery({
    queryKey: ['costs', 'summary', period],
    queryFn: () => costsApi.summary(period),
  });

  const { data: daily } = useQuery({
    queryKey: ['costs', 'daily'],
    queryFn: () => costsApi.daily(30),
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold">Cost & Analytics</h2>
        <div className="flex gap-1">
          {['today', 'week', 'month', 'all'].map((p) => (
            <button
              key={p}
              className={`mc-btn text-xs ${period === p ? 'bg-mc-accent-blue text-white' : 'bg-mc-bg-tertiary text-mc-text-secondary'}`}
              onClick={() => setPeriod(p)}
            >
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="mc-card">
          <p className="text-xs text-mc-text-muted">Total Cost</p>
          <p className="text-2xl font-bold text-mc-accent-amber mt-1">
            ${(summary?.total_cost || 0).toFixed(4)}
          </p>
        </div>
        <div className="mc-card">
          <p className="text-xs text-mc-text-muted">Input Tokens</p>
          <p className="text-2xl font-bold text-mc-accent-blue mt-1">
            {(summary?.total_input_tokens || 0).toLocaleString()}
          </p>
        </div>
        <div className="mc-card">
          <p className="text-xs text-mc-text-muted">Output Tokens</p>
          <p className="text-2xl font-bold text-mc-accent-teal mt-1">
            {(summary?.total_output_tokens || 0).toLocaleString()}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Cost by Model */}
        <div className="mc-card">
          <h3 className="text-sm font-semibold text-mc-text-secondary mb-3">Cost by Model</h3>
          {summary && Object.keys(summary.by_model).length > 0 ? (
            <div className="space-y-2">
              {Object.entries(summary.by_model).map(([model, cost]) => {
                const percentage = summary.total_cost > 0 ? ((cost as number) / summary.total_cost) * 100 : 0;
                return (
                  <div key={model}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-mc-text-secondary">{model}</span>
                      <span className="text-mc-accent-amber">${(cost as number).toFixed(4)}</span>
                    </div>
                    <div className="h-2 bg-mc-bg-tertiary rounded-full overflow-hidden">
                      <div
                        className="h-full bg-mc-accent-amber rounded-full transition-all"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-mc-text-muted">No cost data for this period</p>
          )}
        </div>

        {/* Cost by Agent */}
        <div className="mc-card">
          <h3 className="text-sm font-semibold text-mc-text-secondary mb-3">Cost by Agent</h3>
          {summary && Object.keys(summary.by_agent).length > 0 ? (
            <div className="space-y-2">
              {Object.entries(summary.by_agent).map(([agentId, cost]) => {
                const percentage = summary.total_cost > 0 ? ((cost as number) / summary.total_cost) * 100 : 0;
                return (
                  <div key={agentId}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-mc-text-secondary">{agentId.slice(0, 8)}...</span>
                      <span className="text-mc-accent-teal">${(cost as number).toFixed(4)}</span>
                    </div>
                    <div className="h-2 bg-mc-bg-tertiary rounded-full overflow-hidden">
                      <div
                        className="h-full bg-mc-accent-teal rounded-full transition-all"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-mc-text-muted">No cost data for this period</p>
          )}
        </div>

        {/* Daily Trend */}
        <div className="mc-card col-span-2">
          <h3 className="text-sm font-semibold text-mc-text-secondary mb-3">Daily Cost Trend (30 days)</h3>
          {daily && daily.length > 0 ? (
            <div className="flex items-end gap-1 h-32">
              {daily.map((day, i) => {
                const maxCost = Math.max(...daily.map((d) => d.cost));
                const height = maxCost > 0 ? (day.cost / maxCost) * 100 : 0;
                return (
                  <div
                    key={i}
                    className="flex-1 bg-mc-accent-amber/30 hover:bg-mc-accent-amber/50 rounded-t transition-colors"
                    style={{ height: `${Math.max(height, 2)}%` }}
                    title={`${day.date}: $${day.cost.toFixed(4)}`}
                  />
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-mc-text-muted">No daily data available</p>
          )}
        </div>
      </div>
    </div>
  );
}
