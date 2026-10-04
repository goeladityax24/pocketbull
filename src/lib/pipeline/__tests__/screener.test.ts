import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { normaliseSymbol, parseCompanyPage, parsePeers } from "../screener";

const fx = (f: string) => readFileSync(join(__dirname, "fixtures", f), "utf8");

describe("normaliseSymbol", () => {
  it("accepts symbols and Screener links", () => {
    expect(normaliseSymbol("nse:parth")).toEqual({ symbol: "PARTH", basis: null });
    expect(normaliseSymbol("https://www.screener.in/company/RELIANCE/consolidated/")).toEqual({
      symbol: "RELIANCE",
      basis: "consolidated",
    });
    expect(normaliseSymbol("https://www.screener.in/company/PARTH/").basis).toBe("standalone");
  });
});

describe("parseCompanyPage (Parth, half-yearly SME)", () => {
  const page = parseCompanyPage(fx("parth-standalone.html"), "PARTH", "standalone", "u");

  it("reads identity and ratios", () => {
    expect(page.name).toBe("Parth Electricals & Engineering Ltd");
    expect(page.warehouseId).toBe("141673370");
    expect(page.ratios["market cap"]).toBe(713);
    expect(page.ratios["high"]).toBe(559);
    expect(page.ratios["stock p/e"]).toBe(50.1);
  });

  it("detects half-yearly results and maps periods", () => {
    expect(page.interim.granularity).toBe("half");
    expect(page.interim.periods.map((p) => p.label)).toEqual(["H1 FY25", "H2 FY25", "H1 FY26", "H2 FY26"]);
    expect(page.interim.rows.sales).toEqual([70, 105, 80, 118]);
    expect(page.interim.rows.opm_pct).toEqual([11, 8, 12, 9]);
    expect(page.interim.rows.eps).toEqual([null, null, 4.46, 5.95]);
  });

  it("reads annual P&L", () => {
    expect(page.annual.granularity).toBe("year");
    expect(page.annual.periods.at(-1)?.label).toBe("FY26");
    expect(page.annual.rows.sales?.at(-1)).toBe(198);
    expect(page.annual.rows.operating_profit?.[0]).toBe(0);
  });

  it("reads concall documents", () => {
    expect(page.concalls).toHaveLength(3);
    expect(page.concalls[0]).toMatchObject({ month: "May 2026", yearMonth: "2026-05" });
    expect(page.concalls[0].transcriptUrl).toContain("Transcript.pdf");
    expect(page.concalls[0].pptUrl).toContain("nsearchives");
    expect(page.concalls[2].transcriptUrl).toBeNull();
  });
});

describe("parsePeers", () => {
  it("reads peer rows", () => {
    const peers = parsePeers(fx("peers.html"));
    expect(peers).toHaveLength(2);
    expect(peers[0]).toMatchObject({ name: "Apar Inds.", marketCapCr: 73896.3, roce: 31.81 });
  });
});
