"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Agent } from "@/lib/types";

interface Ctx {
  agents: Agent[];
  agent: Agent | null;
  agentId: string;
  setAgentId: (id: string) => void;
  registerAgent: (agent: Agent) => void;
  days: number;
  setDays: (d: number) => void;
  loading: boolean;
}

const FiltersContext = createContext<Ctx | null>(null);

export function FiltersProvider({ children }: { children: React.ReactNode }) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentId, setAgentId] = useState<string>("");
  const [days, setDays] = useState<number>(30);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/agents")
      .then((r) => r.json())
      .then((d) => {
        setAgents(d.agents);
        setAgentId((cur) => cur || d.agents[0]?.id || "");
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const agent = useMemo(
    () => agents.find((a) => a.id === agentId) ?? null,
    [agents, agentId]
  );

  // Append a freshly uploaded agent and select it, without a round-trip refetch.
  const registerAgent = (a: Agent) => {
    setAgents((prev) => (prev.some((x) => x.id === a.id) ? prev : [...prev, a]));
    setAgentId(a.id);
  };

  return (
    <FiltersContext.Provider
      value={{ agents, agent, agentId, setAgentId, registerAgent, days, setDays, loading }}
    >
      {children}
    </FiltersContext.Provider>
  );
}

export function useFilters() {
  const ctx = useContext(FiltersContext);
  if (!ctx) throw new Error("useFilters must be used within FiltersProvider");
  return ctx;
}
