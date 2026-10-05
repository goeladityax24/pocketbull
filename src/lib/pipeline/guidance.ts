import { z } from "zod";

/**
 * One forward-looking statement by management, as extracted from a concall.
 * Shared by the LLM tool schema, the database and the scoring engine.
 */
export const GuidanceMetric = z.enum([
  "revenue",
  "ebitda",
  "ebitda_margin",
  "pat",
  "pat_margin",
  "eps",
  "capex",
  "net_debt",
  "order_book",
  "other",
]);
export type GuidanceMetric = z.infer<typeof GuidanceMetric>;

export const GuidanceKind = z.enum([
  "growth_yoy", // "18-20% growth"
  "absolute", // "₹300 Cr revenue", "capex of ₹400 Cr"
  "margin_pct", // "EBITDA margin of 17-18%"
  "date", // "plant live by Q3"
  "qualitative", // "demand remains healthy"
]);
export type GuidanceKind = z.infer<typeof GuidanceKind>;

export const GuidanceItem = z.object({
  metric: GuidanceMetric,
  metric_label: z.string().describe("The metric in management's words, e.g. 'top-line growth'"),
  kind: GuidanceKind,
  low: z.number().nullable().describe("Lower bound. Percent as 18 for 18%. Rupees in crore."),
  high: z.number().nullable().describe("Upper bound; equal to low for a single number"),
  unit: z.enum(["pct", "inr_cr", "other"]).nullable(),
  approx: z.boolean().describe("True for 'around', 'about', 'high teens' and similar"),
  period: z
    .string()
    .nullable()
    .describe("Target period label: 'FY27', 'Q2 FY27', 'H1 FY27'. Null if multi-year or unclear."),
  horizon_text: z.string().nullable().describe("Original timing words, e.g. 'next 2-3 years'"),
  basis: z.enum(["consolidated", "standalone", "segment", "unspecified"]),
  segment: z.string().nullable(),
  condition: z.string().nullable().describe("Any stated condition, e.g. 'barring raw material volatility'"),
  quote: z.string().describe("Verbatim sentence(s) from the transcript, copied exactly"),
  page: z.number().int().nullable(),
  speaker: z.string().nullable(),
  confidence: z.enum(["high", "medium", "low"]),
  keyword: z.string().describe("Two to four words to find this again, e.g. 'export share'"),
  revises: z.string().nullable().describe("If this changes earlier guidance, what it was"),
  source_ref: z
    .string()
    .nullable()
    .optional()
    .describe("For conference notes: which note(s) carry this, e.g. 'Arihant note' or 'both notes'"),
});
export type GuidanceItem = z.infer<typeof GuidanceItem>;

export const InsightReport = z.object({
  summary: z.string().describe("Three sentences: the most important things from this call"),
  what_changed: z
    .array(z.object({ change: z.enum(["raised", "cut", "new", "delayed", "withdrawn", "reiterated"]), text: z.string(), page: z.number().int().nullable() }))
    .describe("Changes versus earlier guidance or plans"),
  tone: z.object({
    label: z.enum(["confident", "steady", "cautious", "defensive"]),
    quote: z.string(),
    page: z.number().int().nullable(),
  }),
  analyst_questions: z
    .array(z.object({ topic: z.string(), answer: z.string(), page: z.number().int().nullable() }))
    .describe("What analysts pushed on, and how management answered"),
  red_flags: z
    .array(z.object({ text: z.string(), page: z.number().int().nullable() }))
    .describe("Concerns visible in the call or presentation"),
  watch_next: z.array(z.string()).describe("Things to check in the next results"),
  business_snapshot: z.object({
    what_they_make: z.string(),
    customers: z.string(),
    revenue_mix: z.string(),
    demand_drivers: z.string(),
  }),
});
export type InsightReport = z.infer<typeof InsightReport>;

export const ExtractionResult = z.object({
  call_period: z.string().describe("Results period discussed, e.g. 'Q1 FY27' or 'H2 FY26'"),
  call_date: z.string().nullable(),
  guidance: z.array(GuidanceItem),
  insights: InsightReport,
});
export type ExtractionResult = z.infer<typeof ExtractionResult>;
