import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { QuoteCheck } from "./documents";
import type { ExtractionUsage } from "./extract";
import type { ExtractionResult } from "./guidance";
import type { Basis, Concall } from "./types";

/** One saved AI run: one company, one concall. Runs are never repeated. */
export interface SavedRun {
  symbol: string;
  concall: Concall;
  basis: Basis;
  createdAt: string;
  createdBy: string | null;
  usage: ExtractionUsage;
  extraction: ExtractionResult;
  /** Same order as extraction.guidance */
  quoteChecks: QuoteCheck[];
  docs: { transcriptUrl: string; pptUrl: string | null; transcriptPages: number; transcriptHasText: boolean };
}

/** Storage seam: a local JSON store now, Supabase in the web app. */
export interface RunStore {
  getRun(symbol: string, yearMonth: string): Promise<SavedRun | null>;
  listRuns(symbol: string): Promise<SavedRun[]>;
  saveRun(run: SavedRun): Promise<void>;
}

export class FileRunStore implements RunStore {
  constructor(private dir = join(process.cwd(), "data", "runs")) {}

  private path(symbol: string, yearMonth?: string) {
    return yearMonth ? join(this.dir, symbol, `${yearMonth}.json`) : join(this.dir, symbol);
  }

  async getRun(symbol: string, yearMonth: string) {
    try {
      return JSON.parse(await readFile(this.path(symbol, yearMonth), "utf8")) as SavedRun;
    } catch {
      return null;
    }
  }

  async listRuns(symbol: string) {
    try {
      const files = (await readdir(this.path(symbol))).filter((f) => f.endsWith(".json")).sort();
      const runs = await Promise.all(files.map((f) => this.getRun(symbol, f.replace(/\.json$/, ""))));
      return runs.filter((r): r is SavedRun => r != null);
    } catch {
      return [];
    }
  }

  async saveRun(run: SavedRun) {
    await mkdir(this.path(run.symbol), { recursive: true });
    await writeFile(this.path(run.symbol, run.concall.yearMonth), JSON.stringify(run, null, 2));
  }
}
