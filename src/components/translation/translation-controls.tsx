import { useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { useTranslationStore } from "@/store/useTranslationStore";
import type { TranslationItem } from "@/lib/translation/types";
const mb = (bytes: number) => `${Math.max(1, Math.round(bytes / 1_000_000))} MB`;
export function TranslationControls({ items }: { items: TranslationItem[] }) {
  const s = useTranslationStore(); const key = useMemo(() => JSON.stringify(items.map(i => [i.id, i.name])), [items]);
  const request = s.request; const enabled = s.enabled;
  useEffect(() => { if (!enabled) return; const timer = setTimeout(() => { void request((JSON.parse(key) as [string, string][]).map(([id, name]) => ({ id, name }))); }, 300); return () => clearTimeout(timer); }, [enabled, key, request]);
  const stage = s.progress?.stage; const percent = s.progress?.totalBytes ? Math.round((s.progress.loadedBytes ?? 0) / s.progress.totalBytes * 100) : null;
  return <div className="translation-controls">
    <label className="switch-row"><input type="checkbox" role="switch" className="switch" aria-checked={s.enabled} checked={s.enabled} onChange={e => s.setEnabled(e.target.checked)}/> Show Chinese names</label>
    {s.enabled && s.needsDownload && <Notice tone="info" className="translation-download"><p>Some names are not in the built-in glossary. Translate them with the on-device model? One-time download of {mb(s.downloadBytes)}; nothing leaves this phone.</p><div className="notice-actions"><Button type="button" variant="outline" onClick={() => void s.allowModelAndRequest(items)}>Download and translate</Button><span className="muted">Not now — glossary matches stay visible</span></div></Notice>}
    {s.enabled && s.busy && <div role="status" aria-live="polite" className="translation-status"><p>{stage === "downloading" ? `Downloading translation model${percent !== null ? ` · ${percent}%` : ""}` : stage === "initializing" ? "Starting translation model" : stage === "translating" ? `Translating ${s.progress?.completedItems ?? 0} of ${s.progress?.totalItems ?? 0}` : stage === "queued" ? "Waiting for recognition to finish" : "Translating…"}</p>{(stage === "downloading" || stage === "initializing" || stage === "translating" || stage === "queued") && <Button type="button" variant="outline" onClick={() => s.cancel()}>Cancel</Button>}</div>}
    {s.enabled && s.error && <Notice tone="error" role="alert">{s.error} <Button type="button" variant="ghost" onClick={() => void s.allowModelAndRequest(items)}>Retry</Button></Notice>}
    {s.enabled && s.modelUnavailableReason && !s.busy && <p className="muted">On-device model unavailable in this browser; only glossary matches are shown.</p>}
    {s.enabled && <p className="fine-print">Machine translation for reference only. Original names stay as printed.</p>}
  </div>;
}
