"use client";

import { useEffect, useRef, useState } from "react";
import { useFilters } from "./FiltersProvider";

const RANGES = [7, 14, 30];

function statusClass(status: string) {
  return status === "healthy"
    ? "status-healthy"
    : status === "degraded"
    ? "status-degraded"
    : "status-draft";
}

export default function Topbar() {
  const { agents, agent, agentId, setAgentId, days, setDays } = useFilters();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <header className="h-[61px] shrink-0 sticky top-0 z-20 flex items-center justify-between gap-4 px-6 border-b border-[var(--border)] bg-[var(--bg)]/70 backdrop-blur-md">
      {/* Agent selector */}
      <div className="relative" ref={ref}>
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--panel-2)] pl-3 pr-2.5 py-1.5 hover:border-[var(--border-strong)] transition-colors"
        >
          <span className={`status-dot ${statusClass(agent?.status ?? "draft")}`} />
          <div className="text-left leading-tight">
            <div className="text-[13.5px] font-semibold">{agent?.name ?? "Select agent"}</div>
            <div className="text-[11px] text-[var(--muted)]">
              {agent ? `${agent.framework} · ${agent.model} · ${agent.version}` : "—"}
            </div>
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[var(--muted)] ml-1">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>

        {open && (
          <div className="absolute top-[calc(100%+8px)] left-0 w-[340px] rounded-xl border border-[var(--border-strong)] bg-[var(--panel-2)] shadow-2xl p-1.5 z-30">
            <div className="text-[10px] uppercase tracking-wider text-[var(--faint)] px-2.5 py-1.5">
              Your agents
            </div>
            {agents.map((a) => (
              <button
                key={a.id}
                onClick={() => {
                  setAgentId(a.id);
                  setOpen(false);
                }}
                className={`w-full flex items-center gap-3 rounded-lg px-2.5 py-2 text-left hover:bg-white/[0.04] ${
                  a.id === agentId ? "bg-white/[0.05]" : ""
                }`}
              >
                <span className={`status-dot ${statusClass(a.status)}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium truncate">{a.name}</div>
                  <div className="text-[11px] text-[var(--muted)] truncate">
                    {a.framework} · {a.model}
                  </div>
                </div>
                <span className="text-[11px] text-[var(--faint)]">{a.version}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Range control */}
      <div className="flex items-center gap-1 rounded-xl border border-[var(--border)] bg-[var(--panel-2)] p-1">
        {RANGES.map((r) => (
          <button
            key={r}
            onClick={() => setDays(r)}
            className={`text-[12.5px] font-semibold px-3 py-1.5 rounded-lg transition-colors ${
              days === r
                ? "bg-[var(--panel-3)] text-[var(--text)] shadow-sm"
                : "text-[var(--muted)] hover:text-[var(--text)]"
            }`}
          >
            {r}d
          </button>
        ))}
      </div>
    </header>
  );
}
