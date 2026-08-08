import { Agent, Blueprint, Run } from "@/lib/types";
import { buildStore } from "./seed";
import { loadPersisted, PersistedData, savePersisted } from "./persist";

/**
 * The single data seam. Everything reads through these functions, so the store
 * can swap for Postgres/ClickHouse later without touching services or UI.
 *
 * The live store is the deterministic seeded dataset merged with any *uploaded*
 * agents loaded from disk (see persist.ts). Cached on globalThis so it survives
 * dev hot-reloads.
 */
interface RepoStore {
  agents: Agent[];
  runs: Run[];
  blueprints: Record<string, Blueprint>;
  persisted: PersistedData; // the uploaded subset, kept so writes can be flushed to disk
}

const g = globalThis as unknown as { __ETERNITY_STORE__?: RepoStore };

function store(): RepoStore {
  const cached = g.__ETERNITY_STORE__;
  // Rebuild if empty, or if a cached object from an older store shape survived a
  // dev hot-reload (missing the newer fields). Rebuilding is lossless: seed data
  // is deterministic and uploaded data is re-read from disk.
  if (!cached || !cached.persisted || !cached.blueprints) {
    const seed = buildStore();
    const persisted = loadPersisted();
    g.__ETERNITY_STORE__ = {
      agents: [...seed.agents, ...persisted.agents],
      runs: [...seed.runs, ...persisted.runs],
      blueprints: { ...persisted.blueprints },
      persisted,
    };
  }
  return g.__ETERNITY_STORE__!;
}

export function getAgents() {
  return store().agents;
}

export function getAgent(id: string) {
  return store().agents.find((a) => a.id === id);
}

export function getRuns(opts: { agentId?: string; from?: Date; to?: Date }): Run[] {
  let runs = store().runs;
  if (opts.agentId) runs = runs.filter((r) => r.agentId === opts.agentId);
  if (opts.from) {
    const f = opts.from.getTime();
    runs = runs.filter((r) => new Date(r.ts).getTime() >= f);
  }
  if (opts.to) {
    const t = opts.to.getTime();
    runs = runs.filter((r) => new Date(r.ts).getTime() <= t);
  }
  return runs;
}

/** Persisted blueprint for an uploaded agent, if one exists. */
export function getStoredBlueprint(agentId: string): Blueprint | undefined {
  return store().blueprints[agentId];
}

/** A slug not already taken by an existing agent (appends -2, -3, … on collision). */
export function uniqueAgentId(base: string): string {
  const taken = new Set(store().agents.map((a) => a.id));
  let id = base || "agent";
  let n = 2;
  while (taken.has(id)) id = `${base}-${n++}`;
  return id;
}

/** Append a newly created agent (with its runs and blueprint) and flush to disk. */
export function commitAgent(rec: { agent: Agent; runs: Run[]; blueprint: Blueprint }): void {
  const s = store();
  s.agents.push(rec.agent);
  s.runs.push(...rec.runs);
  s.blueprints[rec.agent.id] = rec.blueprint;

  s.persisted.agents.push(rec.agent);
  s.persisted.runs.push(...rec.runs);
  s.persisted.blueprints[rec.agent.id] = rec.blueprint;
  savePersisted(s.persisted);
}
