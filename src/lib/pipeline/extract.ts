import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { withPageMarkers, type PdfDoc } from "./documents";
import { ExtractionResult, type GuidanceItem } from "./guidance";
import type { CompanySnapshot } from "./types";

export const DEFAULT_MODEL = process.env.PB_MODEL || "claude-sonnet-5-5";

/** USD per million tokens. Update when pricing changes. */
const PRICES: Record<string, { in: number; out: number }> = {
  "claude-sonnet-5-5": { in: 2, out: 10 },
  "claude-opus-5-5": { in: 4, out: 20 },
  "claude-haiku-4-5-20251001": { in: 1, out: 5 },
};

export interface ExtractionUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number | null;
}

/** The extraction rules. Shared by the API call and by Claude sessions running on the Admin's plan (see docs/ANALYSIS_PLAYBOOK.md). */
export const EXTRACTION_RULES = `You are an equity research assistant for a small private group of Indian retail investors.
You read one company's earnings-call transcript (and investor presentation, if given) and record:
1. Every piece of forward-looking guidance given by MANAGEMENT (never by analysts).
2. A short insight report.

Rules for guidance:
- Copy "quote" word for word from the transcript. Never paraphrase inside quote. Use the [[page N]] markers for "page".
- Indian fiscal years run April to March. "FY27" ends March 2027. "This year" on a call held in May 2026 means FY27.
- Percent values as plain numbers: "18 to 20 percent" -> low 18, high 20, unit "pct". Rupee values in crore: "₹300 crore" -> 300; "₹30 billion" -> 3000; "₹50 lakh" -> 0.5.
- A single number -> low = high. "Around", "about", "~" -> approx true.
- Vague bands: "high teens" -> 16-19, "mid teens" -> 14-16, "low teens" -> 11-13, all approx true. If there is no honest upper and lower bound ("double digit", "strong growth"), use kind "qualitative", leave low/high null and set keyword.
- Growth guidance is year-on-year unless management says otherwise.
- Map metrics: revenue/top-line/sales -> revenue; EBITDA -> ebitda (₹) or ebitda_margin (%); PAT/net profit -> pat or pat_margin; capex; net debt; order book. Anything else -> other.
- Use "unspecified" basis unless management says consolidated, standalone or a segment.
- Multi-year statements ("20-30% CAGR over 2-3 years") -> period null, horizon_text filled.
- If a statement repeats or updates earlier guidance and you were given that earlier guidance, fill "revises".
- Skip boilerplate safe-harbour text. Skip analysts' own estimates.

Rules for the insight report:
- Be specific: numbers, segment names, customer names, dates. No generic filler.
- Every claim must come from the documents. Cite pages where you can.
- Write plain English, short sentences.`;

function toolSchema() {
  const schema = z.toJSONSchema(ExtractionResult, { target: "draft-7" }) as Record<string, unknown>;
  delete schema.$schema;
  return schema as Anthropic.Tool.InputSchema;
}

function contextBlock(s: CompanySnapshot, previous: GuidanceItem[]): string {
  const sales = s.interim.rows.sales ?? [];
  const lastIdx = sales.findLastIndex((v) => v != null);
  const lastInterim = lastIdx >= 0 ? s.interim.periods[lastIdx] : null;
  const lines = [
    `Company: ${s.name} (${s.symbol}). Numbers basis on Screener: ${s.basis}.`,
    `Reports ${s.interim.granularity === "half" ? "half-yearly (SME)" : "quarterly"}. Latest reported period: ${lastInterim?.label ?? "unknown"}.`,
  ];
  if (previous.length) {
    lines.push(
      "Earlier guidance on record (for 'revises' and 'what_changed'):",
      ...previous.map((g) => `- ${g.metric_label}: ${g.low ?? "?"}${g.high != null && g.high !== g.low ? `-${g.high}` : ""} ${g.unit ?? ""} for ${g.period ?? g.horizon_text ?? "?"}`),
    );
  }
  return lines.join("\n");
}

const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");

export async function extractGuidance(args: {
  snapshot: CompanySnapshot;
  transcript: PdfDoc;
  ppt: PdfDoc | null;
  previous?: GuidanceItem[];
  client?: Anthropic;
  model?: string;
}): Promise<{ result: ExtractionResult; usage: ExtractionUsage }> {
  const client = args.client ?? new Anthropic();
  const model = args.model ?? DEFAULT_MODEL;
  const content: Anthropic.ContentBlockParam[] = [];

  // Text is ~5x cheaper than page images; send the PDF itself only for scans.
  if (args.transcript.hasText) {
    content.push({ type: "text", text: `<transcript>\n${withPageMarkers(args.transcript.pages)}\n</transcript>` });
  } else {
    content.push({ type: "text", text: "Transcript (scanned PDF):" });
    content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: b64(args.transcript.bytes) } });
  }
  if (args.ppt) {
    // Slides carry charts and tables, so send the PDF to keep the visuals
    content.push({ type: "text", text: "Investor presentation:" });
    content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: b64(args.ppt.bytes) } });
  }
  content.push({
    type: "text",
    text: `${contextBlock(args.snapshot, args.previous ?? [])}\n\nRecord the guidance and the insight report with the record_analysis tool.`,
  });

  const stream = client.messages.stream({
    model,
    max_tokens: 16000,
    system: EXTRACTION_RULES,
    tools: [{ name: "record_analysis", description: "Save the extracted guidance and insight report", input_schema: toolSchema() }],
    tool_choice: { type: "tool", name: "record_analysis" },
    messages: [{ role: "user", content }],
  });
  const msg = await stream.finalMessage();

  const block = msg.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
  if (!block) throw new Error(`Model returned no tool call (stop_reason: ${msg.stop_reason})`);
  const parsed = ExtractionResult.safeParse(block.input);
  if (!parsed.success) {
    throw new Error(`Model output failed validation: ${parsed.error.message.slice(0, 500)}`);
  }

  const price = PRICES[model];
  const usage: ExtractionUsage = {
    model,
    inputTokens: msg.usage.input_tokens,
    outputTokens: msg.usage.output_tokens,
    costUsd: price ? (msg.usage.input_tokens * price.in + msg.usage.output_tokens * price.out) / 1e6 : null,
  };
  return { result: parsed.data, usage };
}
