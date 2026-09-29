"use client";
import { useEffect, useRef, useState } from "react";
import { Utensils } from "lucide-react";
import { useBillStore } from "@/store/useBillStore";
import { HomeStep } from "./home/home-step";
import { ReceiptStep } from "./receipt/receipt-step";
import { PhotoAdjustment } from "./receipt/photo-adjustment";
import { PeopleStep } from "./people/people-step";
import { SplitStep } from "./split/split-step";
import { ResultStep } from "./result/result-step";
import { recognizeReceipt } from "@/lib/ocr/client";
import { parseReceiptText } from "@/lib/ocr/parseReceipt";
const steps = ["home", "receipt", "people", "split", "result"] as const;
export function BillWizard() {
  const s = useBillStore(); const [photoUrl, setPhotoUrl] = useState<string | null>(null); const [adjusting, setAdjusting] = useState<File | null>(null); const [adjustUrl, setAdjustUrl] = useState<string | null>(null); const url = useRef<string | null>(null); const pendingUrl = useRef<string | null>(null); const file = useRef<File | null>(null);
  const request = useRef(0); const controller = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false); const [stage, setStage] = useState(""); const [progress, setProgress] = useState<number | null>(null); const [error, setError] = useState<string | null>(null); const [draftVersion, setDraftVersion] = useState(0);
  useEffect(() => { const generation = request; void useBillStore.getState().hydrate(); return () => { generation.current++; controller.current?.abort(); if (url.current) URL.revokeObjectURL(url.current); if (pendingUrl.current) URL.revokeObjectURL(pendingUrl.current); }; }, []);
  useEffect(() => { const heading = document.querySelector<HTMLElement>("main h1"); if (heading) { heading.tabIndex = -1; heading.focus(); } }, [s.step]);
  function cancel() { request.current++; controller.current?.abort(); controller.current = null; setBusy(false); setProgress(null); }
  function releasePhoto() { if (url.current) URL.revokeObjectURL(url.current); if (pendingUrl.current) URL.revokeObjectURL(pendingUrl.current); url.current = null; pendingUrl.current = null; file.current = null; setPhotoUrl(null); setAdjustUrl(null); setAdjusting(null); }
  function discardAdjustment() { if (pendingUrl.current) URL.revokeObjectURL(pendingUrl.current); pendingUrl.current = null; setAdjustUrl(null); setAdjusting(null); setError(null); }
  function commitPhoto(selected: File) { if (url.current) URL.revokeObjectURL(url.current); url.current = pendingUrl.current; pendingUrl.current = null; file.current = selected; setPhotoUrl(url.current); setAdjustUrl(null); }
  async function recognizePrepared(image: Blob, selected: File, newBill: boolean) {
    cancel(); const id = ++request.current; const abort = new AbortController(); controller.current = abort;
    setBusy(true); setError(null); setStage("Reading your receipt"); setProgress(null); setAdjusting(null);
    try {
      if (newBill) useBillStore.getState().startBill("photo", selected.name);
      const result = await recognizeReceipt(image, { signal: abort.signal, onProgress: (message, value) => { if (id === request.current) { setStage(message); setProgress(value); } } });
      if (id !== request.current) return;
      const draft = parseReceiptText(result.text);
      if (result.confidence < 60) draft.warnings.push("Recognition confidence is low. Compare every line with the photo.");
      useBillStore.getState().setReceiptDraft(draft); setDraftVersion(v => v + 1);
    } catch (failure) {
      if (id === request.current && !abort.signal.aborted) setError(failure instanceof Error ? failure.message : "Recognition failed. Try again or enter items manually.");
    } finally { if (id === request.current) { setBusy(false); controller.current = null; } }
  }
  function selectForAdjustment(selected: File) {
    cancel(); if (pendingUrl.current) URL.revokeObjectURL(pendingUrl.current); pendingUrl.current = URL.createObjectURL(selected); setAdjustUrl(pendingUrl.current); setError(null); setAdjusting(selected);
  }
  async function confirmAdjustment(image: Blob) {
    const selected = adjusting;
    if (!selected) return;
    if (s.step === "receipt" && !window.confirm("Recognize again? This replaces the current receipt edits with a new draft.")) return;
    commitPhoto(selected);
    await recognizePrepared(image, selected, true);
  }
  function attach(selected: File) { selectForAdjustment(selected); }
  function reset() { cancel(); releasePhoto(); setError(null); s.resetBill(); }
  return <div className="app-shell"><header className="brand-header"><div className="brand"><span><Utensils size={21}/></span>CheckMates<span className="brand-dot">.</span></div><span className="header-note">A fair share of a good time.</span></header>
    <main className="wizard-main">
      {!s.hasHydrated ? <p role="status">Getting your table ready…</p> : adjusting && adjustUrl ? <PhotoAdjustment key={adjustUrl} file={adjusting} originalUrl={adjustUrl} onSelect={selectForAdjustment} onConfirm={image => void confirmAdjustment(image)} onBack={discardAdjustment} onManual={() => { commitPhoto(adjusting); setAdjusting(null); if (s.source !== "photo") s.startBill("photo"); s.setReceiptDraft(parseReceiptText("")); setDraftVersion(v => v + 1); }}/> : <>
        <nav aria-label="Bill progress" className="step-progress">{["Start", "Receipt", "Friends", "Split", "Result"].map((label, i) => <div key={label} aria-current={s.step === steps[i] ? "step" : undefined} className={i <= steps.indexOf(s.step) ? "active" : ""}><span>{i + 1}</span><small>{label}</small></div>)}</nav>
        {s.storageError && <p className="notice" role="status">{s.storageError}</p>}{s.error && <p className="notice" role="alert">{s.error}</p>}{error && s.step !== "home" && <p className="notice" role="alert">{error}</p>}
        {s.step === "home" && <HomeStep busy={busy} stage={stage} progress={progress} error={error} hasPhoto={!!photoUrl} onCancel={cancel} onRetry={() => selectForAdjustment(file.current!)} onPhotoSelected={selectForAdjustment} onDemo={() => { cancel(); releasePhoto(); setError(null); s.startBill("demo"); }} onManual={() => { cancel(); if (s.source !== "photo") s.startBill("photo"); s.setReceiptDraft(parseReceiptText("")); setDraftVersion(v => v + 1); }}
        />}
        {s.step === "receipt" && <ReceiptStep key={draftVersion} photoUrl={photoUrl} onAttach={attach} onRotate={() => { if (file.current) selectForAdjustment(file.current); }} onRecognize={() => { if (file.current) selectForAdjustment(file.current); }} busy={busy} stage={stage} onCancel={cancel}/>}
        {s.step === "people" && <PeopleStep/>}{s.step === "split" && <SplitStep/>}{s.step === "result" && <ResultStep onReset={reset}/>}
      </>}
    </main><footer className="site-footer">Made for meals worth sharing.</footer>
  </div>;
}
