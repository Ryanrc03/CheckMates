import { create } from "zustand";
import type { StateStorage } from "zustand/middleware";
import type { Bill, CurrencyCode, ReceiptItem, SplitMode, WizardStep } from "@/types/bill";
import type { BillSession, ReceiptDraft, ReceiptEdit } from "@/types/receipt";
import { createMockBill, emptyBill } from "@/lib/receipt";
import { isCurrency } from "@/lib/money";
import { availableStep, isBill, isDraft, receiptReady, restoreSession, validCents } from "@/lib/session";

const initial = (): BillSession => ({ bill: emptyBill(), step: "home", source: null, fileName: null, receiptDraft: null, receiptConfirmed: false, addedTipCents: 0, reviewNote: "", receiptEdit: null, taxRate: null, addedTipRate: null });
const KEY = "bitesplit-session";
type State = BillSession & {
  hasHydrated: boolean; storageError: string | null; error: string | null;
  hydrate: () => Promise<void>;
  saveReceiptEdit: (edit: ReceiptEdit) => void;
  startBill: (source: "demo" | "photo", fileName?: string) => void;
  setReceiptDraft: (draft: ReceiptDraft) => void;
  confirmReceipt: (bill: Bill, review?: { addedTipCents: number; reviewNote: string; taxRate?: string | null; addedTipRate?: string | null }) => void;
  updateItem: (id: string, patch: Partial<Pick<ReceiptItem, "name" | "priceCents">>) => void;
  addItem: () => void; removeItem: (id: string) => void;
  setExtras: (tax: number, tip: number) => void;
  addPerson: (name: string) => void; renamePerson: (id: string, name: string) => void; removePerson: (id: string) => void;
  togglePerson: (itemId: string, personId: string) => void; assignEveryone: (itemId: string) => void;
  /** Selects everyone, or clears the item when everyone is already selected. */
  toggleEveryone: (itemId: string) => void;
  setSplitMode: (mode: SplitMode) => void; setCurrency: (currency: CurrencyCode) => void;
  goTo: (step: WizardStep) => void; resetBill: () => void;
};
export function createBillStore(storage: StateStorage) {
  let hydration: Promise<void> | null = null;
  let revision = 0;
  let writes = Promise.resolve();
  return create<State>((set, get) => {
    const persist = () => {
      const { bill, step, source, fileName, receiptDraft, receiptConfirmed, addedTipCents, reviewNote, receiptEdit, taxRate, addedTipRate } = get();
      const value = JSON.stringify({ version: 1, state: { bill, step, source, fileName, receiptDraft, receiptConfirmed, addedTipCents, reviewNote, receiptEdit, taxRate, addedTipRate } });
      try {
        const result = storage.setItem(KEY, value);
        if (result instanceof Promise) writes = writes.then(() => result).catch(() => { set({ storageError: "Changes cannot be saved on this device. Keep this tab open." }); });
      } catch { set({ storageError: "Changes cannot be saved on this device. Keep this tab open." }); }
    };
    const change = (patch: Partial<State>) => { revision++; set({ ...patch, error: null }); persist(); };
    const update = (transform: (bill: Bill) => Bill) => {
      const bill = transform(get().bill);
      if (!isBill(bill)) { set({ error: "Please check the amounts and names." }); return; }
      change({ bill });
    };
    return {
      ...initial(), hasHydrated: false, storageError: null, error: null,
      hydrate: () => {
        if (hydration) return hydration;
        const started = revision;
        hydration = (async () => {
          try {
            const raw = await storage.getItem(KEY);
            if (raw && started === revision) {
              const saved = JSON.parse(raw);
              const restored = saved.version === 1 ? restoreSession(saved.state) : null;
              if (restored) set(restored);
            }
          } catch { set({ storageError: "Saved session could not be loaded. You can start a new bill." }); }
          set({ hasHydrated: true });
        })(); return hydration;
      },
      startBill: (source, fileName) => change({ ...initial(), source, fileName: fileName ?? null, bill: source === "demo" ? createMockBill() : emptyBill(), step: source === "demo" ? "receipt" : "home" }),
      saveReceiptEdit: receiptEdit => change({ receiptEdit }),
      setReceiptDraft: receiptDraft => { if (isDraft(receiptDraft)) change({ receiptDraft, receiptEdit: null, receiptConfirmed: false, addedTipCents: 0, reviewNote: "", taxRate: null, addedTipRate: null, step: "receipt" }); },
      confirmReceipt: (bill, review) => {
        if (!receiptReady(bill)) { set({ error: "Add valid items and amounts before continuing." }); return; }
        change({ bill: structuredClone(bill), receiptEdit: null, receiptConfirmed: true, step: "people", ...(review ?? {}) });
      },
      updateItem: (id, patch) => update(b => ({ ...b, items: b.items.map(i => i.id === id ? { ...i, ...patch } : i) })),
      addItem: () => update(b => ({ ...b, items: [...b.items, { id: crypto.randomUUID(), name: "", priceCents: 0, personIds: [] }] })),
      removeItem: id => update(b => ({ ...b, items: b.items.filter(i => i.id !== id) })),
      setExtras: (taxCents, tipCents) => { if (validCents(taxCents) && validCents(tipCents)) update(b => ({ ...b, taxCents, tipCents })); },
      addPerson: name => { if (name.trim()) update(b => ({ ...b, people: [...b.people, { id: crypto.randomUUID(), name: name.trim() }] })); },
      renamePerson: (id, name) => { if (name.trim()) update(b => ({ ...b, people: b.people.map(p => p.id === id ? { ...p, name: name.trim() } : p) })); },
      removePerson: id => update(b => ({ ...b, people: b.people.filter(p => p.id !== id), items: b.items.map(i => ({ ...i, personIds: i.personIds.filter(p => p !== id) })) })),
      togglePerson: (itemId, personId) => update(b => ({ ...b, items: b.items.map(i => i.id === itemId ? { ...i, personIds: i.personIds.includes(personId) ? i.personIds.filter(p => p !== personId) : [...i.personIds, personId] } : i) })),
      assignEveryone: itemId => update(b => ({ ...b, items: b.items.map(i => i.id === itemId ? { ...i, personIds: b.people.map(p => p.id) } : i) })),
      toggleEveryone: itemId => update(b => ({ ...b, items: b.items.map(i => i.id !== itemId ? i : { ...i, personIds: b.people.length > 0 && b.people.every(p => i.personIds.includes(p.id)) ? [] : b.people.map(p => p.id) }) })),
      setSplitMode: splitMode => update(b => ({ ...b, splitMode })),
      setCurrency: currency => { if (isCurrency(currency)) update(b => ({ ...b, currency })); },
      goTo: step => { if (availableStep(get(), step) === step) change({ step }); else set({ error: "Finish the current receipt, add friends, and assign every item first." }); },
      resetBill: () => change(initial()),
    };
  });
}
export const useBillStore = createBillStore({
  getItem: key => typeof window === "undefined" ? null : window.localStorage.getItem(key),
  setItem: (key, value) => { if (typeof window !== "undefined") window.localStorage.setItem(key, value); },
  removeItem: key => { if (typeof window !== "undefined") window.localStorage.removeItem(key); },
});
