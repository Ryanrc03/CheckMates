import type { CurrencyCode, PersonShare } from "@/types/bill";
import { DEFAULT_CURRENCY, formatMoney as format } from "@/lib/money";

export function ShareComposition({ share, maxTotalCents, currency = DEFAULT_CURRENCY }: { share: PersonShare; maxTotalCents: number; currency?: CurrencyCode }) {
  const formatMoney = (cents: number) => format(cents, currency);
  const amount = maxTotalCents === 0 ? 0 : share.totalCents / maxTotalCents * 100;
  const parts = [
    { label: "Items", cents: share.itemsCents, className: "composition-items" },
    { label: "Tax", cents: share.taxCents, className: "composition-tax" },
    { label: "Tip", cents: share.tipCents, className: "composition-tip" },
  ];
  return <div className="share-composition" aria-label={`Items ${formatMoney(share.itemsCents)}, tax ${formatMoney(share.taxCents)}, tip ${formatMoney(share.tipCents)}`}>
    <div className="composition-track" aria-hidden="true"><div className="composition-filled" style={{ width: `${amount}%` }}>
      {parts.map(part => <span key={part.label} className={part.className} style={{ width: `${share.totalCents === 0 ? 0 : part.cents / share.totalCents * 100}%` }}/>) }
    </div></div>
    <div className="composition-legend">{parts.map(part => <span key={part.label} className={part.className}><i aria-hidden="true"/>{part.label} {formatMoney(part.cents)}</span>)}</div>
  </div>;
}
