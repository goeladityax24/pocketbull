import { z } from "zod";

/**
 * Our own estimate of the next results: revenue, operating profit and net profit
 * in ₹ Cr, on the same basis and rows as Screener so the real numbers can be
 * checked against it once they are out. Written by a Claude session into
 * data/predictions/<SYMBOL>.json (see docs/ANALYSIS_PLAYBOOK.md, step 6).
 * An estimate is not management guidance and is never scored in the tracker.
 */
const Band = z.object({ low: z.number(), base: z.number(), high: z.number() }).refine((b) => b.low <= b.base && b.base <= b.high, {
  message: "low <= base <= high",
});

export const Prediction = z.object({
  symbol: z.string(),
  /** Date the estimate was made, ISO */
  as_of: z.string(),
  /** The results being estimated, e.g. "Q3 FY27" */
  period: z.string(),
  /** When results are likely to be out, free text */
  results_due: z.string(),
  basis: z.enum(["consolidated", "standalone"]),
  revenue: Band,
  operating_profit: Band,
  net_profit: Band,
  /** Why: each line says what was used (guidance, order book, run-rate, last year's season) */
  reasoning: z.array(z.string()).min(2),
  /** What would make it wrong */
  risks: z.array(z.string()).min(1),
  /** Rows on Screener this estimate does not match one-for-one (e.g. one-off gains) */
  caveat: z.string().nullable().optional(),
});
export type Prediction = z.infer<typeof Prediction>;
