import { getBlueprint } from "@/lib/blueprint";
import { getConfig } from "@/lib/data/repository";
import {
  AgentConfig,
  Blueprint,
  BlueprintNode,
  EditGate,
  EditProposal,
  FieldChange,
  VerificationStep,
  Zone,
} from "@/lib/types";

/**
 * The safe-edit engine. Given a plain-English instruction it produces a
 * structured EditProposal: a concrete before→after diff against the stored
 * config, the risk zone the change lands in, a blast-radius score computed from
 * the blueprint graph, and a gate decision (auto-apply / check / blocked).
 *
 * Design: **the model proposes, the deterministic zone-router disposes.** The
 * intent (and, when a model is wired up, the natural before/after text) may come
 * from an LLM, but zoning, blast radius, and the gate are always computed here
 * from the graph — so the safety guarantee never depends on the model grading
 * its own homework.
 */

type Kind =
  | "model"
  | "tool-add"
  | "tool-remove"
  | "guardrail"
  | "behavior"
  | "retrieval"
  | "tone"
  | "temperature"
  | "unknown";

// Change *kind* → risk zone. This is the core table: it encodes that a wording
// tweak to the system prompt is tuning-safe, while a model swap or a new tool
// contract is core, even though both "touch the prompt/router".
const KIND_ZONE: Record<Kind, Zone> = {
  model: "core",
  "tool-add": "core",
  "tool-remove": "core",
  guardrail: "core",
  behavior: "core",
  retrieval: "near-core",
  tone: "tuning",
  temperature: "tuning",
  unknown: "tuning",
};

// Which blueprint node roles a change of each kind reaches. "tools" expands to
// every tool node in the map; other entries are node ids present in both the
// seed and uploaded blueprints.
const KIND_ROLES: Record<Kind, string[]> = {
  model: ["router", "tools"],
  "tool-add": ["router", "tools"],
  "tool-remove": ["tools", "router"],
  guardrail: ["guard", "sys"],
  behavior: ["sys", "router"],
  retrieval: ["memory"],
  tone: ["sys", "format"],
  temperature: ["sys"],
  unknown: ["format"],
};

const MODEL_TIERS = ["claude-haiku-4-5", "claude-sonnet-5", "claude-opus-4-8"];
const MODEL_NAMES: Record<string, string> = {
  opus: "claude-opus-4-8",
  sonnet: "claude-sonnet-5",
  haiku: "claude-haiku-4-5",
  "gpt-4o": "gpt-4o",
  "gpt-4": "gpt-4o",
  "gpt-5": "gpt-5",
  gemini: "gemini-2.5-pro",
  o3: "o3",
};

const ZONE_RANK: Record<Zone, number> = { tuning: 0, "near-core": 1, core: 2 };

function has(hay: string, ...needles: string[]): boolean {
  return needles.some((n) => hay.includes(n));
}

// ---------- intent detection (heuristic) ----------

interface Intent {
  kind: Kind;
  changes: FieldChange[];
  saferAlternative?: string;
}

function stepModel(current: string, dir: "down" | "up"): string {
  const i = MODEL_TIERS.indexOf(current);
  if (i === -1) return dir === "down" ? "claude-haiku-4-5" : "claude-opus-4-8";
  const j = dir === "down" ? Math.max(0, i - 1) : Math.min(MODEL_TIERS.length - 1, i + 1);
  return MODEL_TIERS[j];
}

function targetModel(t: string, current: string): string {
  for (const [alias, id] of Object.entries(MODEL_NAMES)) {
    if (t.includes(alias) && id !== current) return id;
  }
  if (has(t, "cheaper", "cheap", "downgrade", "reduce cost", "lower cost", "save money"))
    return stepModel(current, "down");
  if (has(t, "faster", "speed", "quicker", "latency")) return stepModel(current, "down");
  if (has(t, "smarter", "better", "upgrade", "more capable", "stronger", "quality"))
    return stepModel(current, "up");
  // Neutral swap.
  return current === "claude-sonnet-5" ? "claude-opus-4-8" : "claude-sonnet-5";
}

function extractToolName(t: string): string {
  const m =
    /\badd(?:ing)?\s+(?:a\s+|an\s+|the\s+)?([a-z0-9][a-z0-9 _-]{1,24}?)\s+(?:tool|integration|capability|connector)\b/.exec(
      t
    ) || /\b(?:tool|integration)\s+(?:called\s+|named\s+)?([a-z0-9][a-z0-9 _-]{1,24})/.exec(t);
  if (m) return m[1].trim().replace(/\s+/g, "-");
  const m2 = /\badd(?:ing)?\s+(?:a\s+|an\s+|the\s+)?([a-z0-9][a-z0-9-]{1,20})\b/.exec(t);
  return m2 ? m2[1].trim() : "new-tool";
}

