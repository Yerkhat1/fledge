"use client";

import { useEffect, useState } from "react";
import {
  AgentConfig,
  Blueprint,
  EditProposal,
  FieldChange,
  ReplayResult,
  ReplayVerdict,
  Zone,
} from "@/lib/types";

const EXAMPLES = [
  "Make the greeting warmer and more concise",
  "Add a new refund tool and update the policy",
  "Change the routing model to a cheaper one",
];

function chipClass(z: Zone) {
  return `chip-${z === "near-core" ? "near" : z}`;
}
function riskColor(z: Zone) {
  return z === "core" ? "var(--danger)" : z === "near-core" ? "var(--near)" : "var(--tuning)";
}
function zoneLabel(z: Zone) {
  return z === "near-core" ? "Near-core" : z[0].toUpperCase() + z.slice(1);
}

function verdictColor(v: ReplayVerdict) {
  return v === "fail" ? "var(--danger)" : v === "warn" ? "var(--near)" : "var(--tuning)";
}
function verdictLabel(v: ReplayVerdict) {
  return v === "fail" ? "Fail" : v === "warn" ? "Warn" : "Pass";
}
function signedPct(n: number) {
  return `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n)}%`;
}

// A projected metric: for cost/latency a drop is good; for success a rise is good.
function Metric({
  label,
  value,
  unit,
  goodWhen,
}: {
  label: string;
  value: number;
  unit: "%" | "pts";
  goodWhen: "down" | "up";
}) {
  const good = goodWhen === "down" ? value < 0 : value > 0;
  const color = value === 0 ? "var(--muted)" : good ? "var(--success)" : "var(--danger)";
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  const text = unit === "%" ? signedPct(value) : `${sign}${Math.abs(value)} pts`;
  return (
    <div className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--panel)]/50 px-2.5 py-2">
      <div className="text-[10px] text-[var(--faint)]">{label}</div>
      <div className="text-[13px] font-semibold tabular-nums" style={{ color }}>
        {text}
      </div>
    </div>
  );
}

function ReplayView({ replay }: { replay: ReplayResult }) {
  const c = verdictColor(replay.verdict);
  return (
    <div className="mt-3 rounded-xl border p-3" style={{ borderColor: `${c}55`, background: `${c}0f` }}>
      <div className="flex items-center gap-2 mb-2">
        <span
          className="chip"
          style={{ color: c, borderColor: `${c}59`, background: `${c}1a` }}
        >
          <span className="chip-dot" style={{ background: c }} />
          Replay · {verdictLabel(replay.verdict)}
        </span>
        <span className="text-[11px] text-[var(--muted)]">
          {replay.sampled} cases · {replay.depth} · from {replay.fromRuns.toLocaleString()} runs
        </span>
      </div>

      <p className="text-[12.5px] leading-snug mb-2.5" style={{ color: replay.verdict === "fail" ? "#ffb3c2" : "var(--text)" }}>
        {replay.headline}
      </p>

      <div className="flex gap-2 mb-2.5">
        <Metric label="Cost" value={replay.deltas.costPct} unit="%" goodWhen="down" />
        <Metric label="Latency" value={replay.deltas.latencyPct} unit="%" goodWhen="down" />
        <Metric label="Success" value={replay.deltas.successPts} unit="pts" goodWhen="up" />
      </div>

      <div className="text-[11px] text-[var(--faint)] mb-1">
        {replay.flaggedCases > 0
          ? `${replay.flaggedCases} of ${replay.sampled} flagged for review`
          : `No regressions — ${replay.changedCases} of ${replay.sampled} cases changed`}
      </div>
      <div className="flex flex-col gap-1">
        {replay.cases
          .filter((cs) => cs.flagged || cs.changed)
          .slice(0, 5)
          .map((cs) => (
            <div key={cs.runId} className="flex items-start gap-2 text-[11.5px]">
              <span
                className="mt-[5px] w-1.5 h-1.5 rounded-full shrink-0"
                style={{ background: cs.flagged ? "var(--danger)" : "var(--faint)" }}
              />
              <span className="text-[var(--muted)]">
                <span className="text-[var(--text)]">{cs.topic}</span>
                {cs.tool !== "none" && <span className="text-[var(--faint)]"> · {cs.tool}</span>} — {cs.note}
              </span>
            </div>
          ))}
      </div>
    </div>
  );
}

