import {
  Agent,
  AgentConfig,
  AgentVersionInfo,
  Blueprint,
  FieldChange,
  Run,
} from "@/lib/types";
import { buildStore } from "./seed";
import { SEED_CONFIGS, cloneConfig } from "./configs";
import { loadPersisted, PersistedData, savePersisted } from "./persist";

/**
 * The single data seam. Everything reads through these functions, so the store
 * can swap for Postgres/ClickHouse later without touching services or UI.
 *
 * The live store is the deterministic seeded dataset merged with any *uploaded*
 * agents and any *applied edits* loaded from disk (see persist.ts). Cached on
 * globalThis so it survives dev hot-reloads.
 */
interface RepoStore {
  agents: Agent[];
  runs: Run[];
  blueprints: Record<string, Blueprint>;
  configs: Record<string, AgentConfig>;
  // Edit history produced at runtime (newest first). Overlaid on top of the
  // blueprint's static version list so applied edits show up immediately.
  appliedVersions: Record<string, AgentVersionInfo[]>;
  persisted: PersistedData; // the uploaded + edited subset, flushed to disk
}

const g = globalThis as unknown as { __ETERNITY_STORE__?: RepoStore };

function store(): RepoStore {
  const cached = g.__ETERNITY_STORE__;
  // Rebuild if empty, or if a cached object from an older store shape survived a
  // dev hot-reload (missing the newer fields). Rebuilding is lossless: seed data
  // is deterministic and uploaded/edited data is re-read from disk.
  if (!cached || !cached.persisted || !cached.blueprints || !cached.configs) {
    const seed = buildStore();
    const persisted = loadPersisted();
    // Seed configs are the baseline; a persisted (edited or uploaded) config for
    // the same agent wins.
    const configs: Record<string, AgentConfig> = {};
    for (const [id, c] of Object.entries(SEED_CONFIGS)) configs[id] = cloneConfig(c);
    for (const [id, c] of Object.entries(persisted.configs ?? {})) configs[id] = c;

    g.__ETERNITY_STORE__ = {
      agents: [...seed.agents, ...persisted.agents],
      runs: [...seed.runs, ...persisted.runs],
      blueprints: { ...persisted.blueprints },
      configs,
      appliedVersions: { ...(persisted.appliedVersions ?? {}) },
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

/** The editable configuration for an agent (seed or uploaded), if known. */
export function getConfig(agentId: string): AgentConfig | undefined {
  const c = store().configs[agentId];
  return c ? cloneConfig(c) : undefined;
}

/** Runtime edit history (newest first) to overlay on the blueprint's versions. */
export function getVersionOverlay(agentId: string): AgentVersionInfo[] {
  return store().appliedVersions[agentId] ?? [];
}

/** A slug not already taken by an existing agent (appends -2, -3, … on collision). */
export function uniqueAgentId(base: string): string {
  const taken = new Set(store().agents.map((a) => a.id));
  let id = base || "agent";
  let n = 2;
  while (taken.has(id)) id = `${base}-${n++}`;
  return id;
}

/** Append a newly created agent (with its runs, blueprint and config), flush. */
export function commitAgent(rec: {
  agent: Agent;
  runs: Run[];
  blueprint: Blueprint;
  config: AgentConfig;
}): void {
  const s = store();
  s.agents.push(rec.agent);
  s.runs.push(...rec.runs);
  s.blueprints[rec.agent.id] = rec.blueprint;
  s.configs[rec.agent.id] = rec.config;

  s.persisted.agents.push(rec.agent);
  s.persisted.runs.push(...rec.runs);
  s.persisted.blueprints[rec.agent.id] = rec.blueprint;
  s.persisted.configs = s.persisted.configs ?? {};
  s.persisted.configs[rec.agent.id] = rec.config;
  savePersisted(s.persisted);
}

function nextVersion(current: string): string {
  const m = /^v(\d+)$/.exec(current);
  return m ? `v${parseInt(m[1], 10) + 1}` : "v2";
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function applyChangeToConfig(config: AgentConfig, change: FieldChange): void {
  switch (change.path) {
    case "systemPrompt":
      config.systemPrompt = change.after;
      break;
    case "model":
      config.model = change.after;
      break;
    case "temperature": {
      const t = parseFloat(change.after);
      if (!Number.isNaN(t)) config.temperature = t;
      break;
    }
    case "tools[+]":
      // `after` is "name — description"; keep it simple and split on the em dash.
      {
        const [name, ...rest] = change.after.split("—");
        config.tools.push({
          name: name.trim(),
          description: rest.join("—").trim() || "Added tool.",
        });
      }
      break;
    case "tools[-]":
      config.tools = config.tools.filter(
        (t) => t.name.toLowerCase() !== change.before.split("—")[0].trim().toLowerCase()
      );
      break;
    case "guardrails[+]":
      config.guardrails.push(change.after);
      break;
    case "guardrails[-]":
      config.guardrails = config.guardrails.filter((gd) => gd !== change.before);
      break;
    default:
      // Unknown path — no-op, keeps apply total.
      break;
  }
}

/**
 * Apply a set of field changes to an agent's config: clone → mutate → bump
 * version → record history → persist. Returns the new version string. The prior
 * config is retained in persisted history entries, so this is reversible.
 */
export function applyConfigEdit(
  agentId: string,
  changes: FieldChange[],
  note: string
): { version: string; config: AgentConfig } | undefined {
  const s = store();
  const current = s.configs[agentId];
  if (!current) return undefined;

  const updated = cloneConfig(current);
  for (const ch of changes) applyChangeToConfig(updated, ch);
  const version = nextVersion(current.version);
  updated.version = version;
  s.configs[agentId] = updated;

  // Prepend to the runtime overlay; only the newest entry is active.
  const overlay = s.appliedVersions[agentId] ?? [];
  overlay.forEach((v) => (v.active = false));
  overlay.unshift({ version, date: today(), note, active: true });
  s.appliedVersions[agentId] = overlay;

  // Keep the agent record's version label in sync (topbar / selector).
  const agent = s.agents.find((a) => a.id === agentId);
  if (agent) agent.version = version;

  // Persist config + overlay for every edited agent (seed or uploaded) so edits
  // survive a restart.
  s.persisted.configs = s.persisted.configs ?? {};
  s.persisted.appliedVersions = s.persisted.appliedVersions ?? {};
  s.persisted.configs[agentId] = updated;
  s.persisted.appliedVersions[agentId] = overlay;
  savePersisted(s.persisted);

  return { version, config: cloneConfig(updated) };
}
