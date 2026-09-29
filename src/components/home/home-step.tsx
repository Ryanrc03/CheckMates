import { Camera, Upload, Utensils, ArrowRight, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBillStore } from "@/store/useBillStore";
export function PhotoInput({ onSelect, camera = false, label }: { onSelect: (file: File) => void; camera?: boolean; label: string }) {
  return <label className={`photo-input ${camera ? "primary" : ""}`}>{camera ? <Camera size={20} /> : <Upload size={20} />}{label}<input aria-label={label} type="file" accept="image/jpeg,image/png,image/webp" capture={camera ? "environment" : undefined} onChange={e => { const file = e.target.files?.[0]; if (file) onSelect(file); e.target.value = ""; }} /></label>;
}
export function HomeStep({ onPhotoSelected, onDemo, busy, stage, progress, error, onCancel, onRetry, onManual, hasPhoto }: { onPhotoSelected: (file: File) => void; onDemo: () => void; busy: boolean; stage: string; progress: number | null; error: string | null; onCancel: () => void; onRetry: () => void; onManual: () => void; hasPhoto: boolean }) {
  const source = useBillStore(s => s.source);
  return <section className="home-step">
    <div className="eyebrow">GOOD FOOD. GOOD COMPANY.</div>
    <h1>Share the meal.<br /><span>Split the bill.</span></h1>
    <p className="lead">From “who had the fries?” to everyone’s fair share. Down to the last cent.</p>
    <div className="receipt-illustration" aria-hidden="true"><div className="little-sticker"><Utensils size={24} /></div><div className="mini-title">THE GOOD TIMES</div><div className="mini-rule"/><p>Burger <b>14.95</b></p><p>Fries to share <b>5.95</b></p><p>Lemonade <b>3.50</b></p><div className="mini-rule"/><div className="mini-bottom">A little yours. A little mine.</div><div className="friend-stickers"><span>A</span><span>B</span><span>C</span></div></div>
    {busy ? <div className="paper status-box" role="status"><h2>Reading your receipt</h2><p>{stage}</p>{progress !== null && <progress max={1} value={progress} aria-label="Recognition progress" />}<p className="muted">Your photo stays in this browser.</p><Button variant="outline" onClick={onCancel}>Cancel recognition</Button></div> : <div className="home-actions">
      {error && <div className="notice" role="alert">{error}</div>}
      {source === "photo" && !hasPhoto && <p className="notice">Your session is saved, but photos and in-progress recognition do not survive a refresh. Select the photo again or enter items manually.</p>}
      <PhotoInput camera onSelect={onPhotoSelected} label="Take a photo" />
      <PhotoInput onSelect={onPhotoSelected} label="Upload a receipt" />
      {hasPhoto && <Button variant="outline" onClick={onRetry}>Retry recognition</Button>}
      {(error || source === "photo") && <Button variant="outline" onClick={onManual}>Enter items manually</Button>}
      <Button className="sample-button" variant="ghost" onClick={onDemo}>Try a sample bill <ArrowRight size={17}/></Button>
    </div>}
    <p className="privacy"><ShieldCheck size={15} /> No sign-up. No photo uploads to a server.</p>
    <p className="fine-print">English receipts · USD, EUR, GBP, CNY & more · JPEG, PNG or WebP · Up to 15 MiB</p>
    <div className="how-it-works"><span><b>01</b> Snap & check</span><span><b>02</b> Pick your people</span><span><b>03</b> Share the split</span></div>
  </section>;
}
