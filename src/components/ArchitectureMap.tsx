"use client";

import { useMemo, useState } from "react";
import { Blueprint, BlueprintNode, Zone } from "@/lib/types";

const NODE_W = 138;
const NODE_H = 46;

const ZONE = {
  core: { stroke: "#ff5c7a", fill: "rgba(255,92,122,0.10)", label: "Core" },
  "near-core": { stroke: "#f5b544", fill: "rgba(245,181,68,0.10)", label: "Near-core" },
  tuning: { stroke: "#3ecf8e", fill: "rgba(62,207,142,0.10)", label: "Tuning" },
} as const;

const GUIDANCE: Record<Zone, string> = {
  core: "Core zone — high blast radius. Edits here trigger a regression pass and require human approval before shipping.",
  "near-core": "Near-core — a regression check runs automatically, then a 10% canary before full rollout.",
  tuning: "Tuning zone — low blast radius. Safe to apply after a quick spot-check on recent runs.",
};

export default function ArchitectureMap({ blueprint }: { blueprint: Blueprint }) {
  const [hoverZone, setHoverZone] = useState<Zone | null>(null);
  const [selected, setSelected] = useState<BlueprintNode | null>(null);

  const byId = useMemo(() => {
    const m = new Map<string, BlueprintNode>();
    blueprint.nodes.forEach((n) => m.set(n.id, n));
    return m;
  }, [blueprint.nodes]);

  const center = (n: BlueprintNode) => ({ x: n.x + NODE_W / 2, y: n.y + NODE_H / 2 });

  return (
    <div>
      <div className="rounded-xl border border-[var(--border)] bg-[#0b0d14] overflow-hidden">
        <svg viewBox="0 0 940 366" className="w-full h-auto block">
          {/* edges */}
          {blueprint.edges.map((e, i) => {
            const a = byId.get(e.from);
            const b = byId.get(e.to);
            if (!a || !b) return null;
            const p1 = center(a);
            const p2 = center(b);
            const dim = hoverZone && a.zone !== hoverZone && b.zone !== hoverZone;
            return (
              <line
                key={i}
                x1={p1.x}
                y1={p1.y}
                x2={p2.x}
                y2={p2.y}
                stroke="#ffffff"
                strokeOpacity={dim ? 0.04 : 0.14}
                strokeWidth={1.4}
              />
            );
          })}

          {/* nodes */}
          {blueprint.nodes.map((n) => {
            const z = ZONE[n.zone];
            const active = selected?.id === n.id;
            const dim = hoverZone && n.zone !== hoverZone;
            return (
              <g
                key={n.id}
                transform={`translate(${n.x},${n.y})`}
                style={{ cursor: "pointer", opacity: dim ? 0.35 : 1, transition: "opacity .15s" }}
                onMouseEnter={() => setHoverZone(n.zone)}
                onMouseLeave={() => setHoverZone(null)}
                onClick={() => setSelected(n)}
              >
                <rect
                  width={NODE_W}
                  height={NODE_H}
                  rx={11}
                  fill={z.fill}
                  stroke={z.stroke}
                  strokeWidth={active ? 2 : 1.3}
                  strokeOpacity={active ? 1 : 0.65}
                />
                <circle cx={14} cy={NODE_H / 2} r={4} fill={z.stroke} />
                <text
                  x={26}
                  y={NODE_H / 2 + 4}
                  fontSize={11.5}
                  fontWeight={600}
                  fill="#e8eaf2"
                >
                  {n.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* legend */}
      <div className="flex flex-wrap items-center gap-2 mt-3">
        {(Object.keys(ZONE) as Zone[]).map((z) => (
          <button
            key={z}
            onMouseEnter={() => setHoverZone(z)}
            onMouseLeave={() => setHoverZone(null)}
            className={`chip chip-${z === "near-core" ? "near" : z}`}
          >
            <span className="chip-dot" style={{ background: ZONE[z].stroke }} />
            {ZONE[z].label}
          </button>
        ))}
        <span className="text-[11px] text-[var(--muted)] ml-1">
          Hover a zone to isolate it · click a node for its edit policy
        </span>
      </div>

      {/* selected detail */}
      <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--panel-3)]/40 p-3 min-h-[58px]">
        {selected ? (
          <div className="flex items-start gap-3">
            <span className={`chip chip-${selected.zone === "near-core" ? "near" : selected.zone} mt-0.5`}>
              <span className="chip-dot" style={{ background: ZONE[selected.zone].stroke }} />
              {ZONE[selected.zone].label}
            </span>
            <div>
              <div className="text-[13px] font-semibold">{selected.label}</div>
              <p className="text-[12px] text-[var(--muted)] mt-0.5 leading-snug">{GUIDANCE[selected.zone]}</p>
            </div>
          </div>
        ) : (
          <p className="text-[12px] text-[var(--muted)] leading-snug">
            Select any node to see whether the AI can tune it freely or must ask first. The map is reconstructed on
            upload and stored as a versioned artifact.
          </p>
        )}
      </div>
    </div>
  );
}
