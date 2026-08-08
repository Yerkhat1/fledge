"use client";

import { useEffect, useState } from "react";
import { useFilters } from "@/components/FiltersProvider";
import { CostArea, HBar, LatencyLines, ModelDonut, TokensArea } from "@/components/charts";
import { StatsResponse } from "@/lib/types";
import { fmtCompact, fmtMs, fmtPct, fmtSignedPct, fmtUsdFull } from "@/lib/format";

type GoodDir = "up" | "down" | "none";

function Delta({ value, kind, good }: { value: number; kind: "pct" | "pts"; good: GoodDir }) {
  const up = value > 0.0005;
  const down = value < -0.0005;
  let tone: "good" | "bad" | "neutral" = "neutral";
  if (good !== "none" && (up || down)) {
    const isGood = good === "up" ? up : down;
    tone = isGood ? "good" : "bad";
  }
  const text =
    kind === "pct" ? fmtSignedPct(value) : `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)} pts`;
  const arrow = up ? "▲" : down ? "▼" : "•";
  return (
    <span className={`delta ${tone}`}>
      <span className="text-[9px]">{arrow}</span>
      {text}
    </span>
  );
}

function KpiCard({
  label,
  value,
  sub,
  delta,
  deltaKind = "pct",
  good = "none",
}: {
  label: string;
  value: string;
  sub?: string;
  delta?: number;
  deltaKind?: "pct" | "pts";
  good?: GoodDir;
}) {
  return (
    <div className="card !p-4 flex flex-col gap-2">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-[var(--faint)]">{sub ?? " "}</span>
        {delta !== undefined && <Delta value={delta} kind={deltaKind} good={good} />}
      </div>
    </div>
  );
}

