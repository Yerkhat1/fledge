# eternity.ai

An agent control plane: upload your AI agent, watch what it costs and how it behaves, and change it **safely** — the built-in AI maps your agent into risk zones and stops edits that could break production.

> MVP. The analytics and API are real (computed server-side over seeded run data); the AI editor is a working visual/interaction stub, not yet wired to a model.

## What's here

**Statistics** — cost, tokens, latency (p50/p95), success rate, cache-hit, cost-per-success, version comparison, drift alerts, top intents and cost-by-tool. All computed server-side and filterable by agent and time range.

**AI Studio** — the reconstructed architecture map with **core / near-core / tuning** risk zones, a map-confidence score, version history, and an impact classifier that routes a proposed change to the right zone (safe tweaks apply instantly; core-zone changes are blocked and offered a safer rewrite).

## Architecture

UI → thin API routes → services → **repository**. Everything reads through `src/lib/data/repository.ts`, so the seeded in-memory store swaps for a real database without touching services or UI.

```
src/
  app/
    (app)/statistics      Statistics tab
    (app)/studio          AI Studio tab
    api/{agents,stats,blueprint}   backend route handlers
  lib/
    data/{seed,repository}   seeded dataset + swappable data layer
    services/stats          aggregation logic
    blueprint               architecture map + risk zones
  components/               shell, charts, architecture map, edit panel
```

## Run

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Stack

Next.js (App Router) · TypeScript · Tailwind CSS · Recharts.
