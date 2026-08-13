import {
  Agent,
  AgentConfig,
  Blueprint,
  BlueprintEdge,
  BlueprintNode,
  Run,
} from "@/lib/types";
import { commitAgent, uniqueAgentId } from "@/lib/data/repository";

/**
 * Upload service. Turns a user-submitted agent spec into a real agent record, a
 * reconstructed architecture blueprint (a deterministic stub — not an AI call
 * yet), and a synthetic-but-flagged run history so the analytics tabs have
 * something to show. Everything it produces is persisted via the repository.
 */

export interface AgentSpec {
  name: string;
  framework: string;
  model: string;
  system?: string;
  tools: string[];
}

export class SpecError extends Error {}

const KNOWN_FRAMEWORKS = [
  "Claude Agent SDK",
  "LangGraph",
  "LangChain",
  "CrewAI",
  "OpenAI Agents",
  "AutoGen",
  "LlamaIndex",
];

// $ per 1K tokens (illustrative — mirrors seed.ts).
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

function confidenceFor(framework: string): number {
  return KNOWN_FRAMEWORKS.includes(framework) ? 0.88 : 0.63;
}

function cap(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

// ---------- validation ----------

export function parseSpec(raw: unknown): AgentSpec {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new SpecError("Body must be a JSON object.");
  }
  const o = raw as Record<string, unknown>;

  const name = typeof o.name === "string" ? o.name.trim() : "";
  if (!name) throw new SpecError("`name` is required.");
  if (name.length > 60) throw new SpecError("`name` must be 60 characters or fewer.");

  const framework =
    typeof o.framework === "string" && o.framework.trim() ? o.framework.trim() : "Custom code";
  const model =
    typeof o.model === "string" && o.model.trim() ? o.model.trim() : "claude-sonnet-5";

  let system: string | undefined;
  if (o.system != null) {
    if (typeof o.system !== "string") throw new SpecError("`system` must be a string.");
    system = o.system.trim() || undefined;
  }

  let tools: string[] = [];
  if (o.tools != null) {
    if (!Array.isArray(o.tools)) throw new SpecError("`tools` must be an array of strings.");
    tools = [
      ...new Set(
        o.tools
          .filter((t): t is string => typeof t === "string")
          .map((t) => t.trim().toLowerCase())
          .filter(Boolean)
      ),
    ];
  }

  return { name, framework, model, system, tools };
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "agent"
  );
}

// ---------- builders ----------

function buildAgentRecord(id: string, spec: AgentSpec): Agent {
  return {
    id,
    name: spec.name,
    framework: spec.framework,
    model: spec.model,
    status: "draft",
    version: "v1",
    understandingConfidence: confidenceFor(spec.framework),
    synthetic: true,
  };
}

function buildBlueprint(id: string, spec: AgentSpec): Blueprint {
  const nodes: BlueprintNode[] = [
    { id: "intake", label: "Intake · Input", zone: "tuning", x: 24, y: 160, kind: "io" },
    { id: "router", label: "Router · Intent", zone: "core", x: 205, y: 66, kind: "logic" },
    { id: "sys", label: "System Prompt", zone: "core", x: 205, y: 254, kind: "logic" },
  ];
  const edges: BlueprintEdge[] = [
    { from: "intake", to: "router" },
    { from: "intake", to: "sys" },
    { from: "sys", to: "router" },
  ];

  // Middle column: one node per tool contract, plus the guardrail — all core.
  const toolList = spec.tools.slice(0, 6);
  const mid = [
    ...toolList.map((t) => ({ id: `tool_${t}`, label: `Tool · ${cap(t)}`, kind: "tool" as const })),
    { id: "guard", label: "Guardrails · Policy", kind: "guard" as const },
  ];
  const top = 8;
  const bottom = 312;
  const span = mid.length > 1 ? (bottom - top) / (mid.length - 1) : 0;
  mid.forEach((n, i) => {
    nodes.push({
      id: n.id,
      label: n.label,
      zone: "core",
      x: 400,
      y: Math.round(mid.length > 1 ? top + span * i : 160),
      kind: n.kind,
    });
    edges.push({ from: n.kind === "guard" ? "sys" : "router", to: n.id });
  });

  nodes.push(
    { id: "memory", label: "Memory · Context", zone: "near-core", x: 600, y: 92, kind: "logic" },
    { id: "format", label: "Response Formatter", zone: "tuning", x: 600, y: 250, kind: "config" },
    { id: "output", label: "Output", zone: "tuning", x: 786, y: 160, kind: "io" }
  );

  if (toolList.length === 0) {
    edges.push({ from: "router", to: "memory" });
  } else {
    toolList.slice(0, 2).forEach((t) => edges.push({ from: `tool_${t}`, to: "memory" }));
  }
  edges.push(
    { from: "guard", to: "format" },
    { from: "memory", to: "format" },
    { from: "format", to: "output" }
  );

  const coreCount = nodes.filter((n) => n.zone === "core").length;
  const tuneCount = nodes.filter((n) => n.zone === "tuning").length;
  const known = KNOWN_FRAMEWORKS.includes(spec.framework);
  const summary =
    `Reconstructed a ${nodes.length}-node graph from the uploaded ${spec.framework} spec. ` +
    `${coreCount} nodes classified core (router, system prompt, ${toolList.length} tool contract${
      toolList.length === 1 ? "" : "s"
    }, guardrails), 1 near-core, ${tuneCount} safe-to-tune. ` +
    (known
      ? "High confidence — the framework structure was recognized directly. "
      : "Lower confidence — no known framework signature, so more nodes default to 'ask first'. ") +
    "The run history shown for this agent is synthetic preview data generated on upload.";

  return {
    agentId: id,
    confidence: confidenceFor(spec.framework),
    summary,
    nodes,
    edges,
    versions: [
      {
        version: "v1",
        date: todayISO(),
        note: "Initial upload — architecture mapped (synthetic preview)",
        active: true,
      },
    ],
  };
}

