import { create } from "zustand";
import type { StateStorage } from "zustand/middleware";
import type { Bill, ReceiptItem, WizardStep, ItemAllocation } from "@/types/bill";
import type { BillSession, ReceiptDraft, ReceiptEdit, AllocationEdit } from "@/types/receipt";
import { createMockBill, emptyBill } from "@/lib/receipt";
import { availableStep, isBill, isDraft, receiptReady, migrateSession, validCents } from "@/lib/session";

import { allocationPersonIds, validateItemAllocation } from "@/lib/item-allocation";

const initial = (): BillSession => ({ bill: emptyBill(), step: "home", source: null, fileName: null, receiptDraft: null, receiptConfirmed: false, addedTipCents: 0, reviewNote: "", receiptEdit: null, allocationEdits: {} });
const KEY = "bitesplit-session";
type State = BillSession & {
  hasHydrated: boolean; storageError: string | null; error: string | null;
  hydrate: () => Promise<void>;
  saveReceiptEdit: (edit: ReceiptEdit) => void;
  startBill: (source: "demo" | "photo", fileName?: string) => void;
  setReceiptDraft: (draft: ReceiptDraft) => void;
  confirmReceipt: (bill: Bill, review?: { addedTipCents: number; reviewNote: string }) => void;
  updateItem: (id: string, patch: Partial<Pick<ReceiptItem, "name" | "priceCents">>) => void;
  addItem: () => void; removeItem: (id: string) => void;
  setExtras: (tax: number, tip: number) => void;
  addPerson: (name: string) => void; renamePerson: (id: string, name: string) => void; removePerson: (id: string) => void;
  togglePerson: (itemId: string, personId: string) => void; assignEveryone: (itemId: string) => void;
  resetEqualAllocation: (itemId: string) => void;
  saveAllocationEdit: (itemId: string, edit: AllocationEdit) => void;
  applyAllocation: (itemId: string, allocation: ItemAllocation) => void;
  discardAllocationEdit: (itemId: string) => void;
  goTo: (step: WizardStep) => void; resetBill: () => void;
};
export function createBillStore(storage: StateStorage) {
  let hydration: Promise<void> | null = null;
  let revision = 0;
  let writes = Promise.resolve();
  return create<State>((set, get) => {
    const persist = () => {
      const { bill, step, source, fileName, receiptDraft, receiptConfirmed, addedTipCents, reviewNote, receiptEdit, allocationEdits } = get();
      const value = JSON.stringify({ version: 2, state: { bill, step, source, fileName, receiptDraft, receiptConfirmed, addedTipCents, reviewNote, receiptEdit, allocationEdits } });
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
              const restored = migrateSession(saved);
              if (restored) set(restored);
            }
          } catch { set({ storageError: "Saved session could not be loaded. You can start a new bill." }); }
          set({ hasHydrated: true });
        })(); return hydration;
      },
      startBill: (source, fileName) => change({ ...initial(), source, fileName: fileName ?? null, bill: source === "demo" ? createMockBill() : emptyBill(), step: source === "demo" ? "receipt" : "home" }),
      saveReceiptEdit: receiptEdit => change({ receiptEdit }),
      setReceiptDraft: receiptDraft => { if (isDraft(receiptDraft)) change({ receiptDraft, receiptEdit: null, receiptConfirmed: false, addedTipCents: 0, reviewNote: "", step: "receipt" }); },
      confirmReceipt: (bill, review) => {
        if (!receiptReady(bill)) { set({ error: "Add valid items and amounts before continuing." }); return; }
        change({ bill: structuredClone(bill), receiptEdit: null, receiptConfirmed: true, step: "people", ...(review ?? {}) });
      },
      updateItem: (id, patch) => update(b => ({ ...b, items: b.items.map(i => i.id === id ? { ...i, ...patch } : i) })),
      addItem: () => update(b => ({ ...b, items: [...b.items, { id: crypto.randomUUID(), name: "", priceCents: 0, allocation: { mode: "equal", personIds: [] } }] })),
      removeItem: id => { const edits={...get().allocationEdits};delete edits[id];change({bill:{...get().bill,items:get().bill.items.filter(i=>i.id!==id)},allocationEdits:edits}); },
      setExtras: (taxCents, tipCents) => { if (validCents(taxCents) && validCents(tipCents)) update(b => ({ ...b, taxCents, tipCents })); },
      addPerson: name => { if (name.trim()) update(b => ({ ...b, people: [...b.people, { id: crypto.randomUUID(), name: name.trim() }] })); },
      renamePerson: (id, name) => { if (name.trim()) update(b => ({ ...b, people: b.people.map(p => p.id === id ? { ...p, name: name.trim() } : p) })); },
      removePerson: id => {
        const bill=get().bill;
        const allocationEdits=Object.fromEntries(Object.entries(get().allocationEdits??{}).map(([key,e])=>[key,{...e,entries:e.entries.filter(p=>p.personId!==id)}]));
        change({bill:{...bill,people:bill.people.filter(p=>p.id!==id),items:bill.items.map(i=>({...i,allocation:i.allocation.mode==="equal"?{...i.allocation,personIds:i.allocation.personIds.filter(p=>p!==id)}:{...i.allocation,shares:i.allocation.shares.filter(p=>p.personId!==id)}}))},allocationEdits});
      },
      togglePerson: (itemId, personId) => update(b=>({...b,items:b.items.map(i=>i.id===itemId && i.allocation.mode==="equal" ? {...i,allocation:{mode:"equal",personIds:i.allocation.personIds.includes(personId)?i.allocation.personIds.filter(p=>p!==personId):[...i.allocation.personIds,personId]}}:i)})),
      assignEveryone: itemId => update(b=>({...b,items:b.items.map(i=>i.id===itemId ? {...i,allocation:{mode:"equal",personIds:b.people.map(p=>p.id)}}:i)})),
      resetEqualAllocation: itemId => {const bill={...get().bill,items:get().bill.items.map(i=>i.id===itemId?{...i,allocation:{mode:"equal" as const,personIds:allocationPersonIds(i.allocation)}}:i)};const edits={...get().allocationEdits};delete edits[itemId];change({bill,allocationEdits:edits});},
      saveAllocationEdit: (itemId, edit) => { if(get().bill.items.some(i=>i.id===itemId)) change({allocationEdits:{...get().allocationEdits,[itemId]:structuredClone(edit)}}); },
      discardAllocationEdit: itemId => {const edits={...get().allocationEdits};delete edits[itemId];change({allocationEdits:edits});},
      applyAllocation: (itemId, allocation) => {
        const check=validateItemAllocation(allocation,get().bill.people);
        if(!check.valid){set({error:check.message});return;}
        const bill={...get().bill,items:get().bill.items.map(i=>i.id===itemId?{...i,allocation:structuredClone(allocation)}:i)};
        if(!isBill(bill))return;
        const edits={...get().allocationEdits};delete edits[itemId];change({bill,allocationEdits:edits});
      },
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
