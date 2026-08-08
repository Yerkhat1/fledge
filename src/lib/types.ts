export type Zone = "core" | "near-core" | "tuning";
export type AgentStatus = "healthy" | "degraded" | "draft";

export interface Agent {
  id: string;
  name: string;
  framework: string;
  model: string;
  status: AgentStatus;
  version: string;
  understandingConfidence: number; // 0..1 — how confident the AI's architecture map is
  synthetic?: boolean; // true for uploaded agents whose run history is generated, not real
}

export interface Run {
  id: string;
  agentId: string;
  ts: string; // ISO timestamp
  day: string; // YYYY-MM-DD
  model: string;
  version: string;
  tokensIn: number;
  tokensOut: number;
  cachedTokens: number;
  cost: number;
  latencyMs: number;
  success: boolean;
  turns: number;
  topic: string;
  tool: string;
  synthetic?: boolean; // true when this run was generated for an uploaded agent
}

export interface Kpi {
  totalCost: number;
  totalTokens: number;
  totalRuns: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  successRate: number; // 0..1
  cacheHitRate: number; // 0..1
  costPerSuccess: number;
  deltas: { cost: number; runs: number; successRate: number; latency: number };
}

export interface TimePoint {
  day: string;
  cost: number;
  tokensIn: number;
  tokensOut: number;
  runs: number;
  p50: number;
  p95: number;
}

export interface NameValue {
  name: string;
  value: number;
}

export interface VersionStat {
  version: string;
  runs: number;
  cost: number;
  successRate: number;
  avgLatencyMs: number;
  costPerSuccess: number;
}

export interface DriftAlert {
  id: string;
  severity: "info" | "warn" | "danger";
  metric: string;
  change: string;
  detail: string;
}

export interface StatsResponse {
  agentId: string;
  range: { from: string; to: string; days: number };
  kpi: Kpi;
  timeseries: TimePoint[];
  costByModel: NameValue[];
  costByTool: NameValue[];
  topics: NameValue[];
  versions: VersionStat[];
  drift: DriftAlert[];
}

export interface BlueprintNode {
  id: string;
  label: string;
  zone: Zone;
  x: number;
  y: number;
  kind: "io" | "logic" | "tool" | "guard" | "config";
}
export interface BlueprintEdge {
  from: string;
  to: string;
}
export interface AgentVersionInfo {
  version: string;
  date: string;
  note: string;
  active: boolean;
}
export interface Blueprint {
  agentId: string;
  confidence: number;
  summary: string;
  nodes: BlueprintNode[];
  edges: BlueprintEdge[];
  versions: AgentVersionInfo[];
}
