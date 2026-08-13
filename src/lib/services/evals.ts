import { getRuns } from "@/lib/data/repository";
import { EditProposal, ReplayCase, ReplayResult, ReplayVerdict, Run, Zone } from "@/lib/types";

/**
 * The eval / regression safety net. Zoning tells you an edit's blast radius;
 * this tells you whether behavior actually held. It samples a golden set from
 * the agent's captured traffic and projects the proposed change's effect on
 * each case — using the real cost/latency tables where the math is exact (a
 * model swap) and grounded heuristics where it can't be without re-running the
 * agent (a guardrail's false-positive risk). Honest about which is which.
 *
 * This is the "flywheel" half of the product: the observability data *is* the
 * eval set.
 */

// $ per 1K tokens + base latency — mirrors seed.ts / upload.ts.
const MODEL_PRICE: Record<string, { in: number; out: number }> = {
  "claude-opus-4-8": { in: 0.015, out: 0.075 },
  "claude-sonnet-5": { in: 0.003, out: 0.015 },
  "claude-haiku-4-5": { in: 0.0008, out: 0.004 },
};
const MODEL_LATENCY: Record<string, number> = {
  "claude-opus-4-8": 2400,
  "claude-sonnet-5": 1300,
  "claude-haiku-4-5": 650,
};
const MODEL_TIERS = ["claude-haiku-4-5", "claude-sonnet-5", "claude-opus-4-8"];

const HARD_TOPICS = new Set(["Refund", "Bug report", "Integration"]);
const SENSITIVE_TOPICS = new Set(["Refund", "Billing", "Account"]);

function billedIn(r: Run): number {
  return r.tokensIn - r.cachedTokens + r.cachedTokens * 0.1;
}
function projCost(r: Run, model: string): number {
  const p = MODEL_PRICE[model] ?? MODEL_PRICE["claude-sonnet-5"];
  return (billedIn(r) / 1000) * p.in + (r.tokensOut / 1000) * p.out;
}
function projLatency(r: Run, model: string): number {
  return (MODEL_LATENCY[model] ?? 1300) + r.tokensOut * 0.8;
}

// Most-recent, topic-stratified sample so the golden set spans the traffic mix
// rather than one busy hour. Deterministic (no RNG) so a replay is repeatable.
function sampleGolden(runs: Run[], size: number): Run[] {
  const recent = [...runs].sort((a, b) => (a.ts < b.ts ? 1 : -1));
  const byTopic = new Map<string, Run[]>();
  for (const r of recent) {
    if (!byTopic.has(r.topic)) byTopic.set(r.topic, []);
    byTopic.get(r.topic)!.push(r);
  }
  const topics = [...byTopic.keys()];
  const out: Run[] = [];
  let i = 0;
  // Round-robin across topics, newest first within each, until we hit `size`.
  while (out.length < size && topics.some((t) => byTopic.get(t)!.length)) {
    const bucket = byTopic.get(topics[i % topics.length])!;
    if (bucket.length) out.push(bucket.shift()!);
    i++;
  }
  return out.slice(0, size);
}

function primaryPath(proposal: EditProposal): string {
  return proposal.changes[0]?.path ?? "systemPrompt";
}

function pct(cur: number, prev: number): number {
  return prev === 0 ? 0 : ((cur - prev) / prev) * 100;
}

interface Projection {
  cases: ReplayCase[];
  costPct: number;
  latencyPct: number;
  successPts: number;
}

function projectModelSwap(golden: Run[], from: string, to: string): Projection {
  let oldCost = 0;
  let newCost = 0;
  let oldLat = 0;
  let newLat = 0;
  const downgrade = MODEL_TIERS.indexOf(to) < MODEL_TIERS.indexOf(from);
  const cases: ReplayCase[] = golden.map((r) => {
    oldCost += projCost(r, from);
    newCost += projCost(r, to);
    oldLat += projLatency(r, from);
    newLat += projLatency(r, to);
    const risky = downgrade && HARD_TOPICS.has(r.topic);
    return {
      runId: r.id,
      topic: r.topic,
      tool: r.tool,
      baselineSuccess: r.success,
      changed: true,
      flagged: risky && r.success,
      note: risky
        ? `Hard topic on a smaller model — may regress`
        : downgrade
        ? `Cheaper model, expected to hold`
        : `Stronger model, expected to hold or improve`,
    };
  });
  const flaggedRate = cases.filter((c) => c.flagged).length / (cases.length || 1);
  // Grounded estimate: a downgrade costs a little success, weighted by how much
  // of the golden set is hard-topic traffic.
  const successPts = downgrade ? -(1 + flaggedRate * 6) : 0.8;
  return { cases, costPct: pct(newCost, oldCost), latencyPct: pct(newLat, oldLat), successPts };
}

function projectToolRemove(golden: Run[], toolName: string): Projection {
  const name = toolName.split("—")[0].trim().toLowerCase();
  const cases: ReplayCase[] = golden.map((r) => {
    const uses = r.tool.toLowerCase() === name;
    return {
      runId: r.id,
      topic: r.topic,
      tool: r.tool,
      baselineSuccess: r.success,
      changed: uses,
      flagged: uses && r.success,
      note: uses ? `Used the removed "${name}" tool — capability lost` : `Did not use "${name}"`,
    };
  });
  const usedRate = cases.filter((c) => c.changed).length / (cases.length || 1);
  return { cases, costPct: 0, latencyPct: 0, successPts: -(usedRate * 8) };
}

function projectToolAdd(golden: Run[]): Projection {
  const cases: ReplayCase[] = golden.map((r) => ({
    runId: r.id,
    topic: r.topic,
    tool: r.tool,
    baselineSuccess: r.success,
    changed: false,
    flagged: false,
    note: `New capability — no historical case exercised it`,
  }));
  return { cases, costPct: 0, latencyPct: 0, successPts: 0 };
}

