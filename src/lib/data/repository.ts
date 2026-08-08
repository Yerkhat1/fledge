import { Run } from "@/lib/types";
import { buildStore, Store } from "./seed";

/**
 * In-memory repository behind a small interface. The rest of the app only ever
 * talks to these functions, so swapping this for Postgres/ClickHouse later is a
 * drop-in change — no service or UI code moves. Cached on globalThis so the
 * seeded dataset survives dev hot-reloads.
 */
const g = globalThis as unknown as { __ETERNITY_STORE__?: Store };

export function getStore(): Store {
  if (!g.__ETERNITY_STORE__) g.__ETERNITY_STORE__ = buildStore();
  return g.__ETERNITY_STORE__;
}

export function getAgents() {
  return getStore().agents;
}

export function getAgent(id: string) {
  return getStore().agents.find((a) => a.id === id);
}

export function getRuns(opts: { agentId?: string; from?: Date; to?: Date }): Run[] {
  let runs = getStore().runs;
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
