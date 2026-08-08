import { getBlueprint } from "@/lib/blueprint";
import { getAgents } from "@/lib/data/repository";

export function GET(req: Request) {
  const url = new URL(req.url);
  const agentId = url.searchParams.get("agentId") || getAgents()[0].id;
  return Response.json(getBlueprint(agentId));
}