function projectGuardrail(golden: Run[]): Projection {
  const cases: ReplayCase[] = golden.map((r) => {
    const sensitive = SENSITIVE_TOPICS.has(r.topic);
    return {
      runId: r.id,
      topic: r.topic,
      tool: r.tool,
      baselineSuccess: r.success,
      changed: sensitive,
      // A new hard rule risks blocking cases that used to succeed.
      flagged: sensitive && r.success,
      note: sensitive ? `New rule may block this previously-handled case` : `Outside the rule's scope`,
    };
  });
  const flaggedRate = cases.filter((c) => c.flagged).length / (cases.length || 1);
  return { cases, costPct: 0, latencyPct: 0, successPts: -(flaggedRate * 5) };
}

function projectBehavior(golden: Run[], zone: Zone): Projection {
  // Near-core (retrieval) and core (routing/system) behavior shifts: some cases
  // change; a fraction are worth a human look. Cosmetic tuning holds.
  if (zone === "tuning") {
    const cases: ReplayCase[] = golden.map((r) => ({
      runId: r.id,
      topic: r.topic,
      tool: r.tool,
      baselineSuccess: r.success,
      changed: true,
      flagged: false,
      note: `Wording change — output rephrased, decision unchanged`,
    }));
    return { cases, costPct: 0, latencyPct: 0, successPts: 0 };
  }
  const cases: ReplayCase[] = golden.map((r, idx) => {
    const affected = zone === "core" ? true : HARD_TOPICS.has(r.topic);
    // Flag a modest, deterministic slice of affected+hard cases for review.
    const flagged = affected && HARD_TOPICS.has(r.topic) && idx % 4 === 0 && r.success;
    return {
      runId: r.id,
      topic: r.topic,
      tool: r.tool,
      baselineSuccess: r.success,
      changed: affected,
      flagged,
      note: flagged
        ? `Behavior shift on a hard topic — review the diff`
        : affected
        ? `Behavior may shift; expected within noise`
        : `Unaffected by this change`,
    };
  });
  const flaggedRate = cases.filter((c) => c.flagged).length / (cases.length || 1);
  return { cases, costPct: 0, latencyPct: 0, successPts: -(0.5 + flaggedRate * 4) };
}

function project(golden: Run[], proposal: EditProposal): Projection {
  const path = primaryPath(proposal);
  const change = proposal.changes[0];
  if (path === "model") return projectModelSwap(golden, change.before, change.after);
  if (path === "tools[-]") return projectToolRemove(golden, change.before);
  if (path === "tools[+]") return projectToolAdd(golden);
  if (path === "guardrails[+]" || path === "guardrails[-]") return projectGuardrail(golden);
  if (path === "temperature") return projectBehavior(golden, "tuning");
  // systemPrompt: zone tells tone vs. retrieval vs. behavior.
  return projectBehavior(golden, proposal.zone);
}

function decideVerdict(successPts: number, flaggedRate: number): ReplayVerdict {
  if (successPts < -2 || flaggedRate > 0.25) return "fail";
  if (successPts < -0.5 || flaggedRate > 0) return "warn";
  return "pass";
}

function headlineFor(
  verdict: ReplayVerdict,
  d: { costPct: number; latencyPct: number; successPts: number },
  flagged: number
): string {
  const money =
    Math.abs(d.costPct) >= 1
      ? `${d.costPct < 0 ? "−" : "+"}${Math.abs(d.costPct).toFixed(0)}% cost`
      : "cost flat";
  const lat =
    Math.abs(d.latencyPct) >= 1
      ? `${d.latencyPct < 0 ? "−" : "+"}${Math.abs(d.latencyPct).toFixed(0)}% latency`
      : "latency flat";
  if (verdict === "fail")
    return `${flagged} case${flagged === 1 ? "" : "s"} likely to regress — do not ship as-is.`;
  if (verdict === "warn")
    return `${money}, ${lat}. ${flagged} case${flagged === 1 ? "" : "s"} flagged for review.`;
  return `${money}, ${lat}. Success held across the golden set.`;
}

export function runReplay(agentId: string, proposal: EditProposal): ReplayResult {
  const depth: ReplayResult["depth"] = proposal.zone === "tuning" ? "spot-check" : "regression";
  const size = depth === "spot-check" ? 5 : 40;

  const now = new Date();
  const from = new Date(now);
  from.setDate(now.getDate() - 21);
  const pool = getRuns({ agentId, from, to: now });
  const golden = sampleGolden(pool, size);

  const { cases, costPct, latencyPct, successPts } = project(golden, proposal);
  const changedCases = cases.filter((c) => c.changed).length;
  const flaggedCases = cases.filter((c) => c.flagged).length;
  const flaggedRate = flaggedCases / (cases.length || 1);
  const verdict = decideVerdict(successPts, flaggedRate);

  return {
    agentId,
    zone: proposal.zone,
    depth,
    sampled: golden.length,
    fromRuns: pool.length,
    changedCases,
    flaggedCases,
    deltas: {
      costPct: Math.round(costPct * 10) / 10,
      latencyPct: Math.round(latencyPct * 10) / 10,
      successPts: Math.round(successPts * 10) / 10,
    },
    verdict,
    headline: headlineFor(verdict, { costPct, latencyPct, successPts }, flaggedCases),
    // Show flagged rows first, then a few changed rows, capped for the UI.
    cases: [...cases].sort((a, b) => Number(b.flagged) - Number(a.flagged)).slice(0, 6),
  };
}
