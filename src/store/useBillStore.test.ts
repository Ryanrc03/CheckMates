import { describe, expect, it } from "vitest";
import { createBillStore } from "./useBillStore";
import { createMockBill } from "@/lib/receipt";
import { restoreSession } from "@/lib/session";
import type { ReceiptDraft } from "@/types/receipt";

const draft: ReceiptDraft = { items: [{ name: "Soup", priceCents: null, sourceLine: "Soup ?" }], rawText: "Soup ?", taxCents: null, tipCents: 0, printedSubtotalCents: null, printedTotalCents: null, warnings: ["Missing price"] };
function memory() { const data = new Map<string, string>(); return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); }, removeItem: (k: string) => { data.delete(k); } }; }

describe("bill sessions", () => {
  it("creates independent demo bills with no assignments", () => {
    const a = createMockBill(); const b = createMockBill(); a.items[0].personIds.push("x");
    expect(b.items.map(i => i.priceCents)).toEqual([1495, 595, 350]);
    expect(b.items[0].personIds).toEqual([]); expect(b.people).toEqual([]);
    expect(b.taxCents).toBe(201); expect(b.tipCents).toBe(0);
  });
  it("edits, assigns, removes people and preserves remaining selections", async () => {
    const store = createBillStore(memory()); await store.getState().hydrate();
    const s = () => store.getState(); s().startBill("demo");
    s().confirmReceipt(s().bill); expect(s().step).toBe("people");
    s().addPerson("  A  "); s().addPerson("B"); s().addPerson(" ");
    expect(s().bill.people.map(p => p.name)).toEqual(["A", "B"]);
    const [a, b] = s().bill.people; const item = s().bill.items[0];
    s().assignEveryone(item.id); s().renamePerson(a.id, "Alex"); s().removePerson(b.id);
    expect(s().bill.items[0].personIds).toEqual([a.id]); expect(s().bill.people[0].id).toBe(a.id);
    s().updateItem(item.id, { priceCents: 1001 }); s().setExtras(151, 302);
    s().goTo("result"); expect(s().step).toBe("people");
    s().bill.items.forEach(i => s().assignEveryone(i.id)); s().goTo("result"); expect(s().step).toBe("result");
    s().goTo("receipt"); expect(s().bill.items[0].priceCents).toBe(1001);
    s().addItem(); expect(s().bill.items).toHaveLength(4); s().removeItem(s().bill.items[3].id);
    s().resetBill(); expect(s().step).toBe("home"); expect(s().bill.items).toEqual([]);
  });
  it("keeps photo drafts separate and restores nulls and warnings", async () => {
    const storage = memory(); const store = createBillStore(storage); await store.getState().hydrate();
    store.getState().startBill("photo", "receipt.jpg"); expect(store.getState().bill.items).toEqual([]);
    store.getState().setReceiptDraft(draft); store.getState().confirmReceipt(store.getState().bill);
    expect(store.getState().step).toBe("receipt");
    const next = createBillStore(storage); expect(next.getState().hasHydrated).toBe(false); await next.getState().hydrate();
    expect(next.getState().receiptDraft).toEqual(draft); expect(next.getState().fileName).toBe("receipt.jpg");
    next.getState().resetBill(); const third = createBillStore(storage); await third.getState().hydrate(); expect(third.getState().source).toBeNull();
  });
  it("rejects corrupt JSON, invalid structures and unknown versions", async () => {
    for (const raw of ["broken", '{"version":99}', '{"version":1,"state":{"bill":{}}}']) {
      const storage = memory(); storage.setItem("bitesplit-session", raw); const store = createBillStore(storage); await store.getState().hydrate();
      expect(store.getState().step).toBe("home"); expect(store.getState().hasHydrated).toBe(true);
    }
    expect(restoreSession(null)).toBeNull();
  });
  it("recovers an unsupported saved step to the nearest editable step", () => {
    const restored = restoreSession({ bill: createMockBill(), step: "result", source: "demo", fileName: null, receiptDraft: null });
    expect(restored?.step).toBe("people");
  });
  it("continues when browser storage cannot be written", async () => {
    const store = createBillStore({ getItem: () => null, setItem: () => { throw Error("Quota"); }, removeItem: () => {} });
    await store.getState().hydrate(); store.getState().startBill("demo");
    expect(store.getState().bill.items).toHaveLength(3); expect(store.getState().storageError).toBeTruthy();
  });
  it("restores partial receipt input without rounding or discarding it", async () => {
    const storage = memory(); const store = createBillStore(storage); await store.getState().hydrate(); store.getState().startBill("demo");
    const edit = { items: [{ id: "x", name: "Soup", price: "12.", personIds: [] }], tax: "", chargedTip: "0", addedTip: "1.2", note: "Checking tax" };
    store.getState().saveReceiptEdit(edit); const next = createBillStore(storage); await next.getState().hydrate(); expect(next.getState().receiptEdit).toEqual(edit);
  });
  it("does not restore action or runtime keys from browser data", async () => {
    const storage = memory(); storage.setItem("bitesplit-session", JSON.stringify({ version: 1, state: { bill: createMockBill(), step: "receipt", source: "demo", fileName: null, receiptDraft: null, startBill: "bad", storageError: "fake", hasHydrated: false } }));
    const store = createBillStore(storage); await store.getState().hydrate(); expect(typeof store.getState().startBill).toBe("function"); expect(store.getState().storageError).toBeNull();
  });
});