// A compact before→after view. Handles short value swaps, additions, removals,
// and appended prompt paragraphs (the common case) without a diff library.
function Diff({ c }: { c: FieldChange }) {
  const short =
    !c.before.includes("\n") && !c.after.includes("\n") && c.before.length < 64 && c.after.length < 64;

  if (short) {
    const added = c.before === "(none)" || c.before === "(new rule)";
    const removed = c.after === "(removed)";
    return (
      <div className="diff-row">
        <span className="diff-label">{c.label}</span>
        <div className="flex items-center gap-2 flex-wrap">
          {!added && <span className={removed ? "diff-del" : "diff-old"}>{c.before}</span>}
          {!added && !removed && <span className="text-[var(--faint)]">→</span>}
          {!removed && <span className="diff-new">{c.after}</span>}
        </div>
      </div>
    );
  }

  const beforeT = c.before.trimEnd();
  const appended = c.after.startsWith(beforeT) && c.after.length > beforeT.length;
  if (appended) {
    const delta = c.after.slice(beforeT.length).trim();
    return (
      <div className="diff-row">
        <span className="diff-label">{c.label}</span>
        <div className="diff-block diff-ctx">{c.before}</div>
        <div className="diff-block diff-added mt-1.5">
          <span className="diff-plus">＋ added</span>
          {delta}
        </div>
      </div>
    );
  }

  return (
    <div className="diff-row">
      <span className="diff-label">{c.label}</span>
      <div className="diff-block diff-removed">{c.before}</div>
      <div className="diff-block diff-added mt-1.5">{c.after}</div>
    </div>
  );
}

