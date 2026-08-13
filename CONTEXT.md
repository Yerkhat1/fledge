# eternity.ai — Project Context

> Living document. Keep this updated as the project evolves — it is the single source
> of truth for the idea, decisions, and current state. Update it whenever a decision
> changes, a phase completes, or the MVP gains real functionality.

## Concept

A control plane for AI agents. You upload your whole agent; the platform (1) shows you
analytics about it (cost, tokens, latency, quality, behavior, style) and (2) lets a
built-in AI change the agent **safely** — applying small tweaks instantly, and catching
or reshaping any change that could break or badly alter the agent before it ships. The
core promise: *"you won't accidentally ruin your expensive agent, and you can still
actually apply the changes you want."*

## Target users

Low-to-mid-size businesses that don't want to pay a specialist and want something
reliable, cheap enough, fast, and easy.

## Core value proposition

Observability + safe editing in one product. The differentiator is the **safe editing**,
not the dashboard (dashboards are commodity). Honest framing: we do **not** promise a
hard guarantee of "won't break" — an agent is non-deterministic. We promise changes that
are **measured, reversible, and caught before they reach production**.

## Key decisions & reasoning (agreed)

1. We edit the **agent itself** (prompt, tools, model, config, code), not a website.
   Users upload the whole agent. A secrets/security policy is TBD (deferred).
2. **Universal intake, tiered by confidence.** Works best on popular frameworks (Claude
   Agent SDK, LangGraph) that the AI already knows and that expose clean, documented
   knobs; best-effort on custom/hardcoded agents where the AI must read source and "try
   harder" (lower confidence, more caution).
3. **The blueprint (IR).** On upload the AI *reads* the agent and *writes* its
   understanding into one standard blueprint — nodes = prompts, tools, guardrails,
   control/data flow. Everything (zoning, stats, edits, versioning) runs off this one
   stored blueprint, built once, not per-framework. Analogy: a hospital where every
   patient gets the same standard chart; confident+fast for common cases, slower+"unsure"
   for rare ones. **Non-negotiable rule:** the understanding must be written down as a
   stored, versioned artifact — not left only in the LLM's head per run (else it's not
   reproducible, can't attach zoning/diffs, and is slow/expensive).
4. **Zoning.** The blueprint labels regions by risk — **core/danger** (system prompt,
   router, tool contracts, guardrails), **near-core**, and **tuning** (wording, format,
   temperature). Risk = zone criticality × dependency fan-out × propagation depth.
5. **Zoning is a cost/speed router** that sets the *verification budget*: safe zone →
   apply + cheap spot-check; near-core → regression pass + 10% canary; core → heavy
   check + human approval. This is what keeps it cheap and fast.
6. **Crux:** zoning tells you blast radius, *not* whether behavior actually degraded. So
   the real safety net is an empirical **eval/regression replay** — run old vs new agent
   on representative cases and diff outputs. Even "safe" edits get a cheap spot-check.
7. **Flywheel:** the observability data *is* the eval set. Captured real traffic →
   sampled golden cases → the safety net that makes editing safe. The two halves are one
   loop.
8. **Blueprint storage:** stored + updated **incrementally** after each edit, with an
   occasional full rebuild when data gets dirty (chosen over regenerating fresh every
   time).
9. **Onboarding** includes a one-time "here's how I understand your agent —
   confirm/correct" step, plus a per-map confidence score.

## Statistics to surface

- **Cost/usage:** tokens in/out/cached, $ cost, cache-hit + savings, cost per
  conversation/task/user, spend trend, cost by model/tool/version.
- **Performance:** latency p50/p95/p99, TTFT, per-tool latency, error/timeout/retry rates.
- **Quality/behavior (differentiator):** task success rate, tool misuse,
  refusal/hallucination, turns-to-resolution, loop detection, tone/persona consistency
  ("style"), guardrail violations.
- **Version comparison + drift alerts** (behavior changed after an edit *or* after an
  upstream provider model update).
- **Business:** resolution/deflection rate, cost per successful task, CSAT, volume by
  intent.
- **Most distinctive four:** success rate, cost-per-successful-task, version comparison,
  drift alerts.

## Current state (BUILT & verified)

**Stack:** Next.js (App Router) + TypeScript + Tailwind + Recharts, dark analytics theme.

