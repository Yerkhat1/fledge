"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { NameValue, TimePoint } from "@/lib/types";
import { fmtCompact, fmtMs, fmtUsdFull } from "@/lib/format";

const C = {
  c1: "#7c8cff",
  c2: "#34d3c0",
  c3: "#f5b544",
  c4: "#ff7aa8",
  c5: "#57b6fb",
};
const PIE = [C.c1, C.c2, C.c3, C.c5, C.c4];
const AXIS = "#697089";
const GRID = "#1f2430";

const dayTick = (d: string) => d.slice(5);

type TTProps = {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; color?: string; stroke?: string; fill?: string }>;
  label?: string;
  fmt?: (n: number) => string;
};

function TT({ active, payload, label, fmt }: TTProps) {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: "#12141c",
        border: "1px solid rgba(255,255,255,0.15)",
        borderRadius: 10,
        padding: "9px 11px",
        boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
      }}
    >
      {label && (
        <div style={{ fontSize: 11, color: "#9096ab", marginBottom: 6 }}>{label}</div>
      )}
      {payload.map((p, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, padding: "1px 0" }}>
          <span style={{ width: 8, height: 8, borderRadius: 8, background: p.color || p.stroke || p.fill }} />
          <span style={{ color: "#c8ccd8", textTransform: "capitalize" }}>{p.name}</span>
          <b style={{ marginLeft: 6, color: "#e8eaf2" }}>{fmt ? fmt(p.value ?? 0) : p.value}</b>
        </div>
      ))}
    </div>
  );
}

const axisProps = {
  tick: { fill: AXIS, fontSize: 11 },
  tickLine: false,
  axisLine: false,
} as const;

export function CostArea({ data }: { data: TimePoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={230}>
      <AreaChart data={data} margin={{ left: -14, right: 10, top: 8, bottom: 0 }}>
        <defs>
          <linearGradient id="gCost" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={C.c1} stopOpacity={0.35} />
            <stop offset="100%" stopColor={C.c1} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="day" tickFormatter={dayTick} minTickGap={26} {...axisProps} />
        <YAxis tickFormatter={(v) => `$${v}`} width={46} {...axisProps} />
        <Tooltip content={<TT fmt={fmtUsdFull} />} cursor={{ stroke: "#333a4f" }} />
        <Area type="monotone" dataKey="cost" name="cost" stroke={C.c1} strokeWidth={2.2} fill="url(#gCost)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function TokensArea({ data }: { data: TimePoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={230}>
      <AreaChart data={data} margin={{ left: -6, right: 10, top: 8, bottom: 0 }}>
        <defs>
          <linearGradient id="gIn" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={C.c5} stopOpacity={0.4} />
            <stop offset="100%" stopColor={C.c5} stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gOut" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={C.c2} stopOpacity={0.4} />
            <stop offset="100%" stopColor={C.c2} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="day" tickFormatter={dayTick} minTickGap={26} {...axisProps} />
        <YAxis tickFormatter={fmtCompact} width={44} {...axisProps} />
        <Tooltip content={<TT fmt={fmtCompact} />} cursor={{ stroke: "#333a4f" }} />
        <Area type="monotone" dataKey="tokensIn" name="tokens in" stackId="t" stroke={C.c5} strokeWidth={2} fill="url(#gIn)" />
        <Area type="monotone" dataKey="tokensOut" name="tokens out" stackId="t" stroke={C.c2} strokeWidth={2} fill="url(#gOut)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function LatencyLines({ data }: { data: TimePoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={230}>
      <LineChart data={data} margin={{ left: -6, right: 10, top: 8, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="day" tickFormatter={dayTick} minTickGap={26} {...axisProps} />
        <YAxis tickFormatter={(v) => `${Math.round(v / 100) / 10}s`} width={44} {...axisProps} />
        <Tooltip content={<TT fmt={fmtMs} />} cursor={{ stroke: "#333a4f" }} />
        <Line type="monotone" dataKey="p50" name="p50" stroke={C.c2} strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="p95" name="p95" stroke={C.c3} strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function ModelDonut({ data }: { data: NameValue[] }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="flex items-center gap-4">
      <div style={{ width: 150, height: 150 }} className="shrink-0 relative">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={48} outerRadius={70} paddingAngle={2} strokeWidth={0}>
              {data.map((_, i) => (
                <Cell key={i} fill={PIE[i % PIE.length]} />
              ))}
            </Pie>
            <Tooltip content={<TT fmt={fmtUsdFull} />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 grid place-items-center pointer-events-none">
          <div className="text-center">
            <div className="text-[10px] text-[var(--muted)]">total</div>
            <div className="text-[15px] font-semibold">{fmtUsdFull(total)}</div>
          </div>
        </div>
      </div>
      <div className="flex-1 min-w-0 flex flex-col gap-2">
        {data.map((d, i) => (
          <div key={d.name} className="flex items-center gap-2 text-[12.5px]">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: PIE[i % PIE.length] }} />
            <span className="text-[var(--muted)] truncate flex-1">{d.name}</span>
            <b className="text-[var(--text)]">{fmtUsdFull(d.value)}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

export function HBar({ data, unit }: { data: NameValue[]; unit?: "usd" }) {
  const fmt = unit === "usd" ? fmtUsdFull : (n: number) => String(n);
  return (
    <ResponsiveContainer width="100%" height={Math.max(140, data.length * 38)}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16, top: 0, bottom: 0 }}>
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="name" width={104} tick={{ fill: "#c8ccd8", fontSize: 11.5 }} tickLine={false} axisLine={false} />
        <Tooltip content={<TT fmt={fmt} />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
        <Bar dataKey="value" name={unit === "usd" ? "cost" : "runs"} radius={[0, 6, 6, 0]} barSize={16}>
          {data.map((_, i) => (
            <Cell key={i} fill={PIE[i % PIE.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
