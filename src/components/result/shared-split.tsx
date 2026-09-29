import { Utensils } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";
import type { SharedSplit } from "@/lib/share-link";
import { ShareComposition } from "./share-composition";
import { personColor } from "../people/people-step";

/** Read-only view of a split opened from a link; it never touches the viewer's own saved bill. */
export function SharedSplitView({ shared, onClose }: { shared: SharedSplit; onClose: () => void }) {
  const { result, currency } = shared; const money = (cents: number) => formatMoney(cents, currency);
  const maxTotalCents = Math.max(...result.people.map(person => person.totalCents));
  return <section><div className="step-heading result-heading"><div className="result-icon"><Utensils/></div><p className="eyebrow">SHARED WITH YOU</p><h1>Here’s the split</h1><p>Amounts owed from a shared meal. No payments are processed.</p></div>
    <div className="result-shares">{result.people.map(p => <div className={`paper person-result shared-person ${personColor(p.id)}`} key={p.id} data-testid={`shared-${p.name}`}><span className="result-summary"><span className="result-summary-heading"><span className="person-result-name">{p.name}</span><b>{money(p.totalCents)}</b></span><ShareComposition share={p} maxTotalCents={maxTotalCents} currency={currency}/></span></div>)}</div>
    <div className="paper result-total"><div className="totals-line"><span>Items subtotal</span><span>{money(result.subtotalCents)}</span></div><div className="totals-line"><span>Tax</span><span>{money(result.taxCents)}</span></div><div className="totals-line"><span>Tip</span><span>{money(result.tipCents)}</span></div><div className="totals-line grand-total" data-testid="shared-total"><span>Bill total</span><b>{money(result.totalCents)}</b></div><p className="fine-print">Every cent accounted for.</p></div>
    <div className="bottom-actions"><Button onClick={onClose}>Split your own bill →</Button></div>
  </section>;
}
