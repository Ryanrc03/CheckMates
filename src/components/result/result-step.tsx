import { useState } from "react";
import { Copy, Check, Utensils } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBillStore } from "@/store/useBillStore";
import { splitBill } from "@/lib/split";
import { formatMoney } from "@/lib/money";
import { formatShareText } from "@/lib/share";
import { personColor } from "../people/people-step";
export function ResultStep({ onReset }: { onReset: () => void }) {
  const s = useBillStore(); const result = splitBill(s.bill); const text = formatShareText(result); const [copy, setCopy] = useState<"idle" | "copied" | "fallback">("idle");
  async function share() { try { await navigator.clipboard.writeText(text); setCopy("copied"); } catch { setCopy("fallback"); } }
  return <section><div className="step-heading result-heading"><div className="result-icon"><Utensils/></div><p className="eyebrow">GOOD TIMES. EVEN SPLITS.</p><h1>All split!</h1><p>Here’s everyone’s share of the good stuff.</p></div>
    <div className="result-shares">{result.people.map(p => <details className={`paper person-result ${personColor(p.id)}`} key={p.id} data-testid={`share-${p.name}`}><summary><span className="person-result-name">{p.name}<small>View breakdown</small></span><b>{formatMoney(p.totalCents)}</b></summary><dl><div><dt>Items</dt><dd>{formatMoney(p.itemsCents)}</dd></div><div><dt>Tax</dt><dd>{formatMoney(p.taxCents)}</dd></div><div><dt>Tip</dt><dd>{formatMoney(p.tipCents)}</dd></div></dl></details>)}</div>
    <div className="paper result-total"><div className="totals-line"><span>Items subtotal</span><span>{formatMoney(result.subtotalCents)}</span></div><div className="totals-line"><span>Tax</span><span>{formatMoney(result.taxCents)}</span></div><div className="totals-line"><span>Tip</span><span>{formatMoney(result.tipCents)}</span></div><div className="totals-line grand-total" data-testid="bill-total"><span>Bill total</span><b>{formatMoney(result.totalCents)}</b></div><p className="fine-print">Every cent accounted for. No payments processed.</p></div>
    {copy === "fallback" && <div className="notice"><p>Copy was unavailable. Select and copy your summary below.</p><textarea aria-label="Summary to copy" readOnly value={text} onFocus={e => e.target.select()} rows={10}/></div>}
    <p role="status" className="copy-status">{copy === "copied" ? "Copied! Ready to share with your friends." : ""}</p>
    <Button variant="ghost" onClick={onReset} className="new-bill">Start a new bill</Button>
    <div className="bottom-actions"><Button variant="outline" onClick={() => s.goTo("split")}>Edit assignments</Button><Button onClick={share}>{copy === "copied" ? <Check size={17}/> : <Copy size={17}/>} Copy summary</Button></div>
  </section>;
}
