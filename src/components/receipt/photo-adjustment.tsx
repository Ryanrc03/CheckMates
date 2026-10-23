/* eslint-disable @next/next/no-img-element -- both previews are local browser blob URLs */
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { PhotoInput } from "@/components/home/home-step";
import type { OcrEngine } from "@/lib/ocr/client";
import { cloudConfig } from "@/lib/llm/config";
import type { Analysis } from "@/lib/receipt-image/analyze";
import { isValidQuad, type Point, type Quad } from "@/lib/receipt-image/geometry";
import { correctionBlob, renderCorrection, type Adjustment } from "@/lib/receipt-image/render";
import { residualTextAngle } from "@/lib/receipt-image/suggest";

const fullCorners: Quad = [{ x: 0.01, y: 0.01 }, { x: 0.99, y: 0.01 }, { x: 0.99, y: 0.99 }, { x: 0.01, y: 0.99 }];
const cornerNames = ["Top left", "Top right", "Bottom right", "Bottom left"];

export function PhotoAdjustment({ file, originalUrl, initialAdjustment, engine, onEngineChange, onAdjustmentChange, onSelect, onConfirm, onBack, onManual }: {
  file: File; originalUrl: string; initialAdjustment?: Adjustment; engine: OcrEngine; onEngineChange: (engine: OcrEngine) => void; onAdjustmentChange: (file: File, value: Adjustment) => void; onSelect: (file: File) => void; onConfirm: (image: Blob) => void; onBack: () => void; onManual: () => void;
}) {
  const cloud = cloudConfig() !== null;
  const [image, setImage] = useState<ImageBitmap | null>(null);
  const [adjustment, setAdjustment] = useState<Adjustment>(initialAdjustment ?? { corners: null, angle: 0, quarterTurns: 0 });
  const [analysisStatus, setAnalysisStatus] = useState(initialAdjustment ? "Previous adjustment loaded. Check the preview." : "Analyzing this photo…");
  const [orientedUrl, setOrientedUrl] = useState<string | null>(null);
  const [correctedUrl, setCorrectedUrl] = useState<string | null>(null);
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const [loadedPreviewUrl, setLoadedPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const imageRef = useRef<ImageBitmap | null>(null);
  const generation = useRef(0);
  const userEdited = useRef(Boolean(initialAdjustment));
  const adjustmentKey = JSON.stringify(adjustment);
  const previewReady = previewKey === adjustmentKey && !!correctedUrl && loadedPreviewUrl === correctedUrl;
  const fileError = !["image/jpeg", "image/png", "image/webp"].includes(file.type) ? "Choose a JPEG, PNG, or WebP photo. HEIC and PDF are not supported." : file.size > 15 * 1024 * 1024 ? "This photo exceeds 15 MiB. Resize it or choose a smaller photo." : null;

  useEffect(() => { onAdjustmentChange(file, adjustment); }, [adjustment, file, onAdjustmentChange]);

  useEffect(() => {
    let active = true;
    if (fileError) return;
    const bitmapRef = imageRef, lifetime = generation;
    void createImageBitmap(file, { imageOrientation: "from-image" }).then(bitmap => {
      if (!active) { bitmap.close(); return; }
      bitmapRef.current = bitmap; setImage(bitmap);
    }).catch(() => { if (active) setError("This image could not be opened. Export it as JPEG or PNG and try again."); });
    return () => { active = false; lifetime.current++; bitmapRef.current?.close(); bitmapRef.current = null; };
  }, [file, fileError]);

  useEffect(() => {
    if (!image || userEdited.current) return;
    let active = true;
    let worker: Worker | null = null;
    try {
      const oriented = renderCorrection(image, { corners: null, angle: 0, quarterTurns: adjustment.quarterTurns }, 1024 * 1024);
      const bitmap = oriented.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, oriented.width, oriented.height);
      worker = new Worker(new URL("../../lib/receipt-image/analyze.worker.ts", import.meta.url), { type: "module" });
      worker.onmessage = (event: MessageEvent<{ analysis?: Analysis; error?: string }>) => {
        if (!active || userEdited.current) return;
        if (!event.data.analysis) { setAnalysisStatus("Automatic correction is unavailable. You can adjust the photo or use the original."); setError(event.data.error ?? "Photo analysis failed."); return; }
        const analysis = event.data.analysis;
        setAdjustment(previous => ({ ...previous, corners: analysis.corners, angle: residualTextAngle(analysis, bitmap.width, bitmap.height) }));
        setAnalysisStatus(analysis.boundaryReliable ? "Page edges found. Check that every line is inside the corners." : analysis.angleReliable ? Math.abs(analysis.angle) < 0.5 ? "The photo appears straight. Check the preview before recognition." : `Suggested tilt correction: ${analysis.angle.toFixed(1)}°. Check the preview.` : "Automatic correction is uncertain. Adjust the corners or use the original photo.");
      };
      worker.onerror = () => { if (active) { setAnalysisStatus("Automatic correction is unavailable. You can adjust the photo or use the original."); setError("Photo analysis failed."); } };
      worker.postMessage({ width: bitmap.width, height: bitmap.height, data: bitmap.data }, [bitmap.data.buffer]);
    } catch (failure) {
      queueMicrotask(() => { if (active) { setAnalysisStatus("Automatic correction is unavailable. You can adjust the photo or use the original."); setError(failure instanceof Error ? failure.message : "Photo analysis failed."); } });
    }
    return () => { active = false; worker?.terminate(); };
  }, [image, adjustment.quarterTurns]);

  useEffect(() => {
    if (!image) return;
    let active = true;
    const key = JSON.stringify(adjustment);
    const timer = setTimeout(() => {
      try {
        void Promise.all([
          correctionBlob(renderCorrection(image, { corners: null, angle: 0, quarterTurns: adjustment.quarterTurns }, 1024 * 1024)),
          correctionBlob(renderCorrection(image, adjustment, 1024 * 1024)),
        ]).then(([source, corrected]) => {
          if (!active) return;
          setOrientedUrl(previous => { if (previous) URL.revokeObjectURL(previous); return URL.createObjectURL(source); });
          setCorrectedUrl(previous => { if (previous) URL.revokeObjectURL(previous); return URL.createObjectURL(corrected); });
          setPreviewKey(key);
        }).catch(failure => { if (active) setError(failure instanceof Error ? failure.message : "Could not preview this photo."); });
      } catch (failure) { if (active) setError(failure instanceof Error ? failure.message : "Could not preview this photo."); }
    }, 100);
    return () => { active = false; clearTimeout(timer); };
  }, [image, adjustment]);

  useEffect(() => () => { if (orientedUrl) URL.revokeObjectURL(orientedUrl); if (correctedUrl) URL.revokeObjectURL(correctedUrl); }, [orientedUrl, correctedUrl]);

  function changeCorner(index: number, point: Point) {
    const corners = adjustment.corners ?? fullCorners;
    const candidate = corners.map((value, position) => position === index ? point : value) as Quad;
    if (!isValidQuad(candidate)) { setError("Corners cannot overlap or leave the photo. Adjust this corner again."); return; }
    userEdited.current = true; setAnalysisStatus("Manual adjustment selected. Check the preview.");
    setError(null); setAdjustment(previous => ({ ...previous, corners: candidate }));
  }
  function dragCorner(event: PointerEvent<HTMLButtonElement>, index: number) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const bounds = event.currentTarget.parentElement!.getBoundingClientRect();
    changeCorner(index, { x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)), y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)) });
  }
  function moveCorner(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const move: Record<string, Point> = { ArrowLeft: { x: -0.01, y: 0 }, ArrowRight: { x: 0.01, y: 0 }, ArrowUp: { x: 0, y: -0.01 }, ArrowDown: { x: 0, y: 0.01 } };
    const delta = move[event.key]; if (!delta) return;
    event.preventDefault();
    const current = (adjustment.corners ?? fullCorners)[index];
    changeCorner(index, { x: Math.max(0, Math.min(1, current.x + delta.x)), y: Math.max(0, Math.min(1, current.y + delta.y)) });
  }
  async function confirm() {
    if (!image || busy || !previewReady) return;
    const current = generation.current; setBusy(true); setError(null);
    try {
      const output = renderCorrection(image, adjustment, 6000000);
      const blob = await correctionBlob(output);
      if (current === generation.current) onConfirm(blob);
    } catch (failure) { if (current === generation.current) setError(failure instanceof Error ? failure.message : "Could not prepare this photo."); }
    finally { if (current === generation.current) setBusy(false); }
  }

  return <section className="photo-adjustment">
    <div className="step-heading"><p className="eyebrow">FIRST, CHECK THE PHOTO</p><h1>Adjust your photo</h1><p>Keep every item, tax, and total inside the page.</p></div>
    <Notice tone="info" role="status">{analysisStatus}</Notice>
    {(error || fileError) && <Notice tone="error" role="alert">{error || fileError}</Notice>}
    <div className="adjustment-panels">
      <div><h2>Original</h2><div className="adjustment-image-wrap">
        <img src={orientedUrl ?? originalUrl} alt="Original receipt photo" />
        {adjustment.corners && orientedUrl && <div className="corner-layer" aria-label="Receipt corners"><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polygon points={adjustment.corners.map(point => `${point.x * 100},${point.y * 100}`).join(" ")} /></svg>{adjustment.corners.map((point, index) => <button key={index} type="button" className="corner-handle" style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }} aria-label={`${cornerNames[index]} corner`} onPointerDown={event => event.currentTarget.setPointerCapture(event.pointerId)} onPointerMove={event => dragCorner(event, index)} onKeyDown={event => moveCorner(event, index)} />)}</div>}
      </div></div>
      <div><h2>After correction</h2><div className="adjustment-image-wrap"><img src={correctedUrl ?? orientedUrl ?? originalUrl} alt="Photo that will be used for recognition" onLoad={event => setLoadedPreviewUrl(event.currentTarget.currentSrc)} /></div></div>
    </div>
    <div className="paper"><p className="field-label">Adjust</p>
      <div className="tool-grid">
        <Button type="button" variant="outline" disabled={!image || busy} onClick={() => { userEdited.current = false; setError(null); setAnalysisStatus("Analyzing this photo…"); setAdjustment(previous => ({ ...previous, quarterTurns: (previous.quarterTurns + 1) % 4, corners: null, angle: 0 })); }}>Rotate 90°</Button>
        <Button type="button" variant="outline" disabled={!image || busy} onClick={() => { userEdited.current = true; setError(null); setAnalysisStatus("Manual adjustment selected. Check the preview."); setAdjustment(previous => ({ ...previous, corners: previous.corners ?? fullCorners, angle: 0 })); }}>Adjust four corners</Button>
        <Button type="button" variant="outline" disabled={!image || busy} onClick={() => { userEdited.current = true; setError(null); setAnalysisStatus("Using the original photo."); setAdjustment(previous => ({ corners: null, angle: 0, quarterTurns: previous.quarterTurns })); }}>Use original photo</Button>
        <Button type="button" variant="outline" disabled={!image || busy} onClick={() => { userEdited.current = true; setError(null); setAnalysisStatus("Using the original photo."); setAdjustment({ corners: null, angle: 0, quarterTurns: 0 }); }}>Reset adjustments</Button>
      </div>
      <label className="angle-field">Fine tune angle <Input aria-label="Fine tune angle" className="w-22" type="number" min={-45} max={45} step="0.1" disabled={busy} value={adjustment.angle} onChange={event => { userEdited.current = true; setAnalysisStatus("Manual adjustment selected. Check the preview."); setAdjustment(previous => ({ ...previous, angle: Math.max(-45, Math.min(45, Number(event.target.value) || 0)) })); }} /> degrees</label>
    </div>
    <div className="paper"><fieldset className="choice-group"><legend className="field-label">Recognition engine</legend>
      {cloud && <label className={`choice-card${engine === "cloud" ? " selected" : ""}`}><input type="radio" name="ocr-engine" value="cloud" disabled={busy} checked={engine === "cloud"} onChange={() => onEngineChange("cloud")} /><span><b>Cloud AI (most accurate)</b> <small>sends this photo to Alibaba Cloud Qwen; adds Chinese names</small></span></label>}
      <label className={`choice-card${engine === "standard" ? " selected" : ""}`}><input type="radio" name="ocr-engine" value="standard" disabled={busy} checked={engine === "standard"} onChange={() => onEngineChange("standard")} /><span><b>Standard (fast)</b></span></label>
      <label className={`choice-card${engine === "precise" ? " selected" : ""}`}><input type="radio" name="ocr-engine" value="precise" disabled={busy} checked={engine === "precise"} onChange={() => onEngineChange("precise")} /><span><b>Precise</b> <small>first use downloads about 45 MB; stays in this browser</small></span></label>
    </fieldset></div>
    <div className="adjustment-secondary"><PhotoInput onSelect={onSelect} label="Choose another receipt photo" /><Button type="button" variant="ghost" onClick={onManual}>Enter items manually</Button></div>
    <div className="bottom-actions"><div className="bottom-actions-inner"><Button type="button" variant="outline" onClick={onBack}>Back</Button><Button type="button" disabled={!image || busy || !previewReady || analysisStatus === "Analyzing this photo…"} onClick={() => void confirm()}>{busy ? "Preparing photo…" : engine === "precise" ? "Use this photo and recognize (precise)" : engine === "cloud" ? "Use this photo and recognize (cloud)" : "Use this photo and recognize"} <ArrowRight aria-hidden="true"/></Button></div></div>
  </section>;
}