function clause(instruction: string): string {
  const t = instruction.toLowerCase();
  if (has(t, "concise", "shorter", "short", "brief", "terse"))
    return "Keep every reply as short and direct as possible.";
  if (has(t, "warm", "friend", "kinder", "welcoming"))
    return "Adopt a warmer, friendlier tone and end with a short friendly sign-off.";
  if (has(t, "formal", "professional", "serious"))
    return "Use a more formal, professional register.";
  if (has(t, "longer", "detailed", "thorough", "verbose"))
    return "Give fuller, more detailed answers with brief reasoning.";
  return `Adjust wording to: "${instruction.trim()}".`;
}

function appendToPrompt(config: AgentConfig, added: string): FieldChange {
  return {
    path: "systemPrompt",
    label: "System prompt",
    before: config.systemPrompt,
    after: `${config.systemPrompt.trimEnd()}\n\n${added}`,
  };
}

function detectIntent(instruction: string, config: AgentConfig): Intent {
  const t = ` ${instruction.toLowerCase()} `;

  // Order matters: most specific / highest-risk kinds first.
  if (has(t, "remove", "delete", "drop", "disable") && has(t, "tool", "integration", "connector")) {
    const existing = config.tools.find((tool) => t.includes(tool.name.toLowerCase()));
    const name = existing?.name ?? extractToolName(t);
    return {
      kind: "tool-remove",
      changes: [
        {
          path: "tools[-]",
          label: "Tool contract",
          before: existing ? `${existing.name} — ${existing.description}` : `${name} — (tool)`,
          after: "(removed)",
        },
      ],
      saferAlternative: `Disable the "${name}" tool for a 10% canary first and watch for regressions before removing it for everyone.`,
    };
  }

  if (has(t, "add", "introduce", "create", "enable", "new") && has(t, "tool", "integration", "connector", "capability")) {
    const name = extractToolName(t);
    return {
      kind: "tool-add",
      changes: [
        {
          path: "tools[+]",
          label: "Tool contract",
          before: "(none)",
          after: `${name} — new tool contract added from the request.`,
        },
      ],
      saferAlternative: `Register the "${name}" tool in shadow mode (logged but not callable) so you can see how often the router would reach for it before it can affect real conversations.`,
    };
  }

  if (has(t, "model", "cheaper", "faster", "opus", "sonnet", "haiku", "gpt", "gemini", "downgrade", "upgrade")) {
    const to = targetModel(t, config.model);
    return {
      kind: "model",
      changes: [{ path: "model", label: "Model", before: config.model, after: to }],
      saferAlternative: `Route ${to} to a 10% canary alongside ${config.model}, compare cost and success rate on captured traffic, and only cut over if quality holds.`,
    };
  }

  if (has(t, "guardrail", "policy", "refund", "escalat", "approval", "restrict", "block", "compliance", "pii", "safety", "must not", "never ")) {
    const rule = instruction.trim().replace(/\s+/g, " ");
    return {
      kind: "guardrail",
      changes: [
        {
          path: "guardrails[+]",
          label: "Guardrail",
          before: "(new rule)",
          after: rule.charAt(0).toUpperCase() + rule.slice(1) + (/[.!?]$/.test(rule) ? "" : "."),
        },
      ],
      saferAlternative: `Add this as a soft warning (logged, non-blocking) first; promote it to a hard block after a regression pass confirms it doesn't reject legitimate requests.`,
    };
  }

  if (has(t, "retrieval", "rag", "re-rank", "rerank", "ranking", "memory", "context window", "embedding", "chunk", "knowledge base")) {
    return {
      kind: "retrieval",
      changes: [
        appendToPrompt(
          config,
          `Retrieval/memory behavior updated per request: ${instruction.trim()}`
        ),
      ],
    };
  }

  if (has(t, "router", "route", "classif", "decision", "when to", "always", "never", "stop ", "refuse", "instruction", "system prompt")) {
    return {
      kind: "behavior",
      changes: [appendToPrompt(config, `Policy update: ${instruction.trim()}`)],
      saferAlternative: `Apply this behind a 10% canary with automatic rollback, and diff old vs. new outputs on recent captured runs before full rollout.`,
    };
  }

  if (has(t, "temperature", "deterministic", "consistent", "creative", "varied", "random")) {
    const down = has(t, "deterministic", "consistent", "precise", "stable", "lower");
    const target = Math.max(0, Math.min(1, config.temperature + (down ? -0.2 : 0.2)));
    return {
      kind: "temperature",
      changes: [
        {
          path: "temperature",
          label: "Temperature",
          before: config.temperature.toFixed(2),
          after: target.toFixed(2),
        },
      ],
    };
  }

  if (has(t, "tone", "warm", "friend", "concise", "shorter", "longer", "brief", "verbose", "greeting", "sign-off", "signoff", "polite", "persona", "style", "wording", "rephrase", "format", "professional", "formal")) {
    return { kind: "tone", changes: [appendToPrompt(config, clause(instruction))] };
  }

  // Fallback: treat as a low-confidence wording tweak.
  return { kind: "unknown", changes: [appendToPrompt(config, clause(instruction))] };
}

