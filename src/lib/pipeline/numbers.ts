/** Parse Screener cell text: "1,23,456", "18%", "-0.3%", "-0", "" -> number | null */
export function parseNumber(text: string | undefined | null): number | null {
  if (text == null) return null;
  const t = text.replace(/[₹,\s]/g, "").replace(/%$/, "").replace(/Cr\.?$/i, "");
  if (t === "" || t === "-" || t === "—") return null;
  const n = Number(t);
  return Number.isFinite(n) ? (Object.is(n, -0) ? 0 : n) : null;
}

export function round(n: number, dp = 1): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}
