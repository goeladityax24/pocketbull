import { z } from "zod";

/**
 * A source of guidance other than a filed concall transcript: notes from an
 * investor conference posted by a broker or an attendee (often images on X).
 * Saved as data/sources/<SYMBOL>/<id>.json with the transcribed text next to it.
 */
export const SourceGrade = z.enum([
  "company", // the company's own document or recording
  "broker_note", // a broker's published post-conference note
  "attendee_note", // notes by someone who attended
]);
export type SourceGrade = z.infer<typeof SourceGrade>;

export const GRADE_LABEL: Record<SourceGrade, string> = {
  company: "company document",
  broker_note: "broker note",
  attendee_note: "attendee notes",
};

export const ExternalSource = z.object({
  /** Also the run's file name: "2026-03-arihant-bharat-connect" (starts with YYYY-MM so runs sort by date) */
  id: z.string().regex(/^\d{4}-\d{2}-[a-z0-9-]+$/),
  kind: z.literal("conference"),
  event: z.string(),
  /** Event date, ISO */
  date: z.string(),
  links: z
    .array(
      z.object({
        url: z.string().url(),
        author: z.string(),
        grade: SourceGrade,
        /** Saved copies of the images or PDF pages, relative to the repo */
        images: z.array(z.string()),
        /** Which [[page N]] markers in the text file came from this link */
        pages: z.array(z.number().int()),
      }),
    )
    .min(1),
  /** Text transcribed from the images, with [[page N]] markers (one per image), relative to the repo */
  text_file: z.string(),
});
export type ExternalSource = z.infer<typeof ExternalSource>;

/** "Arihant Bharat Connect, Mar 2026 · broker note" */
export function sourceLabel(s: ExternalSource): string {
  const grades = [...new Set(s.links.map((l) => GRADE_LABEL[l.grade]))];
  return `${s.event} · ${grades.join(" + ")}`;
}