// ---------- graph blast radius ----------

function resolveNodes(bp: Blueprint, roles: string[]): BlueprintNode[] {
  const out: BlueprintNode[] = [];
  for (const role of roles) {
    if (role === "tools") out.push(...bp.nodes.filter((n) => n.kind === "tool"));
    else {
      const n = bp.nodes.find((x) => x.id === role);
      if (n) out.push(n);
    }
  }
  return [...new Map(out.map((n) => [n.id, n])).values()];
}

// Every node reachable downstream from the touched set (inclusive) — the real
// blast radius of the change through the control/data flow.
function reachFrom(bp: Blueprint, startIds: string[]): Set<string> {
  const adj = new Map<string, string[]>();
  for (const e of bp.edges) {
    if (!adj.has(e.from)) adj.set(e.from, []);
    adj.get(e.from)!.push(e.to);
  }
  const seen = new Set<string>(startIds);
  const q = [...startIds];
  while (q.length) {
    const cur = q.shift()!;
    for (const nx of adj.get(cur) ?? []) {
      if (!seen.has(nx)) {
        seen.add(nx);
        q.push(nx);
      }
    }
  }
  return seen;
}

const ZONE_RISK: Record<Zone, { base: number; span: number }> = {
  tuning: { base: 0.12, span: 0.13 },
  "near-core": { base: 0.4, span: 0.18 },
  core: { base: 0.62, span: 0.3 },
};

// ---------- gate + verification ----------

function gateFor(zone: Zone): EditGate {
  return zone === "core" ? "blocked" : zone === "near-core" ? "check" : "auto";
}

function headlineFor(zone: Zone): string {
  return zone === "core"
    ? "High blast radius — won't auto-apply"
    : zone === "near-core"
    ? "Proceed with a check"
    : "Safe to apply";
}

function verificationFor(zone: Zone): VerificationStep[] {
  if (zone === "core")
    return [
      { label: "Regression replay", detail: "Old vs. new agent diffed on a golden set sampled from captured traffic." },
      { label: "Human approval", detail: "A reviewer signs off before anything reaches production." },
      { label: "Canary + auto-rollback", detail: "Ships to a small slice first; rolls back automatically on drift." },
    ];
  if (zone === "near-core")
    return [
      { label: "Regression pass", detail: "Runs against recent captured runs to catch behavior drift." },
      { label: "10% canary", detail: "Rolls out to a slice of traffic with automatic rollback on drift." },
    ];
  return [
    { label: "Spot-check", detail: "Cheap replay on ~5 recent runs confirms behavior held." },
    { label: "One-click rollback", detail: "Fully reversible — the prior version stays pinned." },
  ];
}

// ---------- assembly ----------

function assemble(
  agentId: string,
  instruction: string,
  bp: Blueprint,
  intent: Intent,
  engine: "llm" | "heuristic"
): EditProposal {
  const zone = KIND_ZONE[intent.kind];
  const nodes = resolveNodes(bp, KIND_ROLES[intent.kind]);
  const reach = reachFrom(bp, nodes.map((n) => n.id));
  const reachFrac = bp.nodes.length ? reach.size / bp.nodes.length : 0;
  const { base, span } = ZONE_RISK[zone];
  const risk = Math.min(0.95, base + span * reachFrac);

  const componentZone = nodes.reduce<Zone>(
    (hi, n) => (ZONE_RANK[n.zone] > ZONE_RANK[hi] ? n.zone : hi),
    "tuning"
  );

  const rationale = buildRationale(intent.kind, zone, componentZone, nodes.length, reach.size);

  return {
    agentId,
    instruction,
    zone,
    gate: gateFor(zone),
    risk,
    headline: headlineFor(zone),
    rationale,
    touchedNodeIds: nodes.map((n) => n.id),
    touchedNodeLabels: nodes.map((n) => n.label),
    changes: intent.changes,
    verification: verificationFor(zone),
    saferAlternative: zone === "core" ? intent.saferAlternative : undefined,
    engine,
  };
}

