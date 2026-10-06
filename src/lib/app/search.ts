/** Lower-case, letters and digits only, so "lt elev" finds "L.T. Elevator" and "krn heat" finds "KRN Heat Exchanger". */
const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Partial match on symbol or name: every word typed must appear somewhere in either. */
export function matchesCompany(company: { symbol: string; name: string }, query: string): boolean {
  const words = query.split(/\s+/).map(squash).filter(Boolean);
  const hay = `${squash(company.symbol)}|${squash(company.name)}`;
  return words.every((w) => hay.includes(w));
}
