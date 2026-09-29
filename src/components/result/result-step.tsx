import { useState } from "react";
import { Copy, Check, Utensils, Link2, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBillStore } from "@/store/useBillStore";
import { explainSplitBill } from "@/lib/split";
import { DEFAULT_CURRENCY, formatMoney } from "@/lib/money";
import { formatShareText } from "@/lib/share";
import { shareUrl } from "@/lib/share-link";
import { personColor } from "../people/people-step";
import { PersonBreakdown } from "./person-breakdown";
import { ShareComposition } from "./share-composition";
import { ShareQr } from "./share-qr";
export function ResultStep({ onReset }: { onReset: () => void }) {
  const s = useBillStore(); const breakdown = explainSplitBill(s.bill); const result = breakdown.result; const currency = s.bill.currency ?? DEFAULT_CURRENCY; const money = (cents: number) => formatMoney(cents, currency);
  const link = typeof window === "undefined" ? "" : shareUrl(window.location.href, result, currency);
  const text = formatShareText(result, currency, link || undefined); const [copy, setCopy] = useState<"idle" | "copied" | "fallback">("idle"); const [linkCopy, setLinkCopy] = useState<"idle" | "copied" | "fallback">("idle");
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const maxTotalCents = Math.max(...result.people.map(person => person.totalCents));
  async function share() { try { await navigator.clipboard.writeText(text); setCopy("copied"); } catch { setCopy("fallback"); } }
  async function copyLink() { try { await navigator.clipboard.writeText(link); setLinkCopy("copied"); } catch { setLinkCopy("fallback"); } }
  async function nativeShare() { try { await navigator.share({ title: "CheckMates split", text: formatShareText(result, currency), url: link }); } catch { /* dismissed or unavailable; the link and QR remain */ } }
  return <section><div className="step-heading result-heading"><div className="result-icon"><Utensils/></div><p className="eyebrow">GOOD TIMES. EVEN SPLITS.</p><h1>All split!</h1><p>{s.bill.splitMode === "even" ? `The whole bill, divided evenly ${result.people.length} ways.` : "Here’s everyone’s share of the good stuff."}</p></div>
    <div className="result-shares">{result.people.map(p => <details className={`paper person-result ${personColor(p.id)}`} key={p.id} data-testid={`share-${p.name}`}><summary><span className="result-summary"><span className="result-summary-heading"><span className="person-result-name">{p.name}<small>View breakdown</small></span><b>{money(p.totalCents)}</b></span><ShareComposition share={p} maxTotalCents={maxTotalCents} currency={currency}/></span></summary><PersonBreakdown personId={p.id} breakdown={breakdown} people={s.bill.people} currency={currency}/></details>)}</div>
    <div className="paper result-total"><div className="totals-line"><span>Items subtotal</span><span>{money(result.subtotalCents)}</span></div><div className="totals-line"><span>Tax</span><span>{money(result.taxCents)}</span></div><div className="totals-line"><span>Tip</span><span>{money(result.tipCents)}</span></div><div className="totals-line grand-total" data-testid="bill-total"><span>Bill total</span><b>{money(result.totalCents)}</b></div><p className="allocation-difference">Allocation difference {money(result.totalCents - result.people.reduce((sum, person) => sum + person.totalCents, 0))}</p><p className="fine-print">Every cent accounted for. No payments processed.</p></div>
    {link && <div className="paper share-panel"><h2>Send it to the table</h2><p className="muted">Anyone with this link sees the final amounts. Everything is inside the link itself; nothing is uploaded.</p>
      <details className="qr-details"><summary>Show QR code</summary><ShareQr value={link} label="QR code for the split link"/><p className="muted">Friends can scan this with their phone camera.</p></details>
      <div className="share-actions"><Button variant="outline" onClick={copyLink}>{linkCopy === "copied" ? <Check size={17}/> : <Link2 size={17}/>} {linkCopy === "copied" ? "Link copied" : "Copy link"}</Button>{canShare && <Button variant="outline" onClick={nativeShare}><Share2 size={17}/> Share…</Button>}</div>
      {linkCopy === "fallback" && <label className="link-fallback">Copy was unavailable. Select the link below.<input aria-label="Split link" readOnly value={link} onFocus={e => e.target.select()}/></label>}
    </div>}
    {copy === "fallback" && <div className="notice"><p>Copy was unavailable. Select and copy your summary below.</p><textarea aria-label="Summary to copy" readOnly value={text} onFocus={e => e.target.select()} rows={10}/></div>}
    <p role="status" className="copy-status">{copy === "copied" ? "Copied! Ready to share with your friends." : ""}</p>
    <Button variant="ghost" onClick={onReset} className="new-bill">Start a new bill</Button>
    <div className="bottom-actions"><Button variant="outline" onClick={() => s.goTo("split")}>{s.bill.splitMode === "even" ? "Change split" : "Edit assignments"}</Button><Button onClick={share}>{copy === "copied" ? <Check size={17}/> : <Copy size={17}/>} Copy summary</Button></div>
  </section>;
}