function buildRationale(
  kind: Kind,
  zone: Zone,
  componentZone: Zone,
  touched: number,
  reach: number
): string {
  const what: Record<Kind, string> = {
    model: "Detected a model swap on the router.",
    "tool-add": "Detected a new tool contract.",
    "tool-remove": "Detected removal of a tool contract.",
    guardrail: "Detected a change to a guardrail / policy.",
    behavior: "Detected a change to routing or system-prompt behavior.",
    retrieval: "Detected a retrieval / memory change.",
    tone: "Detected a wording / tone tweak.",
    temperature: "Detected a sampling-temperature change.",
    unknown: "Read this as a low-confidence wording tweak.",
  };
  const reachTxt = `It reaches ${reach} of the mapped node${reach === 1 ? "" : "s"} (${touched} touched directly).`;
  if (zone === "tuning" && componentZone === "core")
    return `${what[kind]} It textually sits in a core component, but only its wording changes — so blast radius stays low and it's safe to auto-apply after a spot-check. ${reachTxt}`;
  if (zone === "core")
    return `${what[kind]} This edits a core zone — tool contracts, guardrails, routing or the model itself feed everything downstream, so it can't auto-apply. ${reachTxt}`;
  if (zone === "near-core")
    return `${what[kind]} Near-core: it shapes quality without redefining a contract, so it ships behind a regression pass and a canary. ${reachTxt}`;
  return `${what[kind]} Low blast radius — a tuning-zone change. ${reachTxt}`;
}

// ---------- LLM path (optional; deterministic fallback) ----------

const KIND_VALUES: Kind[] = [
  "model",
  "tool-add",
  "tool-remove",
  "guardrail",
  "behavior",
  "retrieval",
  "tone",
  "temperature",
  "unknown",
];

/**
 * When ANTHROPIC_API_KEY is set, ask the model to classify the instruction into
 * one of our change kinds and (optionally) improve the before/after wording. We
 * still run the deterministic zoning/gate on the result, so the model can only
 * *propose*, never widen the safety envelope. Returns null on any failure so the
 * caller falls back to the heuristic engine. (Network path — not exercised
 * without a key.)
 */
async function llmIntent(instruction: string, config: AgentConfig): Promise<Intent | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  try {
    const sys =
      "You classify a requested change to an AI agent into exactly one kind and describe the concrete config diff. " +
      "Kinds: " +
      KIND_VALUES.join(", ") +
      ". Respond ONLY with compact JSON: {\"kind\": <kind>, \"after\": <string>} where `after` is the improved replacement text for the primary field (a system-prompt rewrite for tone/behavior/retrieval, a model id for model, a rule for guardrail, a 'name — description' for tool-add).";
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 400,
        system: sys,
        messages: [
          {
            role: "user",
            content: `Current config:\n${JSON.stringify(
              { model: config.model, systemPrompt: config.systemPrompt, tools: config.tools.map((x) => x.name) },
              null,
              2
            )}\n\nRequested change: ${instruction}`,
          },
        ],
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { content?: { text?: string }[] };
    const text = data.content?.[0]?.text ?? "";
    const parsed = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)) as {
      kind?: string;
      after?: string;
    };
    if (!parsed.kind || !KIND_VALUES.includes(parsed.kind as Kind)) return null;
    // Seed the heuristic intent, then overlay the model's improved `after` text
    // onto its primary change so the diff reads naturally.
    const intent = detectIntent(instruction, config);
    intent.kind = parsed.kind as Kind;
    if (parsed.after && intent.changes[0]) intent.changes[0].after = parsed.after;
    return intent;
  } catch {
    return null;
  }
}

// ---------- public API ----------

export class EditError extends Error {}

export async function analyzeEdit(agentId: string, instruction: string): Promise<EditProposal> {
  const clean = instruction.trim();
  if (!clean) throw new EditError("Describe the change you want to make.");
  if (clean.length > 500) throw new EditError("Keep the change description under 500 characters.");

  const config = getConfig(agentId);
  if (!config) throw new EditError(`No editable config found for "${agentId}".`);
  const bp = getBlueprint(agentId);

  const fromLlm = await llmIntent(clean, config);
  if (fromLlm) return assemble(agentId, clean, bp, fromLlm, "llm");
  return assemble(agentId, clean, bp, detectIntent(clean, config), "heuristic");
}
