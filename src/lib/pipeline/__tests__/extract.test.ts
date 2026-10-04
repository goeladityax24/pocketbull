import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { buildTracker } from "../analyze";
import { checkQuote, type PdfDoc } from "../documents";
import { extractGuidance } from "../extract";
import type { ExtractionResult } from "../guidance";
import { makePeriod } from "../periods";
import type { SavedRun } from "../store";
import type { CompanySnapshot } from "../types";

const transcript: PdfDoc = {
  url: "t.pdf",
  bytes: new Uint8Array(),
  hasText: true,
  pages: [
    "Moderator: Good afternoon. ".repeat(20),
    "Management: For FY27 we are guiding for revenue growth of 20 to 30 percent, and we expect around\n100 basis points of margin improvement every year. ".repeat(3),
  ],
};

const fake: ExtractionResult = {
  call_period: "H2 FY26",
  call_date: "2026-05-20",
  guidance: [
    {
      metric: "revenue",
      metric_label: "Revenue growth",
      kind: "growth_yoy",
      low: 20,
      high: 30,
      unit: "pct",
      approx: false,
      period: "FY27",
      horizon_text: null,
      basis: "unspecified",
      segment: null,
      condition: null,
      quote: "For FY27 we are guiding for revenue growth of 20 to 30 percent",
      page: 2,
      speaker: "Management",
      confidence: "high",
      keyword: "revenue growth",
      revises: null,
    },
  ],
  insights: {
    summary: "s",
    what_changed: [],
    tone: { label: "confident", quote: "q", page: 2 },
    analyst_questions: [],
    red_flags: [],
    watch_next: [],
    business_snapshot: { what_they_make: "", customers: "", revenue_mix: "", demand_drivers: "" },
  },
};

function fakeClient(input: unknown) {
  const calls: Anthropic.MessageCreateParams[] = [];
  const client = {
    messages: {
      stream(params: Anthropic.MessageCreateParams) {
        calls.push(params);
        return {
          finalMessage: async () => ({
            content: [{ type: "tool_use", id: "t", name: "record_analysis", input }],
            stop_reason: "tool_use",
            usage: { input_tokens: 20000, output_tokens: 3000 },
          }),
        };
      },
    },
  } as unknown as Anthropic;
  return { client, calls };
}

const snapshot: CompanySnapshot = {
  symbol: "PARTH",
  name: "Parth",
  screenerUrl: "",
  basis: "standalone",
  companyId: null,
  warehouseId: null,
  ratios: {},
  interim: {
    granularity: "half",
    periods: [makePeriod("half", 2025, 1), makePeriod("half", 2025, 2), makePeriod("half", 2026, 1), makePeriod("half", 2026, 2)],
    rows: { sales: [70, 105, 80, 118] },
  },
  annual: { granularity: "year", periods: [makePeriod("year", 2025), makePeriod("year", 2026)], rows: { sales: [175, 198] } },
  concalls: [],
  peers: [],
  fetchedAt: "",
};

describe("extractGuidance", () => {
  it("sends text (not PDF) for text transcripts, forces the tool, and validates output", async () => {
    const { client, calls } = fakeClient(fake);
    const { result, usage } = await extractGuidance({ snapshot, transcript, ppt: null, client, model: "claude-sonnet-5-5" });
    expect(result.guidance[0].low).toBe(20);
    expect(usage.costUsd).toBeCloseTo((20000 * 2 + 3000 * 10) / 1e6, 6);
    const p = calls[0];
    expect(p.tool_choice).toEqual({ type: "tool", name: "record_analysis" });
    const blocks = p.messages[0].content as Anthropic.ContentBlockParam[];
    expect(blocks[0].type).toBe("text");
    expect((blocks[0] as Anthropic.TextBlockParam).text).toContain("[[page 2]]");
    const schema = p.tools![0] as Anthropic.Tool;
    expect(schema.input_schema.type).toBe("object");
    expect((schema.input_schema as Record<string, unknown>).$schema).toBeUndefined();
  });

  it("rejects malformed model output", async () => {
    const { client } = fakeClient({ guidance: "nope" });
    await expect(extractGuidance({ snapshot, transcript, ppt: null, client })).rejects.toThrow(/validation/);
  });
});

describe("checkQuote", () => {
  it("verifies quotes across line breaks and flags invented ones", () => {
    expect(checkQuote("we expect around 100 basis points of margin improvement every year", transcript)).toBe("verified");
    expect(checkQuote("We will double revenue by FY28 through acquisitions abroad", transcript)).toBe("not_found");
    expect(checkQuote("anything", { ...transcript, hasText: false })).toBe("unverifiable");
  });
});

describe("buildTracker", () => {
  it("scores half-yearly companies and builds the next-results checklist", () => {
    const run: SavedRun = {
      symbol: "PARTH",
      concall: { month: "May 2026", yearMonth: "2026-05", transcriptUrl: "t", pptUrl: null, recordingUrl: null },
      basis: "standalone",
      createdAt: "2026-05-21T00:00:00Z",
      createdBy: null,
      usage: { model: "m", inputTokens: 0, outputTokens: 0, costUsd: 0 },
      extraction: fake,
      quoteChecks: ["verified"],
      docs: { transcriptUrl: "t", pptUrl: null, transcriptPages: 2, transcriptHasText: true },
    };
    const t = buildTracker(snapshot, [run]);
    expect(t.nextPeriod?.label).toBe("H1 FY27");
    const h1 = t.items[0].checks.find((c) => c.period.label === "H1 FY27")!;
    expect(h1.tag).toBe("expected");
    expect(h1.base?.value).toBe(80);
    expect(h1.expected!.low).toBeCloseTo(96, 5); // ₹80 Cr × 1.20
    expect(h1.expected!.high).toBeCloseTo(104, 5); // ₹80 Cr × 1.30
    const fy = t.items[0].checks.at(-1)!;
    expect(fy.period.label).toBe("FY27");
    expect(fy.expected!.low).toBeCloseTo(237.6, 5);
  });
});
