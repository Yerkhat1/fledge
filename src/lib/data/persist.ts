import fs from "node:fs";
import path from "node:path";
import { Agent, Blueprint, Run } from "@/lib/types";

/**
 * Local durable persistence for *uploaded* agents. Seeded demo data is
 * regenerated deterministically at boot (see seed.ts), so only the subset a
 * user creates is written to disk. This is a JSON file — fine for local/single
 * user; it does not survive on an ephemeral serverless filesystem. See the
 * repository comment for the swap point if this ever needs a networked DB.
 */
export interface PersistedData {
  agents: Agent[];
  runs: Run[];
  blueprints: Record<string, Blueprint>;
}

const DATA_DIR = path.join(process.cwd(), ".data");
const STORE_PATH = path.join(DATA_DIR, "store.json");

export function loadPersisted(): PersistedData {
  try {
    const parsed = JSON.parse(fs.readFileSync(STORE_PATH, "utf8")) as Partial<PersistedData>;
    return {
      agents: parsed.agents ?? [],
      runs: parsed.runs ?? [],
      blueprints: parsed.blueprints ?? {},
    };
  } catch {
    // No file yet (or unreadable) — start empty.
    return { agents: [], runs: [], blueprints: {} };
  }
}

export function savePersisted(data: PersistedData): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  // Write to a temp file then rename, so a crash mid-write can't corrupt the store.
  const tmp = `${STORE_PATH}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(tmp, STORE_PATH);
}
