import { getAgents } from "@/lib/data/repository";
import { createAgentFromSpec, parseSpec, SpecError } from "@/lib/services/upload";

export function GET() {
  return Response.json({ agents: getAgents() });
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  try {
    const spec = parseSpec(body);
    const agent = createAgentFromSpec(spec);
    return Response.json({ agent }, { status: 201 });
  } catch (e) {
    if (e instanceof SpecError) {
      return Response.json({ error: e.message }, { status: 400 });
    }
    console.error("agent upload failed", e);
    return Response.json({ error: "Failed to create agent." }, { status: 500 });
  }
}