function buildConfig(id: string, spec: AgentSpec): AgentConfig {
  return {
    agentId: id,
    model: spec.model,
    temperature: 0.3,
    version: "v1",
    systemPrompt:
      spec.system ??
      `You are ${spec.name}. Follow your tools and guardrails, and ask for ` +
        `confirmation before any high-impact action.`,
    tools: spec.tools.slice(0, 6).map((t) => ({
      name: t,
      description: `${cap(t)} tool (captured from the uploaded ${spec.framework} spec).`,
    })),
    guardrails: [
      "Escalate to a human on any irreversible or high-risk action.",
      "Do not exceed the scope of the configured tools.",
    ],
  };
}

// Small deterministic PRNG so an agent's synthetic history is stable per id.
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function fmtDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function buildRuns(id: string, spec: AgentSpec): Run[] {
  const rand = mulberry32(hash(id));
  const DAYS = 42;
  const now = new Date();
  const model = spec.model;
  const price = MODEL_PRICE[model] ?? MODEL_PRICE["claude-sonnet-5"];
  const baseLatency = MODEL_LATENCY[model] ?? 1300;
  const toolPool = (spec.tools.length ? spec.tools.slice(0, 6) : ["none"]).concat("none");
  const perDay = 8 + Math.floor(rand() * 10);
  const runs: Run[] = [];
  let counter = 0;

  for (let i = 0; i < DAYS; i++) {
    const dayDate = new Date(now);
    dayDate.setDate(now.getDate() - (DAYS - 1 - i));
    const weekend = dayDate.getDay() === 0 || dayDate.getDay() === 6 ? 0.5 : 1;
    const count = Math.max(2, Math.round(perDay * weekend * (0.8 + rand() * 0.4)));

    for (let k = 0; k < count; k++) {
      const tokensIn = Math.round(500 + rand() * 3000);
      const tokensOut = Math.round(120 + rand() * 1100);
      const cachedTokens = Math.round(tokensIn * rand() * 0.5);
      const billedIn = tokensIn - cachedTokens + cachedTokens * 0.1;
      const cost = (billedIn / 1000) * price.in + (tokensOut / 1000) * price.out;
      const latencyMs = Math.max(120, Math.round(baseLatency + tokensOut * 0.8 + rand() * 800 - 200));
      const ts = new Date(dayDate);
      ts.setHours(Math.floor(rand() * 24), Math.floor(rand() * 60), 0, 0);

      runs.push({
        id: `${id}-r${counter++}`,
        agentId: id,
        ts: ts.toISOString(),
        day: fmtDay(dayDate),
        model,
        version: "v1",
        tokensIn,
        tokensOut,
        cachedTokens,
        cost,
        latencyMs,
        success: rand() < 0.9,
        turns: 1 + Math.floor(rand() * 4),
        topic: TOPICS[Math.floor(rand() * TOPICS.length)],
        tool: toolPool[Math.floor(rand() * toolPool.length)],
        synthetic: true,
      });
    }
  }
  return runs;
}

// ---------- orchestration ----------

export function createAgentFromSpec(spec: AgentSpec): Agent {
  const id = uniqueAgentId(slugify(spec.name));
  const agent = buildAgentRecord(id, spec);
  const blueprint = buildBlueprint(id, spec);
  const config = buildConfig(id, spec);
  const runs = buildRuns(id, spec);
  commitAgent({ agent, runs, blueprint, config });
  return agent;
}
