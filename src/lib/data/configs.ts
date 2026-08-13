import { AgentConfig } from "@/lib/types";

/**
 * The editable configuration behind each agent — the artifact the safe-edit
 * engine actually diffs against. In the real product this is extracted from the
 * uploaded agent on ingest; here the seeded demo agents get hand-written configs
 * that mirror their blueprint (system prompt, tool contracts, guardrails), and
 * uploaded agents capture their real spec (see upload.ts).
 */
export const SEED_CONFIGS: Record<string, AgentConfig> = {
  "support-copilot": {
    agentId: "support-copilot",
    model: "claude-sonnet-5",
    temperature: 0.3,
    version: "v4",
    systemPrompt:
      "You are Support Copilot, the front-line assistant for a B2B SaaS company. " +
      "Resolve the customer's issue in as few turns as possible. Be warm, precise, " +
      "and never invent policy. If a request needs a refund, account change, or " +
      "touches billing, follow the guardrails exactly and escalate when unsure.",
    tools: [
      { name: "search", description: "Search the help center and past tickets for relevant answers." },
      { name: "database", description: "Look up the customer's account, plan, and subscription state." },
      { name: "email", description: "Send a transactional follow-up email to the customer." },
      { name: "crm", description: "Read and update the customer record in the CRM." },
    ],
    guardrails: [
      "Never issue a refund above $100 without a human approver.",
      "Escalate to a human agent on any legal, security, or data-deletion request.",
      "Do not reveal internal pricing logic or unreleased features.",
    ],
  },
  "sales-outreach": {
    agentId: "sales-outreach",
    model: "claude-haiku-4-5",
    temperature: 0.6,
    version: "v2",
    systemPrompt:
      "You are a Sales Outreach agent. Draft concise, personalized outreach to leads " +
      "based on their company and role. Keep a confident, friendly tone. Book meetings " +
      "when a lead shows interest. Never overpromise on capabilities or pricing.",
    tools: [
      { name: "search", description: "Enrich a lead from public company and role data." },
      { name: "email", description: "Send outreach and follow-up emails." },
      { name: "calendar", description: "Propose and book meeting slots." },
      { name: "crm", description: "Log activity and update lead stage in the CRM." },
    ],
    guardrails: [
      "Do not make binding pricing or contract commitments.",
      "Escalate to a human rep once a lead asks for a formal quote.",
      "Respect unsubscribe and do-not-contact flags without exception.",
    ],
  },
  "docs-rag": {
    agentId: "docs-rag",
    model: "claude-sonnet-5",
    temperature: 0.2,
    version: "v3",
    systemPrompt:
      "You are a Documentation Assistant. Answer developer questions strictly from the " +
      "retrieved documentation. Prefer short, correct answers with a code example when " +
      "relevant. If the docs do not cover something, say so rather than guessing.",
    tools: [
      { name: "search", description: "Retrieve and re-rank the most relevant documentation chunks." },
      { name: "database", description: "Resolve API symbols and version metadata." },
    ],
    guardrails: [
      "Never answer from prior knowledge when retrieval returns nothing — say the docs don't cover it.",
      "Always cite the source section for any factual claim.",
    ],
  },
  "ops-router": {
    agentId: "ops-router",
    model: "claude-opus-4-8",
    temperature: 0.1,
    version: "v1",
    systemPrompt:
      "You are an Ops Router. Classify each incoming operational request and route it to " +
      "the correct downstream workflow. Be conservative: when a request is ambiguous or " +
      "potentially destructive, ask for confirmation before routing.",
    tools: [
      { name: "database", description: "Read operational state and routing tables." },
      { name: "email", description: "Notify the owning team once a request is routed." },
    ],
    guardrails: [
      "Require explicit human approval before routing any destructive or irreversible action.",
      "Never auto-route a request classified below the confidence threshold.",
    ],
  },
};

/** A deep clone so callers can mutate a working copy without touching the seed. */
export function cloneConfig(c: AgentConfig): AgentConfig {
  return {
    ...c,
    tools: c.tools.map((t) => ({ ...t })),
    guardrails: [...c.guardrails],
  };
}
