"use client";

import { useState } from "react";
import { Blueprint, Zone } from "@/lib/types";

const CORE = ["remove", "delete", "tool", "guardrail", "guard", "policy", "system prompt", "system-prompt", "model", "auth", "api ", "schema", "router", "route ", "escalat", "function call"];
const NEAR = ["memory", "context", "retrieval", "rag", "re-rank", "rerank", "rank", "routing"];
const TUNING = ["tone", "word", "phras", "format", "short", "long", "style", "greet", "emoji", "sign-off", "signoff", "concise", "friendly", "polite", "casual", "warm"];

const EXAMPLES = [
  "Make the greeting warmer and more concise",
  "Add a new refund tool and update the policy",
  "Change the routing model to a cheaper one",
];

type Result = {
  zone: Zone;
  risk: number;
  touches: string[];
  headline: string;
  detail: string;
  canApply: boolean;
};

function classify(text: string, blueprint: Blueprint): Result {
  const t = ` ${text.toLowerCase()} `;
  const hitCore = CORE.some((k) => t.includes(k));
  const hitNear = NEAR.some((k) => t.includes(k));
  const zone: Zone = hitCore ? "core" : hitNear ? "near-core" : "tuning";
  const touches = blueprint.nodes
    .filter((n) => n.zone === zone)
    .slice(0, 3)
    .map((n) => n.label);

  if (zone === "core")
    return {
      zone,
      risk: 0.84,
      touches,
      headline: "High blast radius — won't auto-apply",
      detail:
        "This edits a core zone (tool contract, guardrail or system prompt). I can propose a narrower, safer version, or route it for human approval with a full regression pass and canary before anything ships to production.",
      canApply: false,
    };
  if (zone === "near-core")
    return {
      zone,
      risk: 0.46,
      touches,
      headline: "Proceed with a check",
      detail:
        "Touches a near-core node. A regression pass runs on recent runs first, then the change canaries to 10% of traffic with automatic rollback if quality drifts.",
      canApply: true,
    };
  return {
    zone,
    risk: 0.16,
    touches,
    headline: "Safe to apply",
    detail:
      "This lands in a tuning zone — low blast radius. A cheap spot-check against ~5 recent runs confirms behavior held, then it ships. Fully reversible.",
    canApply: true,
  };
}

function chipClass(z: Zone) {
  return `chip-${z === "near-core" ? "near" : z}`;
}

export default function EditPanel({ blueprint }: { blueprint: Blueprint }) {
  const [text, setText] = useState("");
  const [result, setResult] = useState<Result | null>(null);

  const analyze = () => {
    if (!text.trim()) return;
    setResult(classify(text, blueprint));
  };

  const riskColor = (z: Zone) =>
    z === "core" ? "var(--danger)" : z === "near-core" ? "var(--near)" : "var(--tuning)";

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="card-title">Describe a change</div>
          <div className="card-sub mt-0.5">The AI checks which zone it lands in before touching anything.</div>
        </div>
        <span className="chip">
          <span className="chip-dot bg-[var(--warn)]" /> simulation
        </span>
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="e.g. Make the support replies shorter and add a friendlier sign-off…"
        className="w-full h-[92px] resize-none rounded-xl border border-[var(--border)] bg-[var(--panel)] p-3 text-[13px] text-[var(--text)] placeholder:text-[var(--faint)] outline-none focus:border-[var(--accent)]/60"
      />

      <div className="flex flex-wrap gap-1.5 mt-2.5">
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            onClick={() => setText(ex)}
            className="text-[11px] text-[var(--muted)] border border-[var(--border)] rounded-full px-2.5 py-1 hover:border-[var(--border-strong)] hover:text-[var(--text)] transition-colors"
          >
            {ex}
          </button>
        ))}
      </div>

      <button onClick={analyze} disabled={!text.trim()} className="btn btn-primary w-full mt-3">
        Analyze impact
      </button>

      {result && (
        <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--panel-3)]/40 p-3.5">
          <div className="flex items-center gap-2 mb-2.5">
            <span className={`chip ${chipClass(result.zone)}`}>
              <span className="chip-dot" style={{ background: riskColor(result.zone) }} />
              {result.zone === "near-core" ? "Near-core" : result.zone[0].toUpperCase() + result.zone.slice(1)} zone
            </span>
            <span className="text-[13px] font-semibold">{result.headline}</span>
          </div>

          {/* risk meter */}
          <div className="flex items-center gap-2 mb-2.5">
            <span className="text-[11px] text-[var(--muted)] w-16">Blast radius</span>
            <div className="flex-1 h-2 rounded-full bg-[var(--panel)] overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${result.risk * 100}%`, background: riskColor(result.zone) }} />
            </div>
          </div>

          <p className="text-[12.5px] text-[var(--muted)] leading-snug">{result.detail}</p>

          {result.touches.length > 0 && (
            <div className="mt-2.5">
              <div className="text-[11px] text-[var(--faint)] mb-1">Components affected</div>
              <div className="flex flex-wrap gap-1.5">
                {result.touches.map((tch) => (
                  <span key={tch} className="text-[11px] text-[var(--muted)] border border-[var(--border)] rounded-md px-2 py-0.5">
                    {tch}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2 mt-3.5">
            {result.canApply ? (
              <button className="btn btn-primary flex-1">Apply change</button>
            ) : (
              <button className="btn flex-1">Request safer rewrite</button>
            )}
            <button className="btn">Send to review</button>
          </div>
          <p className="text-[10.5px] text-[var(--faint)] mt-2 text-center">
            Preview only — the editing model isn&apos;t wired up in this build.
          </p>
        </div>
      )}
    </div>
  );
}
