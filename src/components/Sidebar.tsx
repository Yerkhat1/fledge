"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function ChartIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18" />
      <rect x="7" y="12" width="3" height="6" />
      <rect x="12" y="8" width="3" height="10" />
      <rect x="17" y="4" width="3" height="14" />
    </svg>
  );
}
function WandIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 4V2M15 10V8M11 6H9M21 6h-2M18 3l-1.5 1.5M18 9l-1.5-1.5" />
      <path d="M3 21l9-9M14.5 7.5L17 10" />
    </svg>
  );
}
function ShieldIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

const nav = [
  { href: "/statistics", label: "Statistics", icon: ChartIcon },
  { href: "/studio", label: "AI Studio", icon: WandIcon },
];

export default function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="w-[236px] shrink-0 border-r border-[var(--border)] flex flex-col bg-[var(--panel)]/40 backdrop-blur-sm">
      <div className="h-[61px] flex items-center gap-2.5 px-5 border-b border-[var(--border)]">
        <div className="w-7 h-7 rounded-lg grid place-items-center" style={{ background: "linear-gradient(135deg,#7c8cff,#a78bfa)" }}>
          <span className="text-[13px] font-bold text-[#0a0b10]">∞</span>
        </div>
        <div className="leading-tight">
          <div className="text-[14px] font-semibold tracking-tight">eternity<span className="text-[var(--accent)]">.ai</span></div>
          <div className="text-[10px] text-[var(--faint)]">Agent Control Plane</div>
        </div>
      </div>

      <nav className="flex-1 p-3 flex flex-col gap-1">
        <div className="text-[10px] uppercase tracking-wider text-[var(--faint)] px-3 pt-2 pb-1">Workspace</div>
        {nav.map((n) => {
          const active = pathname.startsWith(n.href);
          const Icon = n.icon;
          return (
            <Link key={n.href} href={n.href} className={`nav-item ${active ? "active" : ""}`}>
              <Icon />
              {n.label}
            </Link>
          );
        })}
        <div className="text-[10px] uppercase tracking-wider text-[var(--faint)] px-3 pt-5 pb-1">Coming soon</div>
        <div className="nav-item opacity-40 cursor-default">Evals &amp; regression</div>
        <div className="nav-item opacity-40 cursor-default">Deployments</div>
        <div className="nav-item opacity-40 cursor-default">Team &amp; billing</div>
      </nav>

      <div className="p-3 m-3 rounded-xl border border-[var(--border)] bg-[var(--panel-2)]">
        <div className="flex items-center gap-2 text-[12px] font-semibold text-[var(--tuning)]">
          <ShieldIcon /> Safe-edit engine
        </div>
        <p className="text-[11px] text-[var(--muted)] mt-1.5 leading-snug">
          Every change is zone-checked before it ships. Core zones require a regression pass.
        </p>
      </div>
    </aside>
  );
}
