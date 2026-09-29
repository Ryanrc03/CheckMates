import type { CurrencyCode, Person } from "@/types/bill";
import type { AllocationTrace, BillBreakdown } from "@/types/split-detail";
import { DEFAULT_CURRENCY, formatMoney as format } from "@/lib/money";

function FeeLine({ label, trace, personIndex, currency }: { label: string; trace: AllocationTrace; personIndex: number; currency: CurrencyCode }) {
  const formatMoney = (cents: number) => format(cents, currency);
  const part = trace.parts[personIndex];
  if (trace.poolCents === 0 && label === "Tip") return <div className="breakdown-fee breakdown-row"><strong>Tip</strong>{" "}<span>No tip added · {formatMoney(0)}</span></div>;
  return <div className="breakdown-fee">
    <div className="breakdown-row"><strong>{label}</strong><b>{formatMoney(part.cents)}</b></div>
    {trace.weightSum === "0" ? <p>No item subtotal to divide; {label.toLowerCase()} is {formatMoney(0)}.</p> : <>
      <p>{formatMoney(trace.poolCents)} × ({formatMoney(part.weight)} / {formatMoney(Number(trace.weightSum))}) · allocated by exact cents</p>
      <p>Base {formatMoney(part.baseCents)} + remaining {formatMoney(part.extraCent ? 1 : 0)} = {formatMoney(part.cents)}</p>
    </>}
  </div>;
}

/** Even mode: each pool is divided by the number of friends, one leftover cent at a time. */
function EvenLine({ label, trace, personIndex, currency }: { label: string; trace: AllocationTrace; personIndex: number; currency: CurrencyCode }) {
  const formatMoney = (cents: number) => format(cents, currency);
  const part = trace.parts[personIndex];
  return <div className="breakdown-fee">
    <div className="breakdown-row"><strong>{label}</strong><b>{formatMoney(part.cents)}</b></div>
    <p>{formatMoney(trace.poolCents)} ÷ {trace.weightSum} · Base {formatMoney(part.baseCents)} + remaining {formatMoney(part.extraCent ? 1 : 0)}</p>
  </div>;
}

export function PersonBreakdown({ personId, breakdown, people, currency = DEFAULT_CURRENCY }: { personId: string; breakdown: BillBreakdown; people: Person[]; currency?: CurrencyCode }) {
  const formatMoney = (cents: number) => format(cents, currency);
  const personIndex = people.findIndex(person => person.id === personId);
  const share = breakdown.result.people[personIndex];
  if (breakdown.subtotal) return <div className="person-breakdown">
    <h3>Split evenly</h3>
    <p>The whole bill is shared by all {people.length} {people.length === 1 ? "friend" : "friends"}, whatever they ordered.</p>
    <EvenLine label="Items" trace={breakdown.subtotal} personIndex={personIndex} currency={currency}/>
    <EvenLine label="Tax" trace={breakdown.tax} personIndex={personIndex} currency={currency}/>
    <EvenLine label="Tip" trace={breakdown.tip} personIndex={personIndex} currency={currency}/>
    <div className="breakdown-row breakdown-person-total"><strong>Total for {share.name}</strong><b>{formatMoney(share.totalCents)}</b></div>
    <p className="breakdown-rule">Leftover cents rotate through the friends list, so shares differ by at most one cent.</p>
  </div>;
  const assigned = breakdown.items.filter(item => item.personIds.includes(personId));
  return <div className="person-breakdown">
    <h3>Item by item</h3>
    <ul className="breakdown-items">{assigned.map(item => {
      const index = item.personIds.indexOf(personId);
      const portion = item.allocation.parts[index];
      return <li key={item.itemId}>
        <div className="breakdown-row"><span>{item.itemName}{item.quantity > 1 && ` × ${item.quantity}`}</span><b>{formatMoney(portion.cents)}</b></div>
        <p>{formatMoney(item.priceCents)} {item.personIds.length === 1 ? "· Only you" : `· Shared by ${item.personIds.length}: ${item.personIds.map(id => people.find(person => person.id === id)?.name).join(", ")}`}</p>
        {item.personIds.length > 1 && <p>Base {formatMoney(portion.baseCents)} + remaining {formatMoney(portion.extraCent ? 1 : 0)} = {formatMoney(portion.cents)}</p>}
      </li>;
    })}</ul>
    {assigned.length === 0 && <p>No items assigned to this person.</p>}
    <div className="breakdown-row breakdown-subtotal"><strong>Items subtotal</strong><b>{formatMoney(share.itemsCents)}</b></div>
    <FeeLine label="Tax" trace={breakdown.tax} personIndex={personIndex} currency={currency}/>
    <FeeLine label="Tip" trace={breakdown.tip} personIndex={personIndex} currency={currency}/>
    <div className="breakdown-row breakdown-person-total"><strong>Total for {share.name}</strong><b>{formatMoney(share.totalCents)}</b></div>
    <p className="breakdown-rule">Extra cents go to the largest fractional remainder; ties follow the friends list order.</p>
  </div>;
}
