"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { RotateCcw, Utensils } from "lucide-react";
import { Button } from "./ui/button";
import { Notice } from "./ui/notice";
import { useBillStore } from "@/store/useBillStore";
import { HomeStep } from "./home/home-step";
import { ReceiptStep } from "./receipt/receipt-step";
import { PhotoAdjustment } from "./receipt/photo-adjustment";
import { PeopleStep } from "./people/people-step";
import { SplitStep } from "./split/split-step";
import { ResultStep } from "./result/result-step";
import { recognizeReceipt, type OcrEngine } from "@/lib/ocr/client";
import { readEnginePreference, writeEnginePreference } from "@/lib/ocr/engine-preference";
import { parseReceiptEvidence } from "@/lib/ocr/retry";
import { parseReceiptText } from "@/lib/ocr/parseReceipt";
import type { ReceiptDraft } from "@/types/receipt";
import type { DishTranslation } from "@/lib/llm/to-draft";
import type { Adjustment } from "@/lib/receipt-image/render";
import { getTranslationService } from "@/lib/translation/service";
import { useTranslationStore } from "@/store/useTranslationStore";
import { purgeExpiredBundles } from "@/lib/model-assets/bundles";
const steps = ["home", "receipt", "people", "split", "result"] as const;
export function BillWizard() {
  const s = useBillStore(); const [photoUrl, setPhotoUrl] = useState<string | null>(null); const [adjusting, setAdjusting] = useState<File | null>(null); const [adjustUrl, setAdjustUrl] = useState<string | null>(null); const url = useRef<string | null>(null); const pendingUrl = useRef<string | null>(null); const file = useRef<File | null>(null);
  const enhancedScan = useRef(false);
  const request = useRef(0); const controller = useRef<AbortController | null>(null); const [adjustments, setAdjustments] = useState<Map<File, Adjustment>>(() => new Map());
  const saveAdjustment = useCallback((selected: File, value: Adjustment) => { setAdjustments(previous => { if (previous.get(selected) === value) return previous; const next = new Map(previous); next.set(selected, value); return next; }); }, []);
  const [busy, setBusy] = useState(false); const [stage, setStage] = useState(""); const [progress, setProgress] = useState<number | null>(null); const [error, setError] = useState<string | null>(null); const [draftVersion, setDraftVersion] = useState(0);
  const [engine, setEngine] = useState<OcrEngine>(() => readEnginePreference()); // the choice never reaches the server-rendered markup (the adjustment page needs a selected file), so reading storage in the initializer cannot mismatch hydration
  useEffect(() => { const generation = request; void useBillStore.getState().hydrate(); void purgeExpiredBundles().catch(() => {}); return () => { generation.current++; controller.current?.abort(); if (url.current) URL.revokeObjectURL(url.current); if (pendingUrl.current) URL.revokeObjectURL(pendingUrl.current); }; }, []);
  useEffect(() => { const heading = document.querySelector<HTMLElement>("main h1"); if (heading) { heading.tabIndex = -1; heading.focus(); } }, [s.step]);
  function cancel() { request.current++; controller.current?.abort(); controller.current = null; setBusy(false); setProgress(null); void getTranslationService().setOcrBusy(false); } // a cancelled or superseded recognition never reaches its own finally guard, so release translation here too
  function releasePhoto() { if (url.current) URL.revokeObjectURL(url.current); if (pendingUrl.current) URL.revokeObjectURL(pendingUrl.current); url.current = null; pendingUrl.current = null; file.current = null; setPhotoUrl(null); setAdjustUrl(null); setAdjusting(null); setAdjustments(new Map()); }
  function discardAdjustment() { if (pendingUrl.current) URL.revokeObjectURL(pendingUrl.current); pendingUrl.current = null; setAdjustUrl(null); setAdjusting(null); setError(null); }
  function commitPhoto(selected: File) { if (url.current) URL.revokeObjectURL(url.current); url.current = pendingUrl.current; pendingUrl.current = null; file.current = selected; setPhotoUrl(url.current); setAdjustUrl(null); }
  async function recognizePrepared(image: Blob, selected: File) {
    cancel(); const id = ++request.current; const abort = new AbortController(); controller.current = abort;
    const replacing = useBillStore.getState().step === "receipt";
    setBusy(true); setError(null); setStage("Reading your receipt"); setProgress(null); setAdjusting(null);
    try {
      await getTranslationService().setOcrBusy(true); // frees the translation engine before OCR; released in finally or by cancel()
      if (!replacing) commitPhoto(selected);
      const onProgress = (message: string, value: number | null) => { if (id === request.current) { setStage(message); setProgress(value); } };
      let draft: ReceiptDraft; let translations: DishTranslation[] = [];
      if (engine === "cloud") { const { recognizeWithCloud } = await import("@/lib/llm/recognize").catch(() => { throw new Error("Could not load cloud recognition. Check your connection, or choose Standard or Precise."); }); ({ draft, translations } = await recognizeWithCloud(image, { signal: abort.signal, onProgress })); }
      else draft = parseReceiptEvidence(await recognizeReceipt(image, { signal: abort.signal, enhanced: enhancedScan.current, engine, onProgress }));
      if (id !== request.current) return;
      if (replacing) commitPhoto(selected);
      else useBillStore.getState().startBill("photo", selected.name);
      useBillStore.getState().setReceiptDraft(draft); useTranslationStore.getState().clearForBill(); setDraftVersion(v => v + 1);
      if (translations.length) { getTranslationService().seed(translations); useTranslationStore.getState().setEnabled(true); } // cloud names come with the draft; the receipt step's translation request then reads them from the cache
    } catch (failure) {
      if (id === request.current && !abort.signal.aborted) { if (replacing) discardAdjustment(); setError(failure instanceof Error ? failure.message : "Recognition failed. Try again or enter items manually."); }
    } finally { if (id === request.current) { setBusy(false); controller.current = null; void getTranslationService().setOcrBusy(false); } }
  }
  function selectForAdjustment(selected: File, enhanced = false) {
    enhancedScan.current = enhanced;
    const saved = useBillStore.getState();
    if (saved.step === "home" && saved.source === "photo" && saved.receiptDraft) saved.goTo("receipt");
    cancel(); if (pendingUrl.current) URL.revokeObjectURL(pendingUrl.current); pendingUrl.current = URL.createObjectURL(selected); setAdjustUrl(pendingUrl.current); setError(null); setAdjusting(selected);
  }
  async function confirmAdjustment(image: Blob) {
    const selected = adjusting;
    if (!selected) return;
    if (s.step === "receipt" && !window.confirm("Recognize again? This replaces the current receipt edits with a new draft.")) return;
    await recognizePrepared(image, selected);
  }
  function attach(selected: File) { selectForAdjustment(selected); }
  function reset() { cancel(); releasePhoto(); enhancedScan.current = false; setStage(""); setError(null); setDraftVersion(v => v + 1); useTranslationStore.getState().cancel(); useTranslationStore.getState().clearForBill(); s.resetBill(); }
  const adjustingPhoto = !!(adjusting && adjustUrl); const current = adjustingPhoto ? 0 : steps.indexOf(s.step); const withBar = s.hasHydrated && (adjustingPhoto || s.step !== "home");
  return <div className={`app-shell${withBar ? " has-bottom-bar" : ""}`}><header className="brand-header"><div className="brand-header-inner"><div className="brand"><span className="brand-mark"><Utensils size={20} aria-hidden="true"/></span>CheckMates<span className="brand-dot">.</span></div><div className="header-actions"><span className="header-note">A fair share of a good time.</span><Button type="button" variant="outline" className="reset-bill" disabled={!s.hasHydrated} onClick={reset} title="Clear the current bill and start again"><RotateCcw aria-hidden="true"/> Reset bill</Button></div></div></header>
    <main className="wizard-main">
      {!s.hasHydrated ? <p role="status">Getting your table ready…</p> : <>
        <nav aria-label="Bill progress" className="step-progress">{["Start", "Receipt", "Friends", "Split", "Result"].map((label, i) => <div key={label} aria-current={i === current ? "step" : undefined} className={i <= current ? "active" : ""}><span>{i + 1}</span><small>{label}</small></div>)}</nav>
        {adjusting && adjustUrl ? <PhotoAdjustment key={adjustUrl} file={adjusting} originalUrl={adjustUrl} initialAdjustment={adjustments.get(adjusting)} engine={engine} onEngineChange={next => { setEngine(next); writeEnginePreference(window.localStorage, next); }} onAdjustmentChange={saveAdjustment} onSelect={selectForAdjustment} onConfirm={image => void confirmAdjustment(image)} onBack={discardAdjustment} onManual={() => { if (s.step === "receipt" && !window.confirm("Enter items manually? This replaces the current receipt edits with a blank draft.")) return; commitPhoto(adjusting); setAdjusting(null); s.startBill("photo", adjusting.name); s.setReceiptDraft(parseReceiptText("")); useTranslationStore.getState().clearForBill(); setDraftVersion(v => v + 1); }}/> : <>
          {s.storageError && <Notice tone="warning" role="status">{s.storageError}</Notice>}{s.error && <Notice tone="error" role="alert">{s.error}</Notice>}{error && s.step !== "home" && <Notice tone="error" role="alert">{error}</Notice>}
          {s.step === "home" && <HomeStep cloud={engine === "cloud"} busy={busy} stage={stage} progress={progress} error={error} hasPhoto={!!photoUrl} onCancel={cancel} onRetry={() => selectForAdjustment(file.current!)} onPhotoSelected={selectForAdjustment} onDemo={() => { cancel(); releasePhoto(); setError(null); useTranslationStore.getState().clearForBill(); s.startBill("demo"); }} onManual={() => { cancel(); if (s.source !== "photo") s.startBill("photo"); s.setReceiptDraft(parseReceiptText("")); useTranslationStore.getState().clearForBill(); setDraftVersion(v => v + 1); }}
          />}
          {s.step === "receipt" && <ReceiptStep key={draftVersion} photoUrl={photoUrl} onAttach={attach} onRotate={() => { if (file.current) selectForAdjustment(file.current); }} onRecognize={enhanced => { if (file.current) selectForAdjustment(file.current, enhanced); }} busy={busy} stage={stage} cloud={engine === "cloud"} onCancel={() => { cancel(); if (pendingUrl.current) discardAdjustment(); }}/>}
          {s.step === "people" && <PeopleStep/>}{s.step === "split" && <SplitStep/>}{s.step === "result" && <ResultStep onReset={reset}/>}
        </>}
      </>}
    </main><footer className="site-footer">Made for meals worth sharing.</footer>
  </div>;
}
