import { getAgents } from "@/lib/data/repository";

export function GET() {
  return Response.json({ agents: getAgents() });
}
