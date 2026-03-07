/**
 * CostsPage — Cost analytics dashboard.
 * Route: /costs
 *
 * Features:
 *  - Summary cards (total spend, tokens, avg cost/task, top agent)
 *  - Time range selector
 *  - Cost by agent bar chart (Recharts)
 *  - Cost over time line chart (Recharts)
 *  - Cost records table (GET /api/costs list endpoint)
 *
 * Summary and daily data come from:
 *   GET /api/costs/summary?period=...
 *   GET /api/costs/daily?days=...
 * Raw records come from:
 *   GET /api/costs?limit=100
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { costsApi, tasksApi } from '@/api/client';

// ── Helpers ────────────────────────────────────────────────────────────────

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

const PERIOD_LABELS: Record<string, string> = {
  today: 'Today',
  week: 'Last 7 Days',
  month: 'Last 30 Days',
  all: 'All Time',
};

const PERIOD_DAYS: Record<string, number> = {
  today: 1,
  week: 7,
  month: 30,
  all: 365,
};

const CHART_COLORS = [
  '#3b82f6', // blue
  '#14b8a6', // teal
  '#a855f7', // purple
  '#f59e0b', // amber
  '#22c55e', // green
  '#ef4444', // red
];

// ── Custom Tooltip ─────────────────────────────────────────────────────────

function CostTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ value: number; name: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-mc-bg-card border border-mc-border-primary rounded-lg px-3 py-2 shadow-lg text-xs">
      <p className="text-mc-text-muted mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="text-mc-text-primary">
          <span className="text-mc-accent-amber">${typeof p.value === 'number' ? p.value.toFixed(6) : p.value}</span>
        </p>
      ))}
    </div>
  );
}

// ── Stat Card ──────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  subtext,
  color = 'text-mc-text-primary',
}: {
  label: string;
  value: string | number;
  subtext?: string;
  color?: string;
}) {
  return (
    <div className="mc-card">
      <p className="text-xs text-mc-text-muted uppercase tracking-wider">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
      {subtext && <p className="text-xs text-mc-text-muted mt-1">{subtext}</p>}
    </div>
  );
}


// ── Cost Sparkline (7-day SVG) ─────────────────────────────────────────────

function CostSparkline({ data }: { data: Array<{ date: string; cost: number }> }) {
  if (!data || data.length === 0) {
    return (
      <div className="h-16 flex items-center justify-center">
        <p className="text-xs text-mc-text-muted">No data</p>
      </div>
    );
  }

  const WIDTH = 200;
  const HEIGHT = 48;
  const PADDING = 4;
  const values = data.map(d => d.cost);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const range = maxVal - minVal || 1;
  const n = values.length;

  const points = values.map((v, i) => {
    const x = PADDING + (i / Math.max(n - 1, 1)) * (WIDTH - PADDING * 2);
    const y = HEIGHT - PADDING - ((v - minVal) / range) * (HEIGHT - PADDING * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const polyline = points.join(" ");

  const lastDate = data[data.length - 1]?.date?.slice(5) ?? "";
  const firstDate = data[0]?.date?.slice(5) ?? "";
  const totalCost = values.reduce((a, b) => a + b, 0);

  return (
    <div className="flex items-center gap-4">
      <svg width={WIDTH} height={HEIGHT} className="flex-shrink-0">
        <polyline
          points={polyline}
          fill="none"
          stroke="#f59e0b"
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {/* End dot */}
        {points.length > 0 && (
          <circle
            cx={points[points.length - 1].split(",")[0]}
            cy={points[points.length - 1].split(",")[1]}
            r="3"
            fill="#f59e0b"
          />
        )}
      </svg>
      <div className="text-xs text-mc-text-muted">
        <p>{firstDate} – {lastDate}</p>
        <p className="text-mc-accent-amber font-semibold mt-0.5">${totalCost.toFixed(4)} total</p>
      </div>
    </div>
  );
}

