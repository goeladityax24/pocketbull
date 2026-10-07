import { describe, expect, it } from "vitest";
import { findCompany, nameTokens, parseIndex, sameCompany, type Compendium } from "../conferences";

describe("conference compendia", () => {
  it("matches company names across spellings", () => {
    expect(nameTokens("L. T. Elevator Ltd")).toEqual(["lt", "elevator"]);
    expect(sameCompany("Shree Refrigerations Ltd", "Shree Refrigerations Limited")).toBe(true);
    expect(sameCompany("HFCL Ltd", "HFCL Limited")).toBe(true);
    expect(sameCompany("Transformers & Rectifiers India Ltd", "Transformers and Rectifiers (India) Limited")).toBe(true);
    expect(sameCompany("Sky Gold & Diamonds Ltd", "Shanti Gold International Ltd")).toBe(false);
    expect(sameCompany("Adani Power Ltd", "Adani Green Energy Ltd")).toBe(false);
  });

  it("turns the index into page ranges", () => {
    const pages = ["cover", "Index of Participating Companies\n1 Accord Transformer & Switchgear Ltd 18\n2 HFCL Ltd 21\n", "Index of Participating Companies\n3 Zed Ltd 30\n"];
    expect(parseIndex(pages, 31)).toEqual([
      { name: "Accord Transformer & Switchgear Ltd", pages: [18, 20] },
      { name: "HFCL Ltd", pages: [21, 29] },
      { name: "Zed Ltd", pages: [30, 31] },
    ]);
  });

  it("finds a presenter's section and mentions elsewhere", () => {
    const c = { companies: [{ name: "HFCL Ltd", pages: [2, 3] }] } as unknown as Compendium;
    const text = "[[page 1]]Index of Participating Companies HFCL\n[[page 2]]HFCL Ltd\n[[page 3]]more\n[[page 4]]supplies HFCL and Sky Gold";
    expect(findCompany(c, text, { name: "HFCL Ltd" })).toMatchObject({ section: { pages: [2, 3] }, mentions: [4] });
    expect(findCompany(c, text, { name: "Sky Gold & Diamonds Ltd" })).toMatchObject({ section: null, mentions: [4] });
  });
});
