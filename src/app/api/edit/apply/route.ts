import { analyzeEdit, EditError } from "@/lib/services/edit";
import { applyConfigEdit } from "@/lib/data/repository";
import { runReplay } from "@/lib/services/evals";
import { getBlueprint } from "@/lib/blueprint";

/**
 * Apply a change. The proposal is re-derived server-side and the gate is
 * enforced here — a core-zone change is refused (409) regardless of what the
 * client sends, so the block can't be bypassed from the browser. Every apply
 * runs the eval replay first; a `fail` verdict blocks the change even in the
 * tuning zone. Tuning applies after a spot-check; near-core after a regression
 * pass + canary.
 */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const o = (body ?? {}) as Record<string, unknown>;
  const agentId = typeof o.agentId === "string" ? o.agentId : "";
  const instruction = typeof o.instruction === "string" ? o.instruction : "";
  if (!agentId) return Response.json({ error: "`agentId` is required." }, { status: 400 });

  try {
    const proposal = await analyzeEdit(agentId, instruction);

    if (proposal.gate === "blocked") {
      return Response.json(
        {
          error: "This is a core-zone change and can't be auto-applied.",
          proposal,
        },
        { status: 409 }
      );
    }

    // Empirical safety net: replay before applying. A failing verdict blocks the
    // change regardless of zone.
    const replay = runReplay(agentId, proposal);
    if (replay.verdict === "fail") {
      return Response.json(
        {
          error: "Regression replay failed — the change would degrade behavior.",
          proposal,
          replay,
        },
        { status: 409 }
      );
    }

    const note =
      proposal.changes.map((c) => c.label).join(" · ") +
      (proposal.gate === "check" ? " (near-core · regression + canary)" : " (tuning · spot-checked)");

    const result = applyConfigEdit(agentId, proposal.changes, note);
    if (!result) return Response.json({ error: "Unknown agent." }, { status: 404 });

    return Response.json({
      applied: true,
      version: result.version,
      config: result.config,
      proposal,
      replay,
      blueprint: getBlueprint(agentId),
    });
  } catch (e) {
    if (e instanceof EditError) return Response.json({ error: e.message }, { status: 400 });
    console.error("edit apply failed", e);
    return Response.json({ error: "Failed to apply the change." }, { status: 500 });
  }
}