function Panel({
  title,
  sub,
  children,
  className = "",
  right,
}: {
  title: string;
  sub?: string;
  children: React.ReactNode;
  className?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className={`card ${className}`}>
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="card-title">{title}</div>
          {sub && <div className="card-sub mt-0.5">{sub}</div>}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

function VersionCompare({ data }: { data: StatsResponse["versions"] }) {
  const maxCost = Math.max(...data.map((v) => v.cost), 1);
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-[52px_1fr_84px_84px_92px] gap-2 text-[11px] text-[var(--faint)] px-1">
        <span>Version</span>
        <span>Success rate</span>
        <span className="text-right">Runs</span>
        <span className="text-right">Avg lat.</span>
        <span className="text-right">$/success</span>
      </div>
      {data.map((v, i) => {
        const isLatest = i === data.length - 1;
        return (
          <div
            key={v.version}
            className={`grid grid-cols-[52px_1fr_84px_84px_92px] gap-2 items-center px-1 py-1.5 rounded-lg ${
              isLatest ? "bg-[rgba(124,140,255,0.07)]" : ""
            }`}
          >
            <span className="text-[13px] font-semibold flex items-center gap-1.5">
              {v.version}
              {isLatest && <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" />}
            </span>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-2 rounded-full bg-[var(--panel-3)] overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${v.successRate * 100}%`,
                    background: v.successRate > 0.9 ? "var(--tuning)" : v.successRate > 0.85 ? "var(--near)" : "var(--danger)",
                  }}
                />
              </div>
              <span className="text-[12px] tabular-nums w-11 text-right">{fmtPct(v.successRate)}</span>
            </div>
            <span className="text-[12.5px] text-right tabular-nums text-[var(--muted)]">{fmtCompact(v.runs)}</span>
            <span className="text-[12.5px] text-right tabular-nums text-[var(--muted)]">{fmtMs(v.avgLatencyMs)}</span>
            <span className="text-[12.5px] text-right tabular-nums text-[var(--muted)]">${v.costPerSuccess.toFixed(3)}</span>
            <span className="hidden" aria-hidden style={{ width: `${(v.cost / maxCost) * 0}px` }} />
          </div>
        );
      })}
      <p className="text-[11px] text-[var(--muted)] mt-1 leading-snug">
        The safe-edit engine replays these same runs against a proposed change to measure whether behavior held before shipping.
      </p>
    </div>
  );
}

function DriftCard({ alerts }: { alerts: StatsResponse["drift"] }) {
  const color = (s: string) => (s === "danger" ? "var(--danger)" : s === "warn" ? "var(--near)" : "var(--accent)");
  return (
    <div className="flex flex-col gap-2.5">
      {alerts.map((a) => (
        <div key={a.id} className="rounded-xl border border-[var(--border)] bg-[var(--panel-3)]/40 p-3">
          <div className="flex items-center justify-between">
            <span className="text-[12.5px] font-semibold capitalize">{a.metric}</span>
            <span className="text-[12px] font-bold tabular-nums" style={{ color: color(a.severity) }}>
              {a.change}
            </span>
          </div>
          <p className="text-[11.5px] text-[var(--muted)] mt-1 leading-snug">{a.detail}</p>
        </div>
      ))}
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="skeleton h-[104px]" />
        ))}
      </div>
      <div className="grid grid-cols-12 gap-4">
        <div className="skeleton h-[300px] col-span-12 lg:col-span-8" />
        <div className="skeleton h-[300px] col-span-12 lg:col-span-4" />
      </div>
    </div>
  );
}

export default function StatisticsPage() {
  const { agentId } = useFilters();
  const { days } = useFilters();
  const [data, setData] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!agentId) return;
    setLoading(true);
    fetch(`/api/stats?agentId=${agentId}&days=${days}`)
      .then((r) => r.json())
      .then((d: StatsResponse) => setData(d))
      .finally(() => setLoading(false));
  }, [agentId, days]);

  if (loading || !data) {
    return (
      <div>
        <PageHeader />
        <SkeletonGrid />
      </div>
    );
  }

  const k = data.kpi;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader />

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <KpiCard label="Total spend" value={fmtUsdFull(k.totalCost)} sub={`${days}d window`} delta={k.deltas.cost} good="none" />
        <KpiCard label="Runs" value={fmtCompact(k.totalRuns)} sub="agent invocations" delta={k.deltas.runs} good="up" />
        <KpiCard label="Success rate" value={fmtPct(k.successRate)} sub="task completion" delta={k.deltas.successRate} deltaKind="pts" good="up" />
        <KpiCard label="Avg latency" value={fmtMs(k.avgLatencyMs)} sub={`p95 ${fmtMs(k.p95LatencyMs)}`} delta={k.deltas.latency} good="down" />
        <KpiCard label="Cache hit" value={fmtPct(k.cacheHitRate)} sub="prompt cache" />
        <KpiCard label="Cost / success" value={`$${k.costPerSuccess.toFixed(3)}`} sub="unit economics" />
      </div>

      {/* Cost + model mix */}
      <div className="grid grid-cols-12 gap-4">
        <Panel title="Spend over time" sub="Daily cost across all models" className="col-span-12 lg:col-span-8">
          <CostArea data={data.timeseries} />
        </Panel>
        <Panel title="Cost by model" sub="Where the money goes" className="col-span-12 lg:col-span-4">
          <ModelDonut data={data.costByModel} />
        </Panel>
      </div>

      {/* Tokens + latency */}
      <div className="grid grid-cols-12 gap-4">
        <Panel title="Token throughput" sub="Input vs. output tokens per day" className="col-span-12 lg:col-span-6">
          <TokensArea data={data.timeseries} />
        </Panel>
        <Panel title="Latency" sub="p50 vs. p95 response time" className="col-span-12 lg:col-span-6">
          <LatencyLines data={data.timeseries} />
        </Panel>
      </div>

      {/* Version compare + drift */}
      <div className="grid grid-cols-12 gap-4">
        <Panel
          title="Version comparison"
          sub="How each version actually performs"
          className="col-span-12 lg:col-span-8"
          right={<span className="chip">safe-edit baseline</span>}
        >
          <VersionCompare data={data.versions} />
        </Panel>
        <Panel title="Drift & alerts" sub="Behavior changes worth a look" className="col-span-12 lg:col-span-4">
          <DriftCard alerts={data.drift} />
        </Panel>
      </div>

      {/* Topics + tools */}
      <div className="grid grid-cols-12 gap-4">
        <Panel title="Top intents" sub="What users actually ask" className="col-span-12 lg:col-span-6">
          <HBar data={data.topics} />
        </Panel>
        <Panel title="Cost by tool" sub="Spend attributed to each tool call" className="col-span-12 lg:col-span-6">
          <HBar data={data.costByTool} unit="usd" />
        </Panel>
      </div>
    </div>
  );
}

function PageHeader() {
  return (
    <div className="mb-1">
      <h1 className="text-[20px] font-semibold tracking-tight">Statistics</h1>
      <p className="text-[13px] text-[var(--muted)] mt-0.5">
        Cost, performance and behavior for the selected agent. Computed server-side over live run data.
      </p>
    </div>
  );
}
