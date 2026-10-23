import { cloudConfig, type CloudConfig } from "./config";
import { recheckMessage } from "./prompt";
import { requestReceipt } from "./qwen-client";
import { parseLlmReply } from "./reply";
import { mergeReadings, readingProblem, toDraft, type CloudReading } from "./to-draft";
import { toUploadDataUrl } from "./upload-image";
export type CloudDeps = { config: CloudConfig | null; prepare: (image: Blob) => Promise<string>; request: typeof requestReceipt };
type Options = { signal: AbortSignal; onProgress: (stage: string, progress: number | null) => void };
const TIMEOUT_MS = 90000; // two readings at ~11 s each, with room for a slow phone network
const canceled = () => new DOMException("Recognition canceled. You can select another photo or enter items manually.", "AbortError");
/** Reads once; when the items do not reconcile with the printed subtotal or total, re-reads once with the first transcription and the gap. */
export function createCloudRecognizer(deps: CloudDeps) {
  return async (image: Blob, { signal, onProgress }: Options): Promise<CloudReading> => {
    const config = deps.config; if (!config) throw new Error("Cloud recognition is not set up on this site. Choose Standard or Precise.");
    const controller = new AbortController(); const abort = () => controller.abort(); if (signal.aborted) abort(); else signal.addEventListener("abort", abort, { once: true });
    let timedOut = false; const timer = setTimeout(() => { timedOut = true; controller.abort(); }, TIMEOUT_MS);
    try {
      onProgress("Preparing the photo", null); const url = await deps.prepare(image); if (controller.signal.aborted) throw canceled();
      onProgress("Reading with cloud recognition", null);
      const firstText = await deps.request(url, config, { signal: controller.signal }); const first = toDraft(parseLlmReply(firstText), config.model);
      const problem = readingProblem(first.draft); let result = first;
      if (problem) {
        onProgress("Double-checking every line", null);
        try { result = mergeReadings(first, toDraft(parseLlmReply(await deps.request(url, config, { signal: controller.signal, recheck: recheckMessage(firstText, problem) })), config.model)); }
        catch (error) { if (controller.signal.aborted) throw error; first.draft.warnings.push(`The double-check could not run: ${error instanceof Error ? error.message : "unknown error"}`); }
      }
      if (!result.draft.items.length) throw new Error("No receipt items found. Try a clearer photo, or enter items manually.");
      return result;
    } catch (error) {
      if (timedOut) throw new Error("Cloud recognition took longer than 90 seconds. Try again, or choose Standard or Precise.");
      if (signal.aborted) throw canceled();
      throw error;
    } finally { clearTimeout(timer); signal.removeEventListener("abort", abort); }
  };
}
export const recognizeWithCloud = createCloudRecognizer({ config: cloudConfig(), prepare: toUploadDataUrl, request: requestReceipt });
