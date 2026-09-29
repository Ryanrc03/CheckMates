import { describe, expect, it } from "vitest";
import { createBillStore } from "./useBillStore";
import { createMockBill } from "@/lib/receipt";
import { restoreSession } from "@/lib/session";

function memory() { const data = new Map<string, string>(); return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); }, removeItem: (k: string) => { data.delete(k); } }; }

describe("feedback-driven store behavior", () => {
  it("toggles Everyone off again without touching other items", async () => {
    const store = createBillStore(memory()); await store.getState().hydrate(); const s = () => store.getState();
    s().startBill("demo"); s().confirmReceipt(s().bill); s().addPerson("A"); s().addPerson("B");
    const [first, second] = s().bill.items; const [a] = s().bill.people;
    s().togglePerson(first.id, a.id); s().toggleEveryone(first.id);
    expect(s().bill.items[0].personIds).toHaveLength(2);
    s().toggleEveryone(first.id); expect(s().bill.items[0].personIds).toEqual([]);
    s().assignEveryone(second.id); s().assignEveryone(second.id); expect(s().bill.items[1].personIds).toHaveLength(2);
  });

  it("reaches the result in even mode without assignments, and keeps the currency", async () => {
    const storage = memory(); const store = createBillStore(storage); await store.getState().hydrate(); const s = () => store.getState();
    s().startBill("demo"); s().setCurrency("EUR"); s().confirmReceipt(s().bill); s().addPerson("A"); s().addPerson("B");
    s().goTo("result"); expect(s().step).toBe("people");
    s().setSplitMode("even"); s().goTo("result"); expect(s().step).toBe("result");
    const next = createBillStore(storage); await next.getState().hydrate();
    expect(next.getState().step).toBe("result"); expect(next.getState().bill.currency).toBe("EUR"); expect(next.getState().bill.splitMode).toBe("even");
  });

  it("remembers percentage extras and quantities across a reload", async () => {
    const storage = memory(); const store = createBillStore(storage); await store.getState().hydrate(); const s = () => store.getState();
    s().startBill("demo");
    const bill = { ...s().bill, tipCents: 90, items: [{ ...s().bill.items[0], priceCents: 500, quantity: 2 }] };
    s().confirmReceipt(bill, { addedTipCents: 90, reviewNote: "", taxRate: "8.25", addedTipRate: "18" });
    const next = createBillStore(storage); await next.getState().hydrate();
    expect(next.getState().taxRate).toBe("8.25"); expect(next.getState().addedTipRate).toBe("18"); expect(next.getState().bill.items[0].quantity).toBe(2);
  });

  it("rejects invalid quantities, currencies, modes and rates from storage", () => {
    const base = { step: "receipt", source: "demo", fileName: null, receiptDraft: null };
    const bill = createMockBill();
    expect(restoreSession({ ...base, bill: { ...bill, items: [{ ...bill.items[0], quantity: 2 }] } })).toBeNull();
    expect(restoreSession({ ...base, bill: { ...bill, items: [{ ...bill.items[0], quantity: 0 }] } })).toBeNull();
    expect(restoreSession({ ...base, bill: { ...bill, currency: "XYZ" } })).toBeNull();
    expect(restoreSession({ ...base, bill: { ...bill, splitMode: "random" } })).toBeNull();
    expect(restoreSession({ ...base, bill, taxRate: "200" })).toBeNull();
    expect(restoreSession({ ...base, bill: { ...bill, items: [{ ...bill.items[1], quantity: 5 }] }, taxRate: "8.25" })?.bill.items[0].quantity).toBe(5);
  });
});