**Real backend:** route handlers `/api/agents`, `/api/stats`, `/api/blueprint` compute
everything server-side over a seeded dataset (~9k runs, 60 days, 4 agents) behind a
swappable **repository layer** (`src/lib/data/repository.ts`) — swap to a real DB without
touching services/UI.

- **Statistics tab:** real KPIs, charts, filters (agent + 7/14/30d), version comparison,
  drift, deltas vs a real previous period. All computed, not hardcoded.
- **AI Studio tab:** reconstructed architecture map with core/near-core/tuning zones,
  map-confidence badge, version history, and the **safe-edit engine** (below).

**Safe-edit engine (BUILT):** the impact classifier is now a real engine, not a stub.
- Every agent has an editable **`AgentConfig`** (system prompt, tools, model, temperature,
  guardrails) — the artifact edits diff against. Seed agents get hand-written configs
  (`src/lib/data/configs.ts`); uploaded agents capture their real spec.
- `src/lib/services/edit.ts` — `analyzeEdit()` detects the change *kind*, produces a
  concrete **before→after diff** on the config, maps it to blueprint nodes, and computes
  a **real blast-radius score from the graph** (zone weight × downstream reach). A change
  *kind* → zone table encodes the crux: a wording tweak to the (core) system prompt is
  gated **tuning**, while a model swap / new tool contract / guardrail change is **core**.
- Gate: tuning → auto-apply + spot-check; near-core → regression pass + 10% canary;
  core → **blocked** + a proposed *safer alternative* + send-to-review.
- **Apply is real and reversible:** `applyConfigEdit` mutates the config, bumps the
  version, prepends to Version history, and persists. Core edits are refused server-side
  (409) — the gate can't be bypassed from the browser.
- Design principle: **the model proposes, the deterministic zone-router disposes.** An
  LLM path (`ANTHROPIC_API_KEY`) can propose the diff, but zoning/blast-radius/gate are
  always computed from the graph, so the safety guarantee never depends on the model
  grading itself. Deterministic heuristic engine is the always-on default.
- APIs: `GET /api/config`, `POST /api/edit` (analyze, no mutation), `POST /api/edit/apply`.

**Still not wired:** the LLM proposer runs only with a key set (untested without one); the
eval/regression "safety net" is described in the verification budget but not yet executing
real replays — that's the next depth pass.

**Repo:** https://github.com/isaisai101/eternity-ai (private, branch `main`).

## Roadmap

- **Phase 1 — Make data real:** real DB (Postgres + ClickHouse/Timescale for runs), auth
  + multi-tenant, agent upload, and the big fork: telemetry via **proxy vs SDK vs full
  host**.
- **Phase 2 — Blueprint:** framework parsers → normalized IR; LLM mapper for custom code
  with confidence; store versioned; onboarding confirm; zoning.
- **Phase 3 — Safe-edit engine** (core value; depends on 1+2): AI proposes diff against
  IR → zone router → eval/regression net auto-built from captured traffic → sandbox →
  canary + auto-rollback → human approval for core → one-click version rollback.
- **Phase 4 — Security & trust** (not last if we host): secrets detection/vaulting,
  sandbox isolation for running untrusted uploaded code, audit log.

## The two make-or-break risks

1. **Securely running untrusted uploaded agents** (hosting + sandbox) — biggest eng lift.
2. **The eval-based safety net** — zoning is the cheap filter, eval replay is the proof.
   Without it, "secure" is just a slogan.

## Open decisions

- Integration model: proxy vs SDK vs full host (Phase 1 branches on this).
- Secrets/security policy (deferred).
- Recommended immediate next moves: (a) persistence + real upload form, (b) first real
  blueprint generated by an actual LLM from an uploaded config, (c) pick the integration
  model.

## Changelog

- Initial MVP: full-stack Next.js app with working Statistics tab and AI Studio shell;
  pushed to GitHub (private).
- Local persistence + real agent upload (paste/JSON → agent + blueprint + synthetic runs).
- **Safe-edit engine:** editable AgentConfig for every agent; graph-based blast-radius +
  change-kind zoning; real before→after diffs; gated, reversible apply with live Version
  history; server-enforced core block; LLM-ready (model proposes, graph disposes). New
  routes `/api/config`, `/api/edit`, `/api/edit/apply`.
