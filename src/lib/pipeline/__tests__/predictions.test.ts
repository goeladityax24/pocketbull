import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Prediction } from "../prediction";

const DIR = join(process.cwd(), "data", "predictions");
const files = readdirSync(DIR).filter((f) => f.endsWith(".json"));

describe("saved predictions", () => {
  it("has at least one file", () => expect(files.length).toBeGreaterThan(0));

  for (const f of files) {
    it(`${f} is valid, ordered and names its own company`, () => {
      const p = Prediction.parse(JSON.parse(readFileSync(join(DIR, f), "utf8")));
      expect(`${p.symbol}.json`).toBe(f);
      // A base-case margin outside 0-100% means a typo in the ₹ Cr figures
      const margin = (p.operating_profit.base / p.revenue.base) * 100;
      expect(margin).toBeGreaterThan(0);
      expect(margin).toBeLessThan(100);
      expect(p.net_profit.base).toBeLessThanOrEqual(p.operating_profit.base * 1.2);
    });
  }
});
