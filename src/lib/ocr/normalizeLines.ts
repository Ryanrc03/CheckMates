import type { OcrLine, Bbox } from "@/types/ocr";
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==="object"&&!Array.isArray(v);
const bbox=(v:unknown):v is Bbox=>record(v)&&["x0","y0","x1","y1"].every(k=>typeof v[k]==="number"&&Number.isFinite(v[k]))&&Number(v.x1)>=Number(v.x0)&&Number(v.y1)>=Number(v.y0);
export function normalizeOcrLines(blocks:unknown):OcrLine[]{
 if(!Array.isArray(blocks))return [];
 return blocks.flatMap(b=>record(b)&&Array.isArray(b.paragraphs)?b.paragraphs:[]).flatMap(p=>record(p)&&Array.isArray(p.lines)?p.lines:[]).flatMap((line:unknown)=>{
  if(!record(line)||typeof line.text!=="string"||!bbox(line.bbox))return [];
  const confidence=typeof line.confidence==="number"&&Number.isFinite(line.confidence)?line.confidence:0;
  const words=(Array.isArray(line.words)?line.words:[]).flatMap((w:unknown)=>record(w)&&typeof w.text==="string"&&bbox(w.bbox)?[{text:w.text,confidence:typeof w.confidence==="number"&&Number.isFinite(w.confidence)?w.confidence:0,bbox:w.bbox}]:[]);
  return [{text:line.text.trim(),confidence,bbox:line.bbox,words}];
 });
}
