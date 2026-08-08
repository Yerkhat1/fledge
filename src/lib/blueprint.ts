import { getAgent, getStoredBlueprint } from "@/lib/data/repository";
import { AgentVersionInfo, Blueprint, BlueprintEdge, BlueprintNode } from "@/lib/types";

// The reconstructed architecture map. In the real product this is produced by
// the AI on upload and stored as a versioned artifact; here it is a static
// stand-in so the AI Studio tab reads correctly without the AI wired up.
const NODES: BlueprintNode[] = [
  { id: "intake", label: "Intake · Input", zone: "tuning", x: 30, y: 165, kind: "io" },
  { id: "router", label: "Router · Intent", zone: "core", x: 205, y: 80, kind: "logic" },
  { id: "sys", label: "System Prompt", zone: "core", x: 205, y: 250, kind: "logic" },
  { id: "search", label: "Tool · Search", zone: "core", x: 400, y: 20, kind: "tool" },
  { id: "db", label: "Tool · Database", zone: "core", x: 400, y: 110, kind: "tool" },
  { id: "email", label: "Tool · Email", zone: "core", x: 400, y: 200, kind: "tool" },
  { id: "guard", label: "Guardrails · Policy", zone: "core", x: 400, y: 300, kind: "guard" },
  { id: "memory", label: "Memory · Context", zone: "near-core", x: 600, y: 90, kind: "logic" },
  { id: "format", label: "Response Formatter", zone: "tuning", x: 600, y: 250, kind: "config" },
  { id: "output", label: "Output", zone: "tuning", x: 780, y: 165, kind: "io" },
];

const EDGES: BlueprintEdge[] = [
  { from: "intake", to: "router" },
  { from: "intake", to: "sys" },
  { from: "sys", to: "router" },
  { from: "router", to: "search" },
  { from: "router", to: "db" },
  { from: "router", to: "email" },
  { from: "sys", to: "guard" },
  { from: "search", to: "memory" },
  { from: "db", to: "memory" },
  { from: "email", to: "format" },
  { from: "guard", to: "format" },
  { from: "memory", to: "format" },
  { from: "format", to: "output" },
];

const SUMMARY: Record<string, string> = {
  "support-copilot":
    "Reconstructed a 10-node graph. 5 nodes classified as core (system prompt, router, tool contracts, guardrails), 1 near-core, 4 safe-to-tune. High confidence — framework structure was recognized directly.",
  "sales-outreach":
    "LangGraph structure parsed into 10 nodes. Tool contracts and the escalation guardrail are core. Confidence is moderate — a few edges were inferred from runtime traces.",
  "docs-rag":
    "Custom code — the map was reconstructed by reading source, not a known framework. Treat core zones conservatively; confidence is lower and more nodes default to 'ask first'.",
  "ops-router":
    "Draft agent on the Claude Agent SDK. Clean structure, high confidence, but no production traffic yet to back-test edits against.",
};

const DEFAULT_VERSIONS: AgentVersionInfo[] = [
  { version: "v1", date: "2026-07-01", note: "Initial upload — architecture mapped", active: true },
];

const VERSIONS: Record<string, AgentVersionInfo[]> = {
  "support-copilot": [
    { version: "v4", date: "2026-07-24", note: "Tightened refund-policy prompt · added CRM tool", active: true },
    { version: "v3", date: "2026-07-02", note: "Switched formatter to a more concise style", active: false },
    { version: "v2", date: "2026-06-15", note: "Added escalation guardrail", active: false },
    { version: "v1", date: "2026-05-30", note: "Initial upload — architecture mapped", active: false },
  ],
  "sales-outreach": [
    { version: "v2", date: "2026-07-20", note: "New outreach tone · added calendar tool", active: true },
    { version: "v1", date: "2026-06-28", note: "Initial upload — architecture mapped", active: false },
  ],
  "docs-rag": [
    { version: "v3", date: "2026-07-12", note: "Re-ranked retrieval · shorter answers", active: true },
    { version: "v2", date: "2026-06-25", note: "Expanded knowledge base", active: false },
    { version: "v1", date: "2026-06-10", note: "Initial upload — architecture mapped", active: false },
  ],
  "ops-router": DEFAULT_VERSIONS,
};

export function getBlueprint(agentId: string): Blueprint {
  // Uploaded agents carry their own reconstructed map; the static map below is
  // the stand-in for the seeded demo agents.
  const stored = getStoredBlueprint(agentId);
  if (stored) return stored;

  const agent = getAgent(agentId);
  return {
    agentId,
    confidence: agent?.understandingConfidence ?? 0.7,
    summary:
      SUMMARY[agentId] ??
      "Reconstructed agent architecture with risk zones classified by blast radius.",
    nodes: NODES,
    edges: EDGES,
    versions: VERSIONS[agentId] ?? DEFAULT_VERSIONS,
  };
}
