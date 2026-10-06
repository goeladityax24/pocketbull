import { describe, expect, it } from "vitest";
import { matchesCompany } from "../search";

const sky = { symbol: "SKYGOLD", name: "Sky Gold & Diamonds Ltd" };
const lt = { symbol: "LTELEVATOR", name: "L.T. Elevator Ltd" };

describe("matchesCompany", () => {
  it("matches everything on an empty query", () => {
    expect(matchesCompany(sky, "  ")).toBe(true);
  });
  it("matches part of the symbol or the name, any case", () => {
    expect(matchesCompany(sky, "skyg")).toBe(true);
    expect(matchesCompany(sky, "diam")).toBe(true);
    expect(matchesCompany(sky, "Gold Dia")).toBe(true);
  });
  it("ignores punctuation and spacing", () => {
    expect(matchesCompany(lt, "lt elev")).toBe(true);
    expect(matchesCompany(lt, "l.t.")).toBe(true);
    expect(matchesCompany(sky, "skygold")).toBe(true);
  });
  it("needs every word to match", () => {
    expect(matchesCompany(sky, "sky silver")).toBe(false);
    expect(matchesCompany(sky, "krn")).toBe(false);
  });
});
