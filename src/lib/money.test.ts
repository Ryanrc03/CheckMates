import { describe, expect, it } from "vitest";
import { formatMoney, moneyInput, parseMoney } from "./money";

describe("money", () => {
  it("parses dollars into integer cents", () => {
    expect(parseMoney("$12.34")).toBe(1234);
    expect(parseMoney("0.5")).toBe(50);
    expect(parseMoney("12")).toBe(1200);
  });

  it("rejects excess precision and negatives", () => {
    expect(parseMoney(" ")).toBeNull();
    expect(parseMoney("90071992547409.92")).toBeNull();
    expect(parseMoney("12.34")).toBe(1234);
    expect(parseMoney("1.234")).toBeNull();
    expect(parseMoney("-1.00")).toBeNull();
    expect(parseMoney("oops")).toBeNull();
  });

  it("formats cents for display", () => {
    expect(formatMoney(105)).toBe("$1.05");
  });
  it("preserves the last cent at the safe-integer boundary", () => {
    expect(formatMoney(Number.MAX_SAFE_INTEGER)).toBe("$90,071,992,547,409.91");
    expect(moneyInput(Number.MAX_SAFE_INTEGER)).toBe("90071992547409.91");
    expect(parseMoney(moneyInput(Number.MAX_SAFE_INTEGER))).toBe(Number.MAX_SAFE_INTEGER);
    expect(formatMoney(-1)).toBe("-$0.01");
  });
});
