import { analyzeEdit, EditError } from "@/lib/services/edit";
import { runReplay } from "@/lib/services/evals";

// Spend verification budget: sample a golden set from captured traffic and
// project the proposed change's effect. Read-only — never mutates the agent.
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
    const replay = runReplay(agentId, proposal);
    return Response.json({ proposal, replay });
  } catch (e) {
    if (e instanceof EditError) return Response.json({ error: e.message }, { status: 400 });
    console.error("edit replay failed", e);
    return Response.json({ error: "Failed to run the replay." }, { status: 500 });
  }
}
