import { describe, expect, it } from "vitest";
import {
  makePeriod,
  nextPeriod,
  parsePeriodLabel,
  periodFromEndDate,
  samePeriodLastYear,
} from "../periods";
import { parseNumber } from "../numbers";

describe("periods", () => {
  it("maps quarter end dates to Indian fiscal quarters", () => {
    expect(periodFromEndDate("2026-06-30", "quarter").label).toBe("Q1 FY27");
    expect(periodFromEndDate("2025-12-31", "quarter").label).toBe("Q3 FY26");
    expect(periodFromEndDate("2026-03-31", "quarter").label).toBe("Q4 FY26");
  });

  it("maps half-year end dates", () => {
    expect(periodFromEndDate("2025-09-30", "half").label).toBe("H1 FY26");
    expect(periodFromEndDate("2026-03-31", "half").label).toBe("H2 FY26");
  });

  it("finds the same period last year and the next period", () => {
    const q2 = makePeriod("quarter", 2027, 2);
    expect(q2.endDate).toBe("2026-09-30");
    expect(samePeriodLastYear(q2).endDate).toBe("2025-09-30");
    expect(nextPeriod(makePeriod("quarter", 2026, 4)).label).toBe("Q1 FY27");
    expect(nextPeriod(makePeriod("half", 2026, 2)).label).toBe("H1 FY27");
  });

  it("parses period labels", () => {
    expect(parsePeriodLabel("FY27")?.endDate).toBe("2027-03-31");
    expect(parsePeriodLabel("q2 fy27")?.label).toBe("Q2 FY27");
    expect(parsePeriodLabel("FY2026")?.label).toBe("FY26");
    expect(parsePeriodLabel("next year")).toBeNull();
  });
});

describe("parseNumber", () => {
  it("handles Screener formats", () => {
    expect(parseNumber(" 2,07,559 ")).toBe(207559);
    expect(parseNumber("18%")).toBe(18);
    expect(parseNumber("-0.3%")).toBe(-0.3);
    expect(parseNumber("-0")).toBe(0);
    expect(parseNumber(" ")).toBeNull();
  });
});