// ── Cost By Agent Chart ─────────────────────────────────────────────────────────

function CostByAgentChart() {
  const { data, isLoading } = useQuery({
    queryKey: ['costs-by-agent'],
    queryFn: costsApi.byAgent,
    refetchInterval: 30_000,
  });

  if (isLoading) {
    return <div className="h-24 bg-mc-bg-tertiary rounded animate-pulse" />;
  }
  if (!data || data.length === 0) {
    return (
      <p className="text-mc-text-muted text-xs text-center py-4">
        No per-agent cost data yet. Run demo mode to generate data.
      </p>
    );
  }

  const maxUsd = Math.max(...data.map((d) => d.total_usd));

  return (
    <div className="space-y-3">
      {data.map((row) => {
        const pct = maxUsd > 0 ? (row.total_usd / maxUsd) * 100 : 0;
        return (
          <div key={row.agent_id} className="flex items-center gap-3">
            <span className="text-xs text-mc-text-muted w-32 truncate flex-shrink-0 text-right">
              {row.agent_name}
            </span>
            <div className="flex-1 h-5 bg-mc-bg-tertiary rounded overflow-hidden">
              <div
                className="h-full bg-mc-accent-amber/70 rounded transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-xs text-mc-accent-amber w-16 text-right flex-shrink-0 font-mono">
              ${row.total_usd.toFixed(4)}
            </span>
            <span className="text-[10px] text-mc-text-muted w-8 flex-shrink-0">
              {row.pct_of_total}%
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────

export default function Costs() {
  const [period, setPeriod] = useState<'today' | 'week' | 'month' | 'all'>('week');

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ['costs', 'summary', period],
    queryFn: () => costsApi.summary(period),
  });

  const { data: daily, isLoading: dailyLoading } = useQuery({
    queryKey: ['costs', 'daily', PERIOD_DAYS[period]],
    queryFn: () => costsApi.daily(PERIOD_DAYS[period]),
  });

  const { data: taskData } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => tasksApi.list(),
  });

  const { data: records, isLoading: recordsLoading } = useQuery({
    queryKey: ['costs', 'records'],
    queryFn: () => costsApi.records({ limit: 100 }),
  });

  // Derived stats
  const totalCost = summary?.total_cost ?? 0;
  const totalTokens = (summary?.total_input_tokens ?? 0) + (summary?.total_output_tokens ?? 0);
  const taskCount = taskData?.total ?? 0;
  const avgCostPerTask = taskCount > 0 ? totalCost / taskCount : 0;

  // Most expensive agent
  const byAgent = summary?.by_agent ?? {};
  const topAgentEntry = Object.entries(byAgent).sort((a, b) => (b[1] as number) - (a[1] as number))[0];
  const topAgentLabel = topAgentEntry ? `${topAgentEntry[0].slice(0, 8)}… ($${(topAgentEntry[1] as number).toFixed(4)})` : '—';

  // Bar chart data — cost by agent
  const agentBarData = Object.entries(byAgent).map(([id, cost], i) => ({
    name: id.slice(0, 8) + '…',
    cost: Number((cost as number).toFixed(6)),
    fill: CHART_COLORS[i % CHART_COLORS.length],
  }));

  // Line chart data — daily trend
  const lineData = (daily ?? []).map((d) => ({
    date: d.date.slice(5), // MM-DD
    cost: Number(d.cost.toFixed(6)),
  }));

  const isLoading = summaryLoading || dailyLoading;

  return (
    <div>
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold">Cost & Analytics</h2>
        <div className="flex gap-1">
          {(['today', 'week', 'month', 'all'] as const).map((p) => (
            <button
              key={p}
              className={`mc-btn text-xs px-3 py-1.5 ${
                period === p
                  ? 'bg-mc-accent-blue text-white'
                  : 'bg-mc-bg-tertiary text-mc-text-secondary hover:bg-mc-bg-hover'
              }`}
              onClick={() => setPeriod(p)}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Total Spend"
          value={isLoading ? '—' : `$${totalCost.toFixed(4)}`}
          subtext={PERIOD_LABELS[period]}
          color="text-mc-accent-amber"
        />
        <StatCard
          label="Total Tokens"
          value={isLoading ? '—' : totalTokens.toLocaleString()}
          subtext={`${(summary?.total_input_tokens ?? 0).toLocaleString()} in / ${(summary?.total_output_tokens ?? 0).toLocaleString()} out`}
          color="text-mc-accent-blue"
        />
        <StatCard
          label="Avg Cost / Task"
          value={isLoading ? '—' : `$${avgCostPerTask.toFixed(6)}`}
          subtext={`${taskCount} total tasks`}
          color="text-mc-accent-teal"
        />
        <StatCard
          label="Top Agent (Cost)"
          value={isLoading ? '—' : topAgentLabel}
          color="text-mc-accent-purple"
        />
      </div>

      {/* ── 7-Day Sparkline ── */}
      {daily && daily.slice(-7).length > 0 && (
        <div className="mc-card mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-mc-text-secondary">7-Day Cost Trend</h3>
            <span className="text-[10px] text-mc-text-muted uppercase tracking-wider">Last 7 days</span>
          </div>
          <CostSparkline data={daily.slice(-7)} />
        </div>
      )}

      {/* Cost by Agent */}
      <div className="mc-card mb-6">
        <h3 className="text-sm font-semibold text-mc-text-secondary mb-4">Cost by Agent</h3>
        <CostByAgentChart />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* ── Cost by Agent — Bar Chart ── */}
        <div className="mc-card">
          <h3 className="text-sm font-semibold text-mc-text-secondary mb-4">Cost by Agent</h3>
          {isLoading ? (
            <div className="h-48 bg-mc-bg-tertiary rounded animate-pulse" />
          ) : agentBarData.length === 0 ? (
            <div className="h-48 flex items-center justify-center">
              <p className="text-xs text-mc-text-muted">No cost data for this period</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={agentBarData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3a" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 10, fill: '#606070' }}
                  axisLine={{ stroke: '#2a2a3a' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: '#606070' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => `$${v.toFixed(4)}`}
                  width={64}
                />
                <Tooltip content={<CostTooltip />} cursor={{ fill: '#1e1e2e' }} />
                <Bar dataKey="cost" radius={[3, 3, 0, 0]}>
                  {agentBarData.map((entry, i) => (
                    <rect key={i} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* ── Cost by Model — horizontal bars ── */}
        <div className="mc-card">
          <h3 className="text-sm font-semibold text-mc-text-secondary mb-4">Cost by Model</h3>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-8 bg-mc-bg-tertiary rounded animate-pulse" />
              ))}
            </div>
          ) : !summary || Object.keys(summary.by_model).length === 0 ? (
            <div className="h-48 flex items-center justify-center">
              <p className="text-xs text-mc-text-muted">No cost data for this period</p>
            </div>
          ) : (
            <div className="space-y-3">
              {Object.entries(summary.by_model)
                .sort((a, b) => (b[1] as number) - (a[1] as number))
                .map(([model, cost], i) => {
                  const pct = totalCost > 0 ? ((cost as number) / totalCost) * 100 : 0;
                  return (
                    <div key={model}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-mc-text-secondary truncate max-w-[200px]" title={model}>
                          {model}
                        </span>
                        <span className="text-mc-accent-amber ml-2 flex-shrink-0">
                          ${(cost as number).toFixed(6)}
                        </span>
                      </div>
                      <div className="h-2 bg-mc-bg-tertiary rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${Math.max(pct, 1)}%`,
                            backgroundColor: CHART_COLORS[i % CHART_COLORS.length],
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      </div>

      {/* ── Cost Over Time — Line Chart ── */}
      <div className="mc-card">
        <h3 className="text-sm font-semibold text-mc-text-secondary mb-4">
          Cost Over Time ({PERIOD_LABELS[period]})
        </h3>
        {dailyLoading ? (
          <div className="h-48 bg-mc-bg-tertiary rounded animate-pulse" />
        ) : lineData.length === 0 ? (
          <div className="h-48 flex items-center justify-center">
            <p className="text-xs text-mc-text-muted">No daily data available for this period</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={lineData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3a" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: '#606070' }}
                axisLine={{ stroke: '#2a2a3a' }}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 10, fill: '#606070' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => `$${v.toFixed(4)}`}
                width={70}
              />
              <Tooltip content={<CostTooltip />} />
              <Line
                type="monotone"
                dataKey="cost"
                stroke="#f59e0b"
                strokeWidth={2}
                dot={{ fill: '#f59e0b', r: 3, strokeWidth: 0 }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Raw token breakdown */}
      {summary && (
        <div className="mc-card mt-6">
          <h3 className="text-sm font-semibold text-mc-text-secondary mb-3">Token Breakdown</h3>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-xs text-mc-text-muted">Input Tokens</p>
              <p className="font-semibold text-mc-accent-blue mt-0.5">
                {summary.total_input_tokens.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-xs text-mc-text-muted">Output Tokens</p>
              <p className="font-semibold text-mc-accent-teal mt-0.5">
                {summary.total_output_tokens.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-xs text-mc-text-muted">Total</p>
              <p className="font-semibold text-mc-text-primary mt-0.5">
                {totalTokens.toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Cost Records Table ── */}
      <div className="mc-card mt-6">
        <h3 className="text-sm font-semibold text-mc-text-secondary mb-4">Cost Records</h3>
        {recordsLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 bg-mc-bg-tertiary rounded animate-pulse" />
            ))}
          </div>
        ) : !records || records.length === 0 ? (
          <div className="h-24 flex items-center justify-center">
            <p className="text-xs text-mc-text-muted">No cost records found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-mc-border-primary text-mc-text-muted">
                  <th className="text-left py-2 pr-4 font-medium">Timestamp</th>
                  <th className="text-left py-2 pr-4 font-medium">Agent ID</th>
                  <th className="text-left py-2 pr-4 font-medium">Model</th>
                  <th className="text-right py-2 pr-4 font-medium">Input Tokens</th>
                  <th className="text-right py-2 pr-4 font-medium">Output Tokens</th>
                  <th className="text-right py-2 font-medium">Cost</th>
                </tr>
              </thead>
              <tbody>
                {records.map((rec) => (
                  <tr
                    key={rec.id}
                    className="border-b border-mc-border-primary/40 hover:bg-mc-bg-hover transition-colors"
                  >
                    <td className="py-2 pr-4 text-mc-text-secondary whitespace-nowrap">
                      <span
                        title={new Date(rec.timestamp).toLocaleString()}
                        className="cursor-default"
                      >
                        {formatRelativeTime(rec.timestamp)}
                      </span>
                    </td>
                    <td className="py-2 pr-4">
                      {rec.agent_id ? (
                        <span
                          className="font-mono text-mc-accent-blue truncate max-w-[120px] inline-block align-bottom"
                          title={rec.agent_id}
                        >
                          {rec.agent_id.slice(0, 8)}…
                        </span>
                      ) : (
                        <span className="text-mc-text-muted">—</span>
                      )}
                    </td>
                    <td className="py-2 pr-4 text-mc-text-secondary max-w-[160px] truncate" title={rec.model}>
                      {rec.model}
                    </td>
                    <td className="py-2 pr-4 text-right text-mc-text-secondary tabular-nums">
                      {rec.input_tokens.toLocaleString()}
                    </td>
                    <td className="py-2 pr-4 text-right text-mc-text-secondary tabular-nums">
                      {rec.output_tokens.toLocaleString()}
                    </td>
                    <td className="py-2 text-right text-mc-accent-amber font-semibold tabular-nums">
                      ${rec.cost_usd.toFixed(6)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
