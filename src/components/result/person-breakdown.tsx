import type { Person } from "@/types/bill";
import type { AllocationTrace, BillBreakdown } from "@/types/split-detail";
import { formatMoney } from "@/lib/money";

function FeeLine({ label, trace, personIndex }: { label: string; trace: AllocationTrace; personIndex: number }) {
  const part = trace.parts[personIndex];
  if (trace.poolCents === 0 && label === "Tip") return <div className="breakdown-fee"><strong>Tip</strong><span>No tip added · {formatMoney(0)}</span></div>;
  return <div className="breakdown-fee">
    <div className="breakdown-row"><strong>{label}</strong><b>{formatMoney(part.cents)}</b></div>
    {trace.weightSum === "0" ? <p>No item subtotal to divide; {label.toLowerCase()} is {formatMoney(0)}.</p> : <>
      <p>{formatMoney(trace.poolCents)} × ({formatMoney(part.weight)} / {formatMoney(Number(trace.weightSum))}) · allocated by exact cents</p>
      <p>Base {formatMoney(part.baseCents)} + remaining {formatMoney(part.extraCent ? 1 : 0)} = {formatMoney(part.cents)}</p>
    </>}
  </div>;
}

export function PersonBreakdown({ personId, breakdown, people }: { personId: string; breakdown: BillBreakdown; people: Person[] }) {
  const personIndex = people.findIndex(person => person.id === personId);
  const share = breakdown.result.people[personIndex];
  const assigned = breakdown.items.filter(item => item.personIds.includes(personId));
  return <div className="person-breakdown">
    <h3>Item by item</h3>
    <ul className="breakdown-items">{assigned.map(item => {
      const index = item.personIds.indexOf(personId);
      const portion = item.allocation.parts[index];
      return <li key={item.itemId}>
        <div className="breakdown-row"><span>{item.itemName}</span><b>{formatMoney(portion.cents)}</b></div>
        <p>{formatMoney(item.priceCents)} {item.personIds.length === 1 ? "· Only you" : `· Shared by ${item.personIds.length}: ${item.personIds.map(id => people.find(person => person.id === id)?.name).join(", ")}`}</p>
        {item.personIds.length > 1 && <p>Base {formatMoney(portion.baseCents)} + remaining {formatMoney(portion.extraCent ? 1 : 0)} = {formatMoney(portion.cents)}</p>}
      </li>;
    })}</ul>
    {assigned.length === 0 && <p>No items assigned to this person.</p>}
    <div className="breakdown-row breakdown-subtotal"><strong>Items subtotal</strong><b>{formatMoney(share.itemsCents)}</b></div>
    <FeeLine label="Tax" trace={breakdown.tax} personIndex={personIndex}/>
    <FeeLine label="Tip" trace={breakdown.tip} personIndex={personIndex}/>
    <div className="breakdown-row breakdown-person-total"><strong>Total for {share.name}</strong><b>{formatMoney(share.totalCents)}</b></div>
    <p className="breakdown-rule">Extra cents go to the largest fractional remainder; ties follow the friends list order.</p>
  </div>;
}
