import { getAgents, getConfig } from "@/lib/data/repository";

export function GET(req: Request) {
  const url = new URL(req.url);
  const agentId = url.searchParams.get("agentId") || getAgents()[0].id;
  const config = getConfig(agentId);
  if (!config) return Response.json({ error: "Unknown agent." }, { status: 404 });
  return Response.json(config);
}
