export const fmtUsd = (n: number) =>
  n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n.toFixed(2)}`;

export const fmtUsdFull = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const fmtNum = (n: number) => n.toLocaleString("en-US");

export const fmtCompact = (n: number) =>
  new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);

export const fmtPct = (n: number, d = 1) => `${(n * 100).toFixed(d)}%`;

export const fmtSignedPct = (n: number, d = 0) =>
  `${n >= 0 ? "+" : ""}${(n * 100).toFixed(d)}%`;

export const fmtMs = (n: number) =>
  n >= 1000 ? `${(n / 1000).toFixed(2)}s` : `${Math.round(n)}ms`;
