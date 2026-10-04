import type { Period } from "./periods";

export type Basis = "consolidated" | "standalone";

/** Rows we read from Screener's results tables, keyed by our own names. */
export type MetricKey =
  | "sales"
  | "expenses"
  | "operating_profit"
  | "opm_pct"
  | "other_income"
  | "interest"
  | "depreciation"
  | "pbt"
  | "tax_pct"
  | "net_profit"
  | "eps";

export interface ResultsTable {
  /** quarter for most companies; half for SME companies that report half-yearly */
  granularity: "quarter" | "half" | "year";
  periods: Period[];
  rows: Partial<Record<MetricKey, (number | null)[]>>;
}

export interface Concall {
  /** "May 2026" as Screener shows it */
  month: string;
  /** "2026-05" */
  yearMonth: string;
  transcriptUrl: string | null;
  pptUrl: string | null;
  recordingUrl: string | null;
}

export interface Peer {
  name: string;
  screenerPath: string;
  marketCapCr: number | null;
  pe: number | null;
  salesQtrCr: number | null;
  salesGrowthQtrPct: number | null;
  roce: number | null;
}

export interface CompanySnapshot {
  symbol: string;
  name: string;
  screenerUrl: string;
  basis: Basis;
  companyId: string | null;
  warehouseId: string | null;
  ratios: Record<string, number | null>;
  /** Quarterly, or half-yearly for SME companies */
  interim: ResultsTable;
  annual: ResultsTable;
  concalls: Concall[];
  peers: Peer[];
  fetchedAt: string;
}
