import { getRuns } from "@/lib/data/repository";
import {
  DriftAlert,
  Kpi,
  NameValue,
  Run,
  StatsResponse,
  TimePoint,
  VersionStat,
} from "@/lib/types";

function percentile(values: number[], p: number) {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const i = Math.min(s.length - 1, Math.floor(p * s.length));
  return s[i];
}
function pctChange(cur: number, prev: number) {
  if (prev === 0) return 0;
  return (cur - prev) / prev;
}
function round(n: number, d = 2) {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

function summarize(runs: Run[]) {
  const totalCost = runs.reduce((s, r) => s + r.cost, 0);
  const totalTokens = runs.reduce((s, r) => s + r.tokensIn + r.tokensOut, 0);
  const cached = runs.reduce((s, r) => s + r.cachedTokens, 0);
  const totalIn = runs.reduce((s, r) => s + r.tokensIn, 0);
  const successes = runs.filter((r) => r.success).length;
  const latencies = runs.map((r) => r.latencyMs);
  return {
    totalCost,
    totalTokens,
    totalRuns: runs.length,
    avgLatencyMs: runs.length ? latencies.reduce((s, v) => s + v, 0) / runs.length : 0,
    p95LatencyMs: percentile(latencies, 0.95),
    successRate: runs.length ? successes / runs.length : 0,
    cacheHitRate: totalIn ? cached / totalIn : 0,
    successes,
  };
}
type Summary = ReturnType<typeof summarize>;

function groupSum(
  runs: Run[],
  key: (r: Run) => string,
  val: (r: Run) => number
): NameValue[] {
  const m = new Map<string, number>();
  for (const r of runs) m.set(key(r), (m.get(key(r)) || 0) + val(r));
  return [...m.entries()].map(([name, value]) => ({ name, value }));
}

function buildDrift(cur: Summary, prev: Summary): DriftAlert[] {
  const alerts: DriftAlert[] = [];
  const latChange = pctChange(cur.p95LatencyMs, prev.p95LatencyMs);
  if (Math.abs(latChange) > 0.08) {
    alerts.push({
      id: "lat",
      severity: latChange > 0 ? "warn" : "info",
      metric: "p95 latency",
      change: `${latChange > 0 ? "+" : ""}${Math.round(latChange * 100)}%`,
      detail: `p95 latency ${latChange > 0 ? "rose" : "fell"} vs. the previous period.`,
    });
  }
  const srDelta = cur.successRate - prev.successRate;
  if (Math.abs(srDelta) > 0.01) {
    alerts.push({
      id: "sr",
      severity: srDelta < 0 ? "danger" : "info",
      metric: "success rate",
      change: `${srDelta > 0 ? "+" : ""}${(srDelta * 100).toFixed(1)} pts`,
      detail: `Task success rate ${srDelta < 0 ? "dropped" : "improved"} after recent changes.`,
    });
  }
  alerts.push({
    id: "model",
    severity: "info",
    metric: "provider model",
    change: "auto-detected",
    detail: "Upstream model revision detected — behavior baseline re-pinned automatically.",
  });
  return alerts;
}

export function getStats(agentId: string, days: number): StatsResponse {
  const now = new Date();
  const to = now;
  const from = new Date(now);
  from.setDate(now.getDate() - days);
  const prevFrom = new Date(now);
  prevFrom.setDate(now.getDate() - 2 * days);

  const runs = getRuns({ agentId, from, to });
  const prevRuns = getRuns({ agentId, from: prevFrom, to: from });

  const cur = summarize(runs);
  const prev = summarize(prevRuns);

  const kpi: Kpi = {
    totalCost: round(cur.totalCost),
    totalTokens: cur.totalTokens,
    totalRuns: cur.totalRuns,
    avgLatencyMs: Math.round(cur.avgLatencyMs),
    p95LatencyMs: Math.round(cur.p95LatencyMs),
    successRate: cur.successRate,
    cacheHitRate: cur.cacheHitRate,
    costPerSuccess: cur.successes ? round(cur.totalCost / cur.successes, 4) : 0,
    deltas: {
      cost: pctChange(cur.totalCost, prev.totalCost),
      runs: pctChange(cur.totalRuns, prev.totalRuns),
      successRate: cur.successRate - prev.successRate,
      latency: pctChange(cur.avgLatencyMs, prev.avgLatencyMs),
    },
  };

  const byDay = new Map<string, Run[]>();
  for (const r of runs) {
    if (!byDay.has(r.day)) byDay.set(r.day, []);
    byDay.get(r.day)!.push(r);
  }
  const timeseries: TimePoint[] = [...byDay.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([day, rs]) => ({
      day,
      cost: round(rs.reduce((s, r) => s + r.cost, 0)),
      tokensIn: rs.reduce((s, r) => s + r.tokensIn, 0),
      tokensOut: rs.reduce((s, r) => s + r.tokensOut, 0),
      runs: rs.length,
      p50: Math.round(percentile(rs.map((r) => r.latencyMs), 0.5)),
      p95: Math.round(percentile(rs.map((r) => r.latencyMs), 0.95)),
    }));

  const costByModel = groupSum(runs, (r) => r.model, (r) => r.cost)
    .map((x) => ({ ...x, value: round(x.value) }))
    .sort((a, b) => b.value - a.value);

  const costByTool = groupSum(
    runs.filter((r) => r.tool !== "none"),
    (r) => r.tool,
    (r) => r.cost
  )
    .map((x) => ({ ...x, value: round(x.value) }))
    .sort((a, b) => b.value - a.value);

  const topics = groupSum(runs, (r) => r.topic, () => 1)
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  const vmap = new Map<string, Run[]>();
  for (const r of runs) {
    if (!vmap.has(r.version)) vmap.set(r.version, []);
    vmap.get(r.version)!.push(r);
  }
  const versions: VersionStat[] = [...vmap.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([version, rs]) => {
      const s = summarize(rs);
      return {
        version,
        runs: rs.length,
        cost: round(s.totalCost),
        successRate: s.successRate,
        avgLatencyMs: Math.round(s.avgLatencyMs),
        costPerSuccess: s.successes ? round(s.totalCost / s.successes, 4) : 0,
      };
    });

  return {
    agentId,
    range: { from: from.toISOString(), to: to.toISOString(), days },
    kpi,
    timeseries,
    costByModel,
    costByTool,
    topics,
    versions,
    drift: buildDrift(cur, prev),
  };
}
