import { describe, expect, it } from "vitest";
import { personColor, personInitial } from "./person-style";

describe("personColor", () => {
  it("gives the first six friends different colors in list order and then repeats", () => {
    const first = [0, 1, 2, 3, 4, 5].map(personColor);
    expect(first[0]).toBe("person-1");
    expect(new Set(first).size).toBe(6);
    expect(personColor(6)).toBe(personColor(0));
  });
  it("never returns an invalid class for a missing index", () => {
    expect(personColor(-1)).toBe("person-6");
  });
});

describe("personInitial", () => {
  it("uses the first character of the trimmed name", () => {
    expect(personInitial("  bea ")).toBe("B");
    expect(personInitial("张三")).toBe("张");
    expect(personInitial("")).toBe("?");
  });
});
