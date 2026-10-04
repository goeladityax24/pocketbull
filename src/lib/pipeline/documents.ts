import { extractText } from "unpdf";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";

export interface PdfDoc {
  url: string;
  bytes: Uint8Array;
  pages: string[];
  /** True when the PDF has a usable text layer (not a scan) */
  hasText: boolean;
}

/** Download a PDF. NSE archives reject requests without a browser-like UA. */
export async function downloadPdf(url: string): Promise<Uint8Array> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/pdf,*/*", Referer: "https://www.nseindia.com/" },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`Download failed (${res.status}) for ${url}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (String.fromCharCode(...bytes.slice(0, 4)) !== "%PDF") {
    throw new Error(`Not a PDF: ${url}`);
  }
  return bytes;
}

export async function loadPdf(url: string, bytes?: Uint8Array): Promise<PdfDoc> {
  const data = bytes ?? (await downloadPdf(url));
  // unpdf consumes its input buffer, so hand it a copy
  const { text } = await extractText(new Uint8Array(data), { mergePages: false });
  const chars = text.reduce((n, p) => n + p.trim().length, 0);
  // A real text layer averages well over 200 characters a page; scans have ~0
  return { url, bytes: data, pages: text, hasText: chars / Math.max(1, text.length) > 200 };
}

/** Text with page markers, so the model can cite pages and we can check quotes. */
export function withPageMarkers(pages: string[]): string {
  return pages.map((t, i) => `[[page ${i + 1}]]\n${t.trim()}`).join("\n\n");
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[“”"'’‘`]/g, "")
    .replace(/[^a-z0-9%.\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export type QuoteCheck = "verified" | "partial" | "not_found" | "unverifiable";

/**
 * Check that a quote really appears in the transcript. Transcripts break lines
 * and hyphenate oddly, so compare normalised 5-word shingles, not raw strings.
 */
export function checkQuote(quote: string, doc: PdfDoc | null): QuoteCheck {
  if (!doc || !doc.hasText) return "unverifiable";
  const hay = norm(doc.pages.join(" "));
  const q = norm(quote);
  if (!q) return "not_found";
  if (hay.includes(q)) return "verified";
  const words = q.split(" ");
  if (words.length < 5) return "not_found";
  let hit = 0;
  let total = 0;
  for (let i = 0; i + 5 <= words.length; i++) {
    total++;
    if (hay.includes(words.slice(i, i + 5).join(" "))) hit++;
  }
  const ratio = hit / total;
  return ratio >= 0.8 ? "verified" : ratio >= 0.5 ? "partial" : "not_found";
}
