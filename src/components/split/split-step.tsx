import { allocationPersonIds } from "@/lib/item-allocation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useBillStore } from "@/store/useBillStore";
import { formatMoney } from "@/lib/money";
import { personColor } from "../people/people-step";
export function SplitStep() {
  const s = useBillStore(); const [error, setError] = useState(false); const assigned = s.bill.items.filter(i => allocationPersonIds(i.allocation).length).length;
  return <section><div className="step-heading"><p className="eyebrow">A BITE FOR EVERYONE</p><h1>Who had what?</h1><p>Tap the friends who shared each item. We’ll do the math.</p></div><p className="assignment-count" role="status">{assigned} of {s.bill.items.length} items assigned</p>
    {s.bill.items.map(item => <fieldset className={`paper assignment ${error && !allocationPersonIds(item.allocation).length ? "unassigned" : ""}`} key={item.id} aria-label={`Assign ${item.name}`}><legend className="sr-only">Assign {item.name}</legend><div className="assignment-title"><h2>{item.name}</h2><b>{formatMoney(item.priceCents)}</b></div><div className="person-options">{s.bill.people.map(p => <Button className={`person-chip ${personColor(p.id)}`} key={p.id} variant="outline" aria-pressed={allocationPersonIds(item.allocation).includes(p.id)} onClick={() => s.togglePerson(item.id, p.id)}>{allocationPersonIds(item.allocation).includes(p.id) && <span aria-hidden="true">✓ </span>}{p.name}</Button>)}</div><Button variant="ghost" className="everyone" onClick={() => s.assignEveryone(item.id)}>Everyone</Button>{!allocationPersonIds(item.allocation).length && <p className="muted">Choose at least one friend</p>}</fieldset>)}
    {error && assigned !== s.bill.items.length && <p className="notice" role="alert">Choose at least one friend for every item.</p>}
    <div className="bottom-actions"><Button variant="outline" onClick={() => s.goTo("people")}>Back to friends</Button><Button onClick={() => { if (assigned !== s.bill.items.length) setError(true); else s.goTo("result"); }}>See the split →</Button></div>
  </section>;
}
