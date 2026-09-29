import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useBillStore } from "@/store/useBillStore";
import { DEFAULT_CURRENCY, formatMoney } from "@/lib/money";
import { personColor } from "../people/people-step";
export function SplitStep() {
  const s = useBillStore(); const [error, setError] = useState(false); const assigned = s.bill.items.filter(i => i.personIds.length).length;
  const even = s.bill.splitMode === "even"; const money = (cents: number) => formatMoney(cents, s.bill.currency ?? DEFAULT_CURRENCY);
  const total = s.bill.items.reduce((sum, i) => sum + i.priceCents, 0) + s.bill.taxCents + s.bill.tipCents;
  return <section><div className="step-heading"><p className="eyebrow">A BITE FOR EVERYONE</p><h1>Who had what?</h1><p>{even ? "Everyone pays the same share of the whole bill." : "Tap the friends who shared each item. We’ll do the math."}</p></div>
    <div className="split-mode" role="group" aria-label="How to split">
      <button type="button" aria-pressed={!even} onClick={() => s.setSplitMode("items")}>By dish</button>
      <button type="button" aria-pressed={even} onClick={() => { setError(false); s.setSplitMode("even"); }}>Split evenly</button>
    </div>
    {even ? <div className="paper even-summary" role="status"><p>{money(total)} ÷ {s.bill.people.length} {s.bill.people.length === 1 ? "friend" : "friends"}</p><p className="muted">Tax and tip are included. Any leftover cents are spread one at a time, so shares differ by at most one cent.</p></div> : <>
      <p className="assignment-count" role="status">{assigned} of {s.bill.items.length} items assigned</p>
      {s.bill.items.map(item => {
        const everyone = s.bill.people.length > 0 && s.bill.people.every(p => item.personIds.includes(p.id));
        return <fieldset className={`paper assignment ${error && !item.personIds.length ? "unassigned" : ""}`} key={item.id} aria-label={`Assign ${item.name}`}><legend className="sr-only">Assign {item.name}</legend><div className="assignment-title"><h2>{item.name}{(item.quantity ?? 1) > 1 && <span className="item-qty-badge"> × {item.quantity}</span>}</h2><b>{money(item.priceCents)}</b></div><div className="person-options">{s.bill.people.map(p => <Button className={`person-chip ${personColor(p.id)}`} key={p.id} variant="outline" aria-pressed={item.personIds.includes(p.id)} onClick={() => s.togglePerson(item.id, p.id)}>{item.personIds.includes(p.id) && <span aria-hidden="true">✓ </span>}{p.name}</Button>)}</div><Button variant="ghost" className="everyone" aria-pressed={everyone} title={everyone ? "Tap again to clear" : undefined} onClick={() => s.toggleEveryone(item.id)}>{everyone && <span aria-hidden="true">✓ </span>}Everyone</Button>{!item.personIds.length && <p className="muted">Choose at least one friend</p>}</fieldset>;
      })}
      {error && assigned !== s.bill.items.length && <p className="notice" role="alert">Choose at least one friend for every item.</p>}
    </>}
    <div className="bottom-actions"><Button variant="outline" onClick={() => s.goTo("people")}>Back to friends</Button><Button onClick={() => { if (!even && assigned !== s.bill.items.length) setError(true); else s.goTo("result"); }}>See the split →</Button></div>
  </section>;
}
