import { Agent, Run } from "@/lib/types";

// Deterministic PRNG so the seeded dataset is stable across restarts.
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// $ per 1K tokens (illustrative).
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

interface AgentSeed extends Agent {
  prevVersion: string;
  splitDay: number; // day index at/after which the current version is live
  fallbackModel: string;
  baseRunsPerDay: number;
  baseSuccess: number;
}

const AGENTS: AgentSeed[] = [
  {
    id: "support-copilot",
    name: "Support Copilot",
    framework: "Claude Agent SDK",
    model: "claude-sonnet-5",
    status: "healthy",
    version: "v4",
    understandingConfidence: 0.93,
    prevVersion: "v3",
    splitDay: 44,
    fallbackModel: "claude-haiku-4-5",
    baseRunsPerDay: 70,
    baseSuccess: 0.95,
  },
  {
    id: "sales-outreach",
    name: "Sales Outreach Agent",
    framework: "LangGraph",
    model: "claude-haiku-4-5",
    status: "degraded",
    version: "v2",
    understandingConfidence: 0.81,
    prevVersion: "v1",
    splitDay: 48,
    fallbackModel: "claude-sonnet-5",
    baseRunsPerDay: 52,
    baseSuccess: 0.87,
  },
  {
    id: "docs-rag",
    name: "Docs Assistant (RAG)",
    framework: "Custom code",
    model: "claude-sonnet-5",
    status: "healthy",
    version: "v3",
    understandingConfidence: 0.64,
    prevVersion: "v2",
    splitDay: 40,
    fallbackModel: "claude-haiku-4-5",
    baseRunsPerDay: 40,
    baseSuccess: 0.92,
  },
  {
    id: "ops-router",
    name: "Ops Router",
    framework: "Claude Agent SDK",
    model: "claude-opus-4-8",
    status: "draft",
    version: "v1",
    understandingConfidence: 0.88,
    prevVersion: "v1",
    splitDay: 0,
    fallbackModel: "claude-sonnet-5",
    baseRunsPerDay: 24,
    baseSuccess: 0.9,
  },
];

const TOPICS = [
  "Billing",
  "Onboarding",
  "Bug report",
  "Feature request",
  "Account",
  "Integration",
  "How-to",
  "Refund",
];
const TOOLS = ["search", "database", "email", "calendar", "crm", "none"];
const HARD_TOPICS = new Set(["Bug report", "Refund", "Integration"]);

export interface Store {
  agents: Agent[];
  runs: Run[];
}

function fmtDay(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function buildStore(): Store {
  const rand = mulberry32(20260808);
  // 60 days so every range (incl. the default 30d) has a real previous period
  // to compute deltas against.
  const DAYS = 60;
  const now = new Date();
  const runs: Run[] = [];
  let counter = 0;

  for (const a of AGENTS) {
    for (let i = 0; i < DAYS; i++) {
      // i = 0 oldest … i = DAYS-1 newest
      const dayDate = new Date(now);
      dayDate.setDate(now.getDate() - (DAYS - 1 - i));
      const weekday = dayDate.getDay();
      const weekend = weekday === 0 || weekday === 6 ? 0.55 : 1;
      const trend = 1 + 0.35 * (i / DAYS);
      const noise = 0.85 + rand() * 0.3;
      const count = Math.max(3, Math.round(a.baseRunsPerDay * weekend * trend * noise));
      const version = i >= a.splitDay ? a.version : a.prevVersion;
      const isCurrent = version === a.version;

      for (let k = 0; k < count; k++) {
        const model = rand() < 0.82 ? a.model : a.fallbackModel;
        const price = MODEL_PRICE[model];
        const tokensIn = Math.round(600 + rand() * 3200);
        const tokensOut = Math.round(150 + rand() * 1250);
        const cachedTokens = Math.round(tokensIn * rand() * 0.5);
        const billedIn = tokensIn - cachedTokens + cachedTokens * 0.1;
        const cost = (billedIn / 1000) * price.in + (tokensOut / 1000) * price.out;
        const topic = TOPICS[Math.floor(rand() * TOPICS.length)];
        const tool = TOOLS[Math.floor(rand() * TOOLS.length)];
        const latencyMs = Math.round(MODEL_LATENCY[model] + tokensOut * 0.8 + rand() * 900 - 200);

        let p = a.baseSuccess + (isCurrent ? 0 : -0.06) + (rand() * 0.06 - 0.03);
        if (HARD_TOPICS.has(topic)) p -= 0.05;
        const success = rand() < p;
        const turns = 1 + Math.floor(rand() * (HARD_TOPICS.has(topic) ? 6 : 4));

        const ts = new Date(dayDate);
        ts.setHours(Math.floor(rand() * 24), Math.floor(rand() * 60), 0, 0);

        runs.push({
          id: `r${counter++}`,
          agentId: a.id,
          ts: ts.toISOString(),
          day: fmtDay(dayDate),
          model,
          version,
          tokensIn,
          tokensOut,
          cachedTokens,
          cost,
          latencyMs: Math.max(120, latencyMs),
          success,
          turns,
          topic,
          tool,
        });
      }
    }
  }

  const agents: Agent[] = AGENTS.map((a) => ({
    id: a.id,
    name: a.name,
    framework: a.framework,
    model: a.model,
    status: a.status,
    version: a.version,
    understandingConfidence: a.understandingConfidence,
  }));

  return { agents, runs };
}
