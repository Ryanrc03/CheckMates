import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { getBundleStatus, removeBundle } from "@/lib/model-assets/bundles";
import type { BundleStatus, ModelBundleId } from "@/lib/model-assets/types";
import { useTranslationStore } from "@/store/useTranslationStore";
const BUNDLES: ModelBundleId[] = ["translate-enzh", "ocr-precise"];
const LABELS: Record<ModelBundleId, string> = { "translate-enzh": "translation model", "ocr-precise": "precise recognition model" };
const mb = (bytes: number) => `${Math.max(1, Math.round(bytes / 1_000_000))} MB`;
export function OfflineData() {
  const [rows, setRows] = useState<BundleStatus[] | null>(null); const [error, setError] = useState<string | null>(null); const [generation, setGeneration] = useState(0); // Remove bumps generation to reload; the lint rule set-state-in-effect rejects calling a local async refresh() from the effect
  useEffect(() => {
    let active = true;
    void Promise.all(BUNDLES.map(id => getBundleStatus(id))).then(statuses => { if (!active) return; setRows(statuses); setError(null); }).catch(() => { if (!active) return; setError("Offline data status is unavailable right now."); setRows([]); });
    return () => { active = false; };
  }, [generation]);
  return <details className="offline-data disclosure"><summary>Offline data<ChevronDown className="disclosure-icon" aria-hidden="true"/></summary>
    <p className="muted">Models are stored in this browser only and removed automatically after 14 days without use. iOS may also remove them after 7 days without use.</p>
    {error && <Notice tone="warning">{error}</Notice>}
    {rows?.map(row => <div className="offline-row" key={row.id}><span>{LABELS[row.id]} · {row.cached ? `Downloaded · ${mb(row.totalBytes)}` : "Not downloaded"}</span>
      {row.cached && <Button variant="outline" aria-label={`Remove ${LABELS[row.id]}`} onClick={async () => { await removeBundle(row.id); if (row.id === "translate-enzh") useTranslationStore.getState().forgetModel(); setGeneration(g => g + 1); }}>Remove</Button>}</div>)}
  </details>;
}
