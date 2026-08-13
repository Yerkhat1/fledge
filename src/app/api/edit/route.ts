import { analyzeEdit, EditError } from "@/lib/services/edit";

// Analyze a proposed change and return an EditProposal. Never mutates state —
// applying is a separate, gate-enforcing call (see /api/edit/apply).
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
    return Response.json(proposal);
  } catch (e) {
    if (e instanceof EditError) return Response.json({ error: e.message }, { status: 400 });
    console.error("edit analyze failed", e);
    return Response.json({ error: "Failed to analyze the change." }, { status: 500 });
  }
}
