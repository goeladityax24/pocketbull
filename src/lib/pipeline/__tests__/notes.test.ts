import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ResearchNote } from "../note";

const dir = join(__dirname, "../../../../data/notes");
const files = readdirSync(dir).filter((f) => f.endsWith(".json"));

describe("saved insight reports", () => {
  it.each(files)("%s matches the format", (f) => {
    const parsed = ResearchNote.safeParse(JSON.parse(readFileSync(join(dir, f), "utf8")));
    expect(parsed.success ? "ok" : parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")).toBe("ok");
  });

  it.each(files)("%s has the six sections in order, and table rows match their columns", (f) => {
    const note = ResearchNote.parse(JSON.parse(readFileSync(join(dir, f), "utf8")));
    expect(note.sections.map((s) => s.id)).toEqual(["business", "financials", "governance", "competition", "risks", "valuation"]);
    for (const s of note.sections)
      for (const b of s.blocks) {
        if (b.type === "table") for (const r of b.rows) expect(r.cells.length).toBe(b.columns.length);
        if (b.type === "bars") for (const ser of b.series) expect(ser.values.length).toBe(b.labels.length);
      }
  });
});
