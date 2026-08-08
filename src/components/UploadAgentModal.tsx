"use client";

import { useRef, useState } from "react";
import { Agent } from "@/lib/types";

const TEMPLATE = `{
  "name": "My Support Agent",
  "framework": "Claude Agent SDK",
  "model": "claude-sonnet-5",
  "system": "You are a helpful support agent.",
  "tools": ["search", "database", "email"]
}`;

export default function UploadAgentModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (agent: Agent) => void;
}) {
  const [text, setText] = useState(TEMPLATE);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      setText(String(reader.result ?? ""));
      setError(null);
    };
    reader.onerror = () => setError("Could not read that file.");
    reader.readAsText(file);
  };

  const submit = async () => {
    setError(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      setError("That isn't valid JSON.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Upload failed.");
        return;
      }
      onCreated(data.agent as Agent);
    } catch {
      setError("Network error — could not reach the server.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm p-4"
      onMouseDown={onClose}
    >
      <div
        className="card w-full max-w-[540px] !p-0 overflow-hidden shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-5 pt-5 pb-3 border-b border-[var(--border)]">
          <div>
            <div className="text-[15px] font-semibold tracking-tight">Upload agent</div>
            <p className="text-[12px] text-[var(--muted)] mt-0.5 max-w-[400px] leading-snug">
              Paste an agent spec or load a <code className="text-[var(--text)]">.json</code> file. The
              architecture is mapped and a synthetic run history is attached for preview.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--muted)] hover:text-[var(--text)] text-[18px] leading-none px-1"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-3">
          <textarea
            value={text}
            spellCheck={false}
            onChange={(e) => {
              setText(e.target.value);
              setError(null);
            }}
            className="w-full h-[248px] resize-none rounded-xl border border-[var(--border)] bg-[var(--panel)] p-3 text-[12.5px] font-mono text-[var(--text)] outline-none focus:border-[var(--accent)]/60 leading-relaxed"
          />

          <div className="flex items-center justify-between gap-3">
            <button
              onClick={() => fileRef.current?.click()}
              className="text-[12px] text-[var(--muted)] border border-[var(--border)] rounded-lg px-3 py-1.5 hover:border-[var(--border-strong)] hover:text-[var(--text)] transition-colors"
            >
              Load .json file
            </button>
            <span className="text-[11px] text-[var(--faint)]">
              Required: <code className="text-[var(--muted)]">name</code> · optional: framework, model,
              system, tools[]
            </span>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) loadFile(f);
                e.target.value = "";
              }}
            />
          </div>

          {error && (
            <div className="text-[12.5px] text-[var(--danger)] bg-[rgba(255,92,122,0.08)] border border-[rgba(255,92,122,0.25)] rounded-lg px-3 py-2">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[var(--border)] bg-[var(--panel)]/40">
          <button className="btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={busy}>
            {busy ? "Creating…" : "Create agent"}
          </button>
        </div>
      </div>
    </div>
  );
}
