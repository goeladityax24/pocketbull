import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ExternalSource, sourceLabel } from "../source";

const root = join(__dirname, "../../../..");
const dir = join(root, "data/sources");
const files = readdirSync(dir).flatMap((sym) =>
  readdirSync(join(dir, sym))
    .filter((f) => f.endsWith(".json"))
    .map((f) => `${sym}/${f}`),
);

describe("saved conference sources", () => {
  it.each(files)("%s matches the format, and its files and pages exist", (f) => {
    const s = ExternalSource.parse(JSON.parse(readFileSync(join(dir, f), "utf8")));
    expect(f.endsWith(`/${s.id}.json`)).toBe(true);
    const text = readFileSync(join(root, s.text_file), "utf8");
    for (const l of s.links) {
      for (const img of l.images) expect(existsSync(join(root, img))).toBe(true);
      for (const p of l.pages) expect(text).toContain(`[[page ${p}]]`);
    }
  });
});

describe("sourceLabel", () => {
  it("names the event and the grades once each", () => {
    const link = { url: "https://x.com/a/status/1", author: "a", images: [], pages: [1] };
    const s = ExternalSource.parse({
      id: "2026-03-test",
      kind: "conference",
      event: "Test Connect, Mar 2026",
      date: "2026-03-06",
      links: [
        { ...link, grade: "broker_note" },
        { ...link, grade: "attendee_note" },
        { ...link, grade: "attendee_note" },
      ],
      text_file: "x.txt",
    });
    expect(sourceLabel(s)).toBe("Test Connect, Mar 2026 · broker note + attendee notes");
  });
});
