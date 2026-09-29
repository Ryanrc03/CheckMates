import { describe, expect, it } from "vitest";
import { decodeSharedSplit, encodeSharedSplit, shareUrl } from "./share-link";
import { splitBill } from "./split";

const result = splitBill({ people: [{ id: "a", name: "Zoë" }, { id: "b", name: "小明" }], items: [{ id: "1", name: "Burger", priceCents: 1001, personIds: ["a", "b"] }, { id: "2", name: "Fries", priceCents: 500, personIds: ["b"] }], taxCents: 151, tipCents: 302 });

describe("share links", () => {
  it("round-trips the final amounts, including non-ASCII names and currency", () => {
    const url = shareUrl("https://example.test/app#old", result, "EUR");
    expect(url.startsWith("https://example.test/app#share=")).toBe(true);
    const shared = decodeSharedSplit(url.slice(url.indexOf("#")));
    expect(shared?.currency).toBe("EUR");
    expect(shared?.result.totalCents).toBe(1954);
    expect(shared?.result.people.map(p => [p.name, p.totalCents])).toEqual([["Zoë", 652], ["小明", 1302]]);
  });

  it("rejects tampered, inconsistent or malformed payloads", () => {
    const encoded = encodeSharedSplit(result);
    const tamper = (change: (data: Record<string, unknown>) => void) => {
      const data = JSON.parse(atob(encoded.replace(/-/g, "+").replace(/_/g, "/")));
      change(data);
      return `#share=${btoa(JSON.stringify(data)).replace(/=+$/, "")}`;
    };
    expect(decodeSharedSplit(`#share=${encoded}`)).not.toBeNull();
    expect(decodeSharedSplit(tamper(d => { d.s = 1; }))).toBeNull();
    expect(decodeSharedSplit(tamper(d => { d.c = "XYZ"; }))).toBeNull();
    expect(decodeSharedSplit(tamper(d => { d.v = 2; }))).toBeNull();
    expect(decodeSharedSplit(tamper(d => { d.p = []; }))).toBeNull();
    expect(decodeSharedSplit(tamper(d => { (d.p as unknown[][])[0][1] = -1; }))).toBeNull();
    expect(decodeSharedSplit("#share=!!!")).toBeNull();
    expect(decodeSharedSplit("#share=bm90IGpzb24")).toBeNull();
    expect(decodeSharedSplit("#other")).toBeNull();
  });
});