export default function EditPanel({
  blueprint,
  onApplied,
}: {
  blueprint: Blueprint;
  onApplied: (bp: Blueprint) => void;
}) {
  const agentId = blueprint.agentId;
  const [config, setConfig] = useState<AgentConfig | null>(null);
  const [text, setText] = useState("");
  const [result, setResult] = useState<EditProposal | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applyState, setApplyState] = useState<"idle" | "applying" | "applied">("idle");
  const [appliedVersion, setAppliedVersion] = useState<string | null>(null);
  const [reviewSent, setReviewSent] = useState(false);
  const [replay, setReplay] = useState<ReplayResult | null>(null);
  const [replayLoading, setReplayLoading] = useState(false);

  // Fetch the editable config for this agent. All other panel state resets on
  // its own because the parent remounts EditPanel (key={agentId}) when the
  // selected agent changes.
  useEffect(() => {
    let alive = true;
    fetch(`/api/config?agentId=${agentId}`)
      .then((r) => r.json())
      .then((d: AgentConfig) => alive && setConfig(d))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [agentId]);

  const analyze = async (override?: string) => {
    const instruction = (override ?? text).trim();
    if (!instruction) return;
    if (override) setText(override);
    setLoading(true);
    setError(null);
    setResult(null);
    setApplyState("idle");
    setAppliedVersion(null);
    setReviewSent(false);
    setReplay(null);
    try {
      const res = await fetch("/api/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, instruction }),
      });
      const data = await res.json();
      if (!res.ok) setError(data?.error ?? "Analysis failed.");
      else setResult(data as EditProposal);
    } catch {
      setError("Network error — could not reach the engine.");
    } finally {
      setLoading(false);
    }
  };

  const runReplay = async () => {
    if (!result) return;
    setReplayLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/edit/replay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, instruction: result.instruction }),
      });
      const data = await res.json();
      if (!res.ok) setError(data?.error ?? "Replay failed.");
      else setReplay(data.replay as ReplayResult);
    } catch {
      setError("Network error — could not run the replay.");
    } finally {
      setReplayLoading(false);
    }
  };

  const apply = async () => {
    if (!result) return;
    setApplyState("applying");
    setError(null);
    try {
      const res = await fetch("/api/edit/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, instruction: result.instruction }),
      });
      const data = await res.json();
      // Apply runs the replay server-side; surface it whether it passed or (on a
      // failing verdict) blocked the change.
      if (data.replay) setReplay(data.replay as ReplayResult);
      if (!res.ok) {
        setError(data?.error ?? "Apply failed.");
        setApplyState("idle");
        return;
      }
      setApplyState("applied");
      setAppliedVersion(data.version as string);
      if (data.config) setConfig(data.config as AgentConfig);
      if (data.blueprint) onApplied(data.blueprint as Blueprint);
    } catch {
      setError("Network error — could not apply the change.");
      setApplyState("idle");
    }
  };

  const replayFailed = replay?.verdict === "fail";

  const engineLabel = result
    ? result.engine === "llm"
      ? "AI engine"
      : "rule-based engine"
    : "live";

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="card-title">Describe a change</div>
          <div className="card-sub mt-0.5">
            The engine maps it to a risk zone before touching anything.
          </div>
        </div>
        <span className="chip">
          <span
            className="chip-dot"
            style={{ background: result?.engine === "llm" ? "var(--accent)" : "var(--success)" }}
          />
          {engineLabel}
        </span>
      </div>

      {config && (
        <div className="text-[11px] text-[var(--faint)] mb-2.5">
          Editing <span className="text-[var(--muted)]">{config.version}</span> ·{" "}
          <span className="text-[var(--muted)]">{config.model}</span> · temp {config.temperature} ·{" "}
          {config.tools.length} tools · {config.guardrails.length} guardrails
        </div>
      )}

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="e.g. Make the support replies shorter and add a friendlier sign-off…"
        className="w-full h-[84px] resize-none rounded-xl border border-[var(--border)] bg-[var(--panel)] p-3 text-[13px] text-[var(--text)] placeholder:text-[var(--faint)] outline-none focus:border-[var(--accent)]/60"
      />

      <div className="flex flex-wrap gap-1.5 mt-2.5">
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            onClick={() => analyze(ex)}
            className="text-[11px] text-[var(--muted)] border border-[var(--border)] rounded-full px-2.5 py-1 hover:border-[var(--border-strong)] hover:text-[var(--text)] transition-colors"
          >
            {ex}
          </button>
        ))}
      </div>

      <button
        onClick={() => analyze()}
        disabled={!text.trim() || loading}
        className="btn btn-primary w-full mt-3"
      >
        {loading ? "Analyzing…" : "Analyze impact"}
      </button>

      {error && (
        <div className="mt-3 text-[12.5px] text-[var(--danger)] bg-[rgba(255,92,122,0.08)] border border-[rgba(255,92,122,0.25)] rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {result && (
        <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--panel-3)]/40 p-3.5">
          <div className="flex items-center gap-2 mb-2.5">
            <span className={`chip ${chipClass(result.zone)}`}>
              <span className="chip-dot" style={{ background: riskColor(result.zone) }} />
              {zoneLabel(result.zone)} zone
            </span>
            <span className="text-[13px] font-semibold">{result.headline}</span>
          </div>

          {/* blast radius meter */}
          <div className="flex items-center gap-2 mb-2.5">
            <span className="text-[11px] text-[var(--muted)] w-16">Blast radius</span>
            <div className="flex-1 h-2 rounded-full bg-[var(--panel)] overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${Math.round(result.risk * 100)}%`, background: riskColor(result.zone) }}
              />
            </div>
            <span className="text-[11px] text-[var(--muted)] tabular-nums w-8 text-right">
              {Math.round(result.risk * 100)}
            </span>
          </div>

          <p className="text-[12.5px] text-[var(--muted)] leading-snug">{result.rationale}</p>

          {/* proposed diff */}
          <div className="mt-3">
            <div className="text-[11px] text-[var(--faint)] mb-1.5">Proposed change</div>
            <div className="flex flex-col gap-2">
              {result.changes.map((c, i) => (
                <Diff key={i} c={c} />
              ))}
            </div>
          </div>

          {/* affected components */}
          {result.touchedNodeLabels.length > 0 && (
            <div className="mt-3">
              <div className="text-[11px] text-[var(--faint)] mb-1">Components affected</div>
              <div className="flex flex-wrap gap-1.5">
                {result.touchedNodeLabels.map((tch) => (
                  <span
                    key={tch}
                    className="text-[11px] text-[var(--muted)] border border-[var(--border)] rounded-md px-2 py-0.5"
                  >
                    {tch}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* verification plan */}
          <div className="mt-3">
            <div className="flex items-center justify-between mb-1.5">
              <div className="text-[11px] text-[var(--faint)]">
                Verification budget · {zoneLabel(result.zone)}
              </div>
              <button
                onClick={runReplay}
                disabled={replayLoading}
                className="text-[11px] font-semibold text-[var(--accent)] border border-[var(--border)] rounded-md px-2 py-1 hover:border-[var(--border-strong)] disabled:opacity-50 transition-colors"
              >
                {replayLoading
                  ? "Replaying…"
                  : replay
                  ? "Re-run"
                  : result.zone === "tuning"
                  ? "Run spot-check"
                  : "Run regression replay"}
              </button>
            </div>
            <div className="flex flex-col gap-1.5">
              {result.verification.map((v) => (
                <div key={v.label} className="flex items-start gap-2">
                  <span
                    className="mt-[5px] w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ background: riskColor(result.zone) }}
                  />
                  <span className="text-[12px] leading-snug">
                    <span className="text-[var(--text)] font-medium">{v.label}</span>
                    <span className="text-[var(--muted)]"> — {v.detail}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* replay result — the empirical safety net */}
          {replay && <ReplayView replay={replay} />}

          {/* safer alternative for core-gated changes */}
          {result.gate === "blocked" && result.saferAlternative && (
            <div className="mt-3 rounded-lg border border-[rgba(245,181,68,0.3)] bg-[rgba(245,181,68,0.07)] p-2.5">
              <div className="text-[11px] text-[var(--near)] font-semibold mb-1">Safer alternative</div>
              <p className="text-[12px] text-[var(--muted)] leading-snug">{result.saferAlternative}</p>
            </div>
          )}

          {/* applied confirmation */}
          {applyState === "applied" && appliedVersion && (
            <div className="mt-3 rounded-lg border border-[rgba(62,207,142,0.3)] bg-[rgba(62,207,142,0.08)] px-3 py-2 text-[12px] text-[var(--tuning)]">
              ✓ Applied — shipped as <span className="font-semibold">{appliedVersion}</span>. It&apos;s
              in Version history and reversible with one click.
            </div>
          )}
          {reviewSent && (
            <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--panel)]/60 px-3 py-2 text-[12px] text-[var(--muted)]">
              → Sent to review. A human approver will see the diff, regression result and canary plan.
            </div>
          )}

          {/* actions */}
          {applyState !== "applied" && (
            <div className="flex gap-2 mt-3.5">
              {result.gate === "blocked" ? (
                <>
                  <button
                    className="btn flex-1"
                    onClick={() => result.saferAlternative && analyze(result.saferAlternative)}
                    disabled={!result.saferAlternative}
                  >
                    Use safer rewrite
                  </button>
                  <button className="btn" onClick={() => setReviewSent(true)} disabled={reviewSent}>
                    Send to review
                  </button>
                </>
              ) : (
                <>
                  <button
                    className="btn btn-primary flex-1"
                    onClick={apply}
                    disabled={applyState === "applying" || replayFailed}
                  >
                    {applyState === "applying"
                      ? "Applying…"
                      : replayFailed
                      ? "Blocked by replay"
                      : result.gate === "check"
                      ? "Run check & apply"
                      : "Apply change"}
                  </button>
                  <button className="btn" onClick={() => setReviewSent(true)} disabled={reviewSent}>
                    Send to review
                  </button>
                </>
              )}
            </div>
          )}

          <p className="text-[10.5px] text-[var(--faint)] mt-2.5 text-center">
            {result.engine === "llm"
              ? "Diff proposed by the model · zoning & gate computed from the graph."
              : "Heuristic engine · set ANTHROPIC_API_KEY to have a model propose the diff. Zoning & gate are always graph-computed."}
          </p>
        </div>
      )}
    </div>
  );
}
