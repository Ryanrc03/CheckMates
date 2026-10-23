import { Camera, Upload, Utensils, ArrowRight, ShieldCheck } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { cn } from "@/lib/utils";
import { useBillStore } from "@/store/useBillStore";
import { cloudConfig } from "@/lib/llm/config";
import { OfflineData } from "./offline-data";
import { CloudProgress } from "../receipt/cloud-progress";
export function PhotoInput({ onSelect, camera = false, label, variant = "outline", size = "default" }: { onSelect: (file: File) => void; camera?: boolean; label: string; variant?: "default" | "outline"; size?: "default" | "lg" }) {
  return <label className={cn(buttonVariants({ variant, size }), "photo-input")}>{camera ? <Camera aria-hidden="true"/> : <Upload aria-hidden="true"/>}{label}<input aria-label={label} type="file" accept="image/jpeg,image/png,image/webp" capture={camera ? "environment" : undefined} onChange={e => { const file = e.target.files?.[0]; if (file) onSelect(file); e.target.value = ""; }}/></label>;
}
export function HomeStep({ onPhotoSelected, onDemo, busy, stage, progress, error, onCancel, onRetry, onManual, hasPhoto, cloud }: { onPhotoSelected: (file: File) => void; onDemo: () => void; busy: boolean; stage: string; progress: number | null; error: string | null; onCancel: () => void; onRetry: () => void; onManual: () => void; hasPhoto: boolean; cloud: boolean }) {
  const source = useBillStore(s => s.source);
  return <section className="home-step">
    <p className="eyebrow">GOOD FOOD. GOOD COMPANY.</p>
    <h1>Share the meal.<br/><span>Split the bill.</span></h1>
    <p className="lead">From “who had the fries?” to everyone’s fair share. Down to the last cent.</p>
    <div className="receipt-illustration" aria-hidden="true"><div className="little-sticker"><Utensils size={24}/></div><div className="mini-title">THE GOOD TIMES</div><div className="mini-rule"/><p>Burger <b>14.95</b></p><p>Fries to share <b>5.95</b></p><p>Lemonade <b>3.50</b></p><div className="mini-rule"/><div className="mini-bottom">A little yours. A little mine.</div><div className="friend-stickers"><span className="person-1">A</span><span className="person-2">B</span><span className="person-3">C</span></div></div>
    {busy ? <div className="paper status-box" role="status">{cloud ? <><h2 lang="zh-Hans">正在识别小票</h2><CloudProgress stage={stage}/><p className="muted" lang="zh-Hans">照片已发给阿里云通义千问识别。</p></> : <><h2>Reading your receipt</h2><p>{stage}</p>{progress !== null && <progress max={1} value={progress} aria-label="Recognition progress"/>}<p className="muted">Your photo stays in this browser.</p></>}<Button variant="outline" onClick={onCancel}>Cancel recognition</Button></div> : <div className="home-actions">
      {error && <Notice tone="error" role="alert">{error}</Notice>}
      {source === "photo" && !hasPhoto && <Notice tone="info">Your session is saved, but photos and in-progress recognition do not survive a refresh. Select the photo again or enter items manually.</Notice>}
      <PhotoInput camera variant="default" size="lg" onSelect={onPhotoSelected} label="Take a photo"/>
      <PhotoInput size="lg" onSelect={onPhotoSelected} label="Upload a receipt"/>
      {hasPhoto && <Button variant="outline" size="lg" onClick={onRetry}>Retry recognition</Button>}
      {(error || source === "photo") && <Button variant="outline" size="lg" onClick={onManual}>Enter items manually</Button>}
      <Button variant="ghost" size="lg" onClick={onDemo}>Try a sample bill <ArrowRight aria-hidden="true"/></Button>
    </div>}
    <p className="privacy"><ShieldCheck aria-hidden="true"/> {cloudConfig() !== null ? "No sign-up. Cloud AI sends the photo to Alibaba Cloud; Standard and Precise keep it in this browser." : "No sign-up. No photo uploads to a server."}</p>
    <p className="fine-print">English receipts · USD · JPEG, PNG or WebP · Up to 15 MiB</p>
    <div className="how-it-works"><span><b>01</b> Snap & check</span><span><b>02</b> Pick your people</span><span><b>03</b> Share the split</span></div>
    <OfflineData/>
  </section>;
}
