import { useRef, useState, type FormEvent } from "react";
import { ArrowRight, Check, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useBillStore } from "@/store/useBillStore";
import { personColor, personInitial } from "./person-style";
export function PeopleStep() {
  const s = useBillStore(); const [name, setName] = useState(""); const [error, setError] = useState(""); const [editing, setEditing] = useState<string | null>(null); const cancelled = useRef(false);
  function add(e: FormEvent) { e.preventDefault(); if (!name.trim()) { setError("Enter your friend's name."); return; } s.addPerson(name); setName(""); setError(""); }
  // Blur commits (an empty name keeps the old one), Escape cancels; focus returns to the pencil unless the user already moved it elsewhere.
  function finishEdit(id: string, value: string) { if (!cancelled.current && value.trim()) s.renamePerson(id, value); cancelled.current = false; setEditing(null); requestAnimationFrame(() => { if (document.activeElement === document.body) document.getElementById(`rename-${id}`)?.focus(); }); }
  return <section><div className="step-heading"><p className="eyebrow">THE MORE, THE MERRIER</p><h1>Who&apos;s in?</h1><p>Add everyone sharing this meal. Names can be changed anytime.</p></div>
    <form onSubmit={add} className="paper add-friend"><label className="field-label" htmlFor="friend-name">Friend&apos;s name</label><div className="row"><Input id="friend-name" className="flex-1" value={name} placeholder="e.g. Alex" autoComplete="off" aria-invalid={!!error} onChange={e => setName(e.target.value)}/><Button type="submit" variant="outline"><Plus aria-hidden="true"/> Add</Button></div>{error && <p role="alert" className="field-error">{error}</p>}</form>
    <div className="friends-list">{s.bill.people.map((p, i) => <div key={p.id} className={`friend-row ${personColor(i)}`}>
      <span className="avatar" aria-hidden="true">{personInitial(p.name)}</span>
      {editing === p.id ? <>
        <Input autoFocus aria-label={`New name for ${p.name}`} defaultValue={p.name} className="flex-1 border-muted-foreground" onFocus={e => e.currentTarget.select()} onBlur={e => finishEdit(p.id, e.currentTarget.value)} onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); else if (e.key === "Escape") { cancelled.current = true; e.currentTarget.blur(); } }}/>
        <Button type="button" variant="ghost" size="icon" className="text-success" aria-label="Save name" onPointerDown={e => e.preventDefault()} onClick={() => (document.activeElement as HTMLElement | null)?.blur()}><Check aria-hidden="true"/></Button>
      </> : <>
        <span className="friend-visible-name">{p.name}</span>
        <Button id={`rename-${p.id}`} type="button" variant="ghost" size="icon" className="text-muted-foreground" aria-label={`Rename ${p.name}`} onClick={() => setEditing(p.id)}><Pencil aria-hidden="true"/></Button>
      </>}
      <Button type="button" variant="ghost" size="icon" className="text-muted-foreground" aria-label={`Remove ${p.name}`} onClick={() => s.removePerson(p.id)}><Trash2 aria-hidden="true"/></Button>
    </div>)}</div>
    {!s.bill.people.length && <p className="empty-state">There’s a seat for everyone. Add your first friend above.</p>}
    <p className="muted">{s.bill.people.length} {s.bill.people.length === 1 ? "friend" : "friends"} at the table</p>
    <div className="bottom-actions"><div className="bottom-actions-inner"><Button variant="outline" onClick={() => s.goTo("receipt")}>Back to receipt</Button><Button onClick={() => { if (!s.bill.people.length) setError("Add at least one friend."); else s.goTo("split"); }}>Assign items <ArrowRight aria-hidden="true"/></Button></div></div>
  </section>;
}
