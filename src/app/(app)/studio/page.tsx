"use client";

import { useEffect, useState } from "react";
import { useFilters } from "@/components/FiltersProvider";
import ArchitectureMap from "@/components/ArchitectureMap";
import EditPanel from "@/components/EditPanel";
import { Blueprint } from "@/lib/types";

function ConfidenceBadge({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = value > 0.85 ? "var(--tuning)" : value > 0.7 ? "var(--near)" : "var(--danger)";
  const label = value > 0.85 ? "High" : value > 0.7 ? "Moderate" : "Low";
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--panel-3)]/50 px-3 py-2">
      <div className="text-right">
        <div className="text-[10px] text-[var(--muted)] leading-none">Map confidence</div>
        <div className="text-[15px] font-semibold leading-tight" style={{ color }}>
          {pct}% · {label}
        </div>
      </div>
      <div className="w-14 h-14 relative grid place-items-center">
        <svg width="56" height="56" viewBox="0 0 56 56" className="-rotate-90">
          <circle cx="28" cy="28" r="24" fill="none" stroke="var(--panel)" strokeWidth="6" />
          <circle
            cx="28"
            cy="28"
            r="24"
            fill="none"
            stroke={color}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={`${2 * Math.PI * 24}`}
            strokeDashoffset={`${2 * Math.PI * 24 * (1 - value)}`}
          />
        </svg>
      </div>
    </div>
  );
}

export default function StudioPage() {
  const { agentId, agent } = useFilters();
  const [bp, setBp] = useState<Blueprint | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!agentId) return;
    setLoading(true);
    fetch(`/api/blueprint?agentId=${agentId}`)
      .then((r) => r.json())
      .then((d: Blueprint) => setBp(d))
      .finally(() => setLoading(false));
  }, [agentId]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[20px] font-semibold tracking-tight">AI Studio</h1>
          <p className="text-[13px] text-[var(--muted)] mt-0.5 max-w-[640px]">
            The AI maps your agent into risk zones, then lets you change it in plain English — applying safe tweaks
            instantly and stopping anything that could break production.
          </p>
        </div>
        {bp && <ConfidenceBadge value={bp.confidence} />}
      </div>

      {loading || !bp ? (
        <div className="grid grid-cols-12 gap-4">
          <div className="skeleton h-[520px] col-span-12 lg:col-span-8" />
          <div className="skeleton h-[520px] col-span-12 lg:col-span-4" />
        </div>
      ) : (
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 lg:col-span-8 flex flex-col gap-4">
            <div className="card">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="card-title">Architecture map</div>
                  <div className="card-sub mt-0.5">
                    {agent ? `${agent.framework} · reconstructed & zoned` : "reconstructed & zoned"}
                  </div>
                </div>
                <span className="chip">
                  <span className="chip-dot bg-[var(--accent)]" /> {bp.nodes.length} nodes
                </span>
              </div>
              <ArchitectureMap blueprint={bp} />
              <p className="text-[12px] text-[var(--muted)] mt-3 leading-snug border-t border-[var(--border)] pt-3">
                {bp.summary}
              </p>
            </div>
          </div>

          <div className="col-span-12 lg:col-span-4 flex flex-col gap-4">
            <EditPanel blueprint={bp} />

            <div className="card">
              <div className="card-title mb-3">Version history</div>
              <div className="flex flex-col gap-3">
                {bp.versions.map((v) => (
                  <div key={v.version} className="flex gap-3">
                    <div className="flex flex-col items-center pt-0.5">
                      <span
                        className={`w-2.5 h-2.5 rounded-full ${v.active ? "bg-[var(--accent)]" : "bg-[var(--faint)]"}`}
                      />
                      <span className="flex-1 w-px bg-[var(--border)] mt-1" />
                    </div>
                    <div className="pb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-semibold">{v.version}</span>
                        {v.active && <span className="chip chip-tuning !py-0.5">active</span>}
                        <span className="text-[11px] text-[var(--faint)]">{v.date}</span>
                      </div>
                      <p className="text-[12px] text-[var(--muted)] mt-0.5 leading-snug">{v.note}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
