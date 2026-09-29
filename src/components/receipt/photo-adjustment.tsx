/* eslint-disable @next/next/no-img-element -- both previews are local browser blob URLs */
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Button } from "@/components/ui/button";
import { PhotoInput } from "@/components/home/home-step";
import type { Analysis } from "@/lib/receipt-image/analyze";
import { isValidQuad, type Point, type Quad } from "@/lib/receipt-image/geometry";
import { correctionBlob, renderCorrection, type Adjustment } from "@/lib/receipt-image/render";

const fullCorners: Quad = [{ x: 0.01, y: 0.01 }, { x: 0.99, y: 0.01 }, { x: 0.99, y: 0.99 }, { x: 0.01, y: 0.99 }];
const cornerNames = ["Top left", "Top right", "Bottom right", "Bottom left"];

export function PhotoAdjustment({ file, originalUrl, onSelect, onConfirm, onBack, onManual }: {
  file: File; originalUrl: string; onSelect: (file: File) => void; onConfirm: (image: Blob) => void; onBack: () => void; onManual: () => void;
}) {
  const [image, setImage] = useState<ImageBitmap | null>(null);
  const [adjustment, setAdjustment] = useState<Adjustment>({ corners: null, angle: 0, quarterTurns: 0 });
  const [analysisStatus, setAnalysisStatus] = useState("Analyzing this photo…");
  const [orientedUrl, setOrientedUrl] = useState<string | null>(null);
  const [correctedUrl, setCorrectedUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const imageRef = useRef<ImageBitmap | null>(null);
  const generation = useRef(0);
  const userEdited = useRef(false);
  const fileError = !["image/jpeg", "image/png", "image/webp"].includes(file.type) ? "Choose a JPEG, PNG, or WebP photo. HEIC and PDF are not supported." : file.size > 15 * 1024 * 1024 ? "This photo exceeds 15 MiB. Resize it or choose a smaller photo." : null;

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
    if (!image) return;
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
        setAdjustment(previous => ({ ...previous, corners: analysis.corners, angle: analysis.corners ? 0 : analysis.angleReliable ? analysis.angle : 0 }));
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
    const timer = setTimeout(() => {
      try {
        void Promise.all([
          correctionBlob(renderCorrection(image, { corners: null, angle: 0, quarterTurns: adjustment.quarterTurns }, 1024 * 1024)),
          correctionBlob(renderCorrection(image, adjustment, 1024 * 1024)),
        ]).then(([source, corrected]) => {
          if (!active) return;
          setOrientedUrl(previous => { if (previous) URL.revokeObjectURL(previous); return URL.createObjectURL(source); });
          setCorrectedUrl(previous => { if (previous) URL.revokeObjectURL(previous); return URL.createObjectURL(corrected); });
        }).catch(failure => { if (active) setError(failure instanceof Error ? failure.message : "Could not preview this photo."); });
      } catch (failure) { if (active) setError(failure instanceof Error ? failure.message : "Could not preview this photo."); }
    }, 30);
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
    if (!image || busy) return;
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
    <p role="status" className="notice">{analysisStatus}</p>
    {(error || fileError) && <p role="alert" className="notice">{error || fileError}</p>}
    <div className="adjustment-panels">
      <div><h2>Original</h2><div className="adjustment-image-wrap">
        <img src={orientedUrl ?? originalUrl} alt="Original receipt photo" />
        {adjustment.corners && orientedUrl && <div className="corner-layer" aria-label="Receipt corners"><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polygon points={adjustment.corners.map(point => `${point.x * 100},${point.y * 100}`).join(" ")} /></svg>{adjustment.corners.map((point, index) => <button key={index} type="button" className="corner-handle" style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }} aria-label={`${cornerNames[index]} corner`} onPointerDown={event => event.currentTarget.setPointerCapture(event.pointerId)} onPointerMove={event => dragCorner(event, index)} onKeyDown={event => moveCorner(event, index)} />)}</div>}
      </div></div>
      <div><h2>After correction</h2><div className="adjustment-image-wrap"><img src={correctedUrl ?? orientedUrl ?? originalUrl} alt="Photo that will be used for recognition" /></div></div>
    </div>
    <div className="adjustment-controls">
      <Button type="button" variant="outline" disabled={!image || busy} onClick={() => { userEdited.current = false; setError(null); setAnalysisStatus("Analyzing this photo…"); setAdjustment(previous => ({ ...previous, quarterTurns: (previous.quarterTurns + 1) % 4, corners: null, angle: 0 })); }}>Rotate 90°</Button>
      <Button type="button" variant="outline" disabled={!image || busy} onClick={() => { userEdited.current = true; setError(null); setAnalysisStatus("Manual adjustment selected. Check the preview."); setAdjustment(previous => ({ ...previous, corners: previous.corners ?? fullCorners, angle: 0 })); }}>Adjust four corners</Button>
      <label>Fine tune angle <input aria-label="Fine tune angle" type="number" min={-45} max={45} step="0.1" value={adjustment.angle} onChange={event => { userEdited.current = true; setAnalysisStatus("Manual adjustment selected. Check the preview."); setAdjustment(previous => ({ ...previous, angle: Math.max(-45, Math.min(45, Number(event.target.value) || 0)) })); }} /> degrees</label>
      <Button type="button" variant="outline" disabled={!image || busy} onClick={() => { userEdited.current = true; setError(null); setAnalysisStatus("Using the original photo."); setAdjustment(previous => ({ corners: null, angle: 0, quarterTurns: previous.quarterTurns })); }}>Use original photo</Button>
      <Button type="button" variant="outline" disabled={!image || busy} onClick={() => { userEdited.current = true; setError(null); setAnalysisStatus("Using the original photo."); setAdjustment({ corners: null, angle: 0, quarterTurns: 0 }); }}>Reset adjustments</Button>
    </div>
    <div className="adjustment-actions">
      <Button type="button" disabled={!image || busy || analysisStatus === "Analyzing this photo…"} onClick={() => void confirm()}>{busy ? "Preparing photo…" : "Use this photo and recognize"}</Button>
      <PhotoInput onSelect={onSelect} label="Choose another receipt photo" />
      <Button type="button" variant="ghost" onClick={onBack}>Back</Button>
      <Button type="button" variant="ghost" onClick={onManual}>Enter items manually</Button>
    </div>
  </section>;
}
