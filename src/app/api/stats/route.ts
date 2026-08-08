import { getAgents } from "@/lib/data/repository";
import { getStats } from "@/lib/services/stats";

export function GET(req: Request) {
  const url = new URL(req.url);
  const agentId = url.searchParams.get("agentId") || getAgents()[0].id;
  const days = Math.max(1, Math.min(90, Number(url.searchParams.get("days") || "30")));
  return Response.json(getStats(agentId, days));
}
