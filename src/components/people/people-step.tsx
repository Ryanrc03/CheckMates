import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useBillStore } from "@/store/useBillStore";
export function personColor(id: string) { let hash = 0; for (const c of id) hash = (hash * 31 + c.charCodeAt(0)) | 0; return ["mint", "peach", "lilac", "lemon"][Math.abs(hash) % 4]; }
export function PeopleStep() {
  const s = useBillStore(); const [name, setName] = useState(""); const [error, setError] = useState("");
  function add(e: FormEvent) { e.preventDefault(); if (!name.trim()) { setError("Enter your friend's name."); return; } s.addPerson(name); setName(""); setError(""); }
  return <section><div className="step-heading"><p className="eyebrow">THE MORE, THE MERRIER</p><h1>Who&apos;s in?</h1><p>Add everyone sharing this meal. Names can be changed anytime.</p></div>
    <form onSubmit={add} className="paper add-friend"><label htmlFor="friend-name">Friend&apos;s name</label><div className="row"><Input id="friend-name" value={name} placeholder="e.g. Alex" autoComplete="off" aria-invalid={!!error} onChange={e => setName(e.target.value)}/><Button type="submit">Add</Button></div>{error && <p role="alert" className="field-error">{error}</p>}</form>
    <div className="friends-list">{s.bill.people.map((p, i) => <div key={p.id} className={`friend-row ${personColor(p.id)}`}><span className="avatar" aria-hidden="true">{i + 1}</span><div className="friend-name-group"><span className="friend-visible-name">{p.name}</span><Input aria-label={`Rename ${p.name}`} defaultValue={p.name} key={`${p.id}-${p.name}`} onBlur={e => { if (e.target.value.trim()) s.renamePerson(p.id, e.target.value); else e.target.value = p.name; }} onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }}/></div><Button variant="ghost" aria-label={`Remove ${p.name}`} onClick={() => s.removePerson(p.id)}>Remove</Button></div>)}</div>
    {!s.bill.people.length && <p className="empty-state">There’s a seat for everyone. Add your first friend above.</p>}
    <p className="muted">{s.bill.people.length} {s.bill.people.length === 1 ? "friend" : "friends"} at the table</p>
    <div className="bottom-actions"><Button variant="outline" onClick={() => s.goTo("receipt")}>Back to receipt</Button><Button onClick={() => { if (!s.bill.people.length) setError("Add at least one friend."); else s.goTo("split"); }}>Assign items →</Button></div>
  </section>;
}
