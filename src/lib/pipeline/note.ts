import { z } from "zod";

/**
 * A research note: the six-section analyst report (business, financials,
 * walking the talk, peers, risks, valuation). Written by a Claude session from
 * Screener, concall transcripts and the annual report, saved to
 * data/notes/<SYMBOL>.json and rendered by the "Research note" tab.
 */

/** "p.5", "Aug call p.8", "AR p.22" */
const Src = z.string().nullable().optional();

const Tone = z.enum(["kept", "ahead", "partial", "pending", "missed", "neutral"]);
export type NoteTone = z.infer<typeof Tone>;

const Cell = z.union([z.string(), z.object({ text: z.string(), tag: Tone })]);
export type NoteCell = z.infer<typeof Cell>;

export const NoteBlock = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: z.string(), src: Src }),
  z.object({
    type: z.literal("bullets"),
    title: z.string().nullable().optional(),
    items: z.array(z.object({ lead: z.string().nullable().optional(), text: z.string(), src: Src })),
  }),
  z.object({ type: z.literal("tiles"), items: z.array(z.object({ value: z.string(), label: z.string() })) }),
  z.object({
    type: z.literal("table"),
    title: z.string().nullable().optional(),
    columns: z.array(z.object({ label: z.string(), numeric: z.boolean().optional() })),
    rows: z.array(z.object({ cells: z.array(Cell), highlight: z.boolean().optional() })),
    note: z.string().nullable().optional(),
  }),
  z.object({
    type: z.literal("bars"),
    title: z.string(),
    caption: z.string().nullable().optional(),
    /** One or two series; values may be negative (cash flow) */
    series: z.array(z.object({ name: z.string(), values: z.array(z.number().nullable()) })).min(1).max(2),
    labels: z.array(z.string()),
  }),
  z.object({
    type: z.literal("scenarios"),
    items: z.array(z.object({ name: z.enum(["Bull", "Base", "Bear"]), value: z.string(), sub: z.string(), text: z.string() })),
  }),
]);
export type NoteBlock = z.infer<typeof NoteBlock>;

export const NoteSectionId = z.enum(["business", "financials", "governance", "competition", "risks", "valuation"]);

export const ResearchNote = z.object({
  /** Date the note was written, ISO */
  as_of: z.string(),
  /** "B2B gold jewellery manufacturer" */
  descriptor: z.string(),
  /** Two or three sentences: the thesis */
  lede: z.string(),
  /** Price strip, as of as_of */
  market: z.object({
    price: z.number().nullable(),
    mcap_cr: z.number().nullable(),
    pe: z.number().nullable(),
    pb: z.number().nullable(),
    ev_ebitda: z.number().nullable(),
  }),
  /** "What's going right / what to be sceptical about / price" */
  short_version: z.array(z.object({ lead: z.string(), text: z.string() })).min(2).max(4),
  sections: z
    .array(z.object({ id: NoteSectionId, title: z.string(), blocks: z.array(NoteBlock) }))
    .length(6),
  watch: z.array(z.string()),
  sources: z.array(z.string()),
});
export type ResearchNote = z.infer<typeof ResearchNote>;
