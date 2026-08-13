import { analyzeEdit, EditError } from "@/lib/services/edit";
import { applyConfigEdit } from "@/lib/data/repository";
import { getBlueprint } from "@/lib/blueprint";

/**
 * Apply a change. The proposal is re-derived server-side and the gate is
 * enforced here — a core-zone change is refused (409) regardless of what the
 * client sends, so the block can't be bypassed from the browser. Tuning applies
 * outright; near-core applies after its (simulated) regression + canary check.
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

    const note =
      proposal.changes.map((c) => c.label).join(" · ") +
      (proposal.gate === "check" ? " (near-core · checked + canaried)" : " (tuning · spot-checked)");

    const result = applyConfigEdit(agentId, proposal.changes, note);
    if (!result) return Response.json({ error: "Unknown agent." }, { status: 404 });

    return Response.json({
      applied: true,
      version: result.version,
      config: result.config,
      proposal,
      blueprint: getBlueprint(agentId),
    });
  } catch (e) {
    if (e instanceof EditError) return Response.json({ error: e.message }, { status: 400 });
    console.error("edit apply failed", e);
    return Response.json({ error: "Failed to apply the change." }, { status: 500 });
  }
}
