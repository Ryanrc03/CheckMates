import type { OcrEvidence } from "@/types/ocr";
import { parseReceiptText } from "./parseReceipt";
import { shouldRetryReceipt, chooseReceiptCandidate } from "./retry";
import {readFinancialEvidence} from "./financial-evidence";
import {prepareFinancialImage} from "./financial-image";
type ProgressMessage = { status: string; progress?: number };
export type OcrWorker = { recognize: (image: Blob, scan?: {pageSegMode:3|4|6|11}) => Promise<{ data: OcrEvidence }>; terminate: () => Promise<unknown> };
type Options = { signal: AbortSignal; onProgress: (stage: string, progress: number | null) => void; enhanced?:boolean };
type Factory = (logger: (message: ProgressMessage) => void) => Promise<OcrWorker>;
const aborted = () => new DOMException("Recognition canceled. You can select another photo or enter items manually.", "AbortError");

export function createReceiptRecognizer(factory: Factory,prepareFinancial?:(image:Blob,kind:"summary"|"tail")=>Promise<Blob>) {
  let cancelActive: (() => void) | null = null;
  return async (image: Blob, { signal, onProgress, enhanced }: Options): Promise<OcrEvidence> => {
    cancelActive?.();
    if (signal.aborted) throw aborted();
    let ended = false; let worker: OcrWorker | null = null; let terminated = false;
    const release = () => { if (worker && !terminated) { terminated = true; void worker.terminate().catch(() => {}); } };
    let rejectStop!: (error: Error) => void;
    const stop = new Promise<never>((_, reject) => { rejectStop = reject; });
    const cancel = () => { ended = true; release(); rejectStop(aborted()); };
    cancelActive = cancel; signal.addEventListener("abort", cancel, { once: true });
    const timer = setTimeout(() => { ended = true; release(); rejectStop(new Error("Recognition exceeded 120 seconds. Try a smaller, clearer photo or enter items manually.")); }, 120000);
    const work = (async () => {
      onProgress("Loading recognition resources", null);
      worker = await factory(message => { if (!ended) onProgress(message.status, typeof message.progress === "number" && Number.isFinite(message.progress) ? Math.max(0, Math.min(1, message.progress)) : null); });
      if (ended) { release(); throw aborted(); }
      const first = await worker.recognize(image);let data=first.data;
      if (ended) throw aborted();
      if (!data.text.trim()) throw new Error("No text found. Try a clearer receipt photo or enter items manually.");
      if(enhanced&&shouldRetryReceipt(data,parseReceiptText(data.text,data.lines))){
        onProgress("Checking an enhanced scan",null);
        try {
          const second=await worker.recognize(image,{pageSegMode:4});
          if(ended)throw aborted();
          if(second.data.text.trim())data=chooseReceiptCandidate(data,second.data);
        } catch(error) {if(ended||signal.aborted)throw error;return {...data,enhancementError:error instanceof Error?error.message:"Enhanced scan unavailable"};}
      }
      const financial=parseReceiptText(data.text,data.lines);
      if(prepareFinancial&&[financial.taxCents,financial.printedTotalCents,financial.printedSubtotalCents].some(v=>v===null)){
        const scans:OcrEvidence[]=[];
        onProgress("Reading tax and totals",null);
        try{
          const frame=await prepareFinancial(image,"summary");if(ended)throw aborted();
          const summary=await worker.recognize(frame,{pageSegMode:11});if(ended)throw aborted();scans.push(summary.data);
          if(financial.printedTotalCents===null&&readFinancialEvidence(summary.data).printedTotalCents===null){
            const tail=await prepareFinancial(image,"tail");if(ended)throw aborted();
            const total=await worker.recognize(tail,{pageSegMode:6});if(ended)throw aborted();scans.push(total.data);
          }
        }catch(error){if(ended||signal.aborted)throw error;data={...data,enhancementError:error instanceof Error?error.message:"Financial scan unavailable"};}
        data={...data,financialScans:scans};
      }
      return data;
    })();
    try { return await Promise.race([work, stop]); }
    finally { ended = true; clearTimeout(timer); signal.removeEventListener("abort", cancel); release(); if (cancelActive === cancel) cancelActive = null; }
  };
}
export const recognizeReceipt = createReceiptRecognizer(async logger => {
  const { createBrowserWorker } = await import("./worker");
  return createBrowserWorker(logger);
},prepareFinancialImage);
