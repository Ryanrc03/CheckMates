import { describe, expect, it } from "vitest";
import { createPaddleWorker, type PaddleTransport } from "./engine";
import type { BundleHandle } from "@/lib/model-assets/types";
const handle: BundleHandle = { id: "ocr-precise", version: "v", cacheName: "cm-models-ocr-precise-vv", url: p => `https://x.test/models/ocr-precise/v/${p}`, bytes: async () => new ArrayBuffer(0), fetch, touch: () => {} };
const diner = [{ text: "Burger", score: 0.99, poly: [[81, 190], [221, 190], [221, 241], [81, 241]] }, { text: "14.95", score: 1, poly: [[506, 189], [620, 189], [620, 237], [506, 237]] }, { text: "Total", score: 0.99, poly: [[81, 559], [198, 559], [198, 609], [81, 609]] }, { text: "26.41", score: 1, poly: [[504, 560], [617, 560], [617, 609], [504, 609]] }];
function fakeTransport(onMessage: (m: { id: number; type: string; payload?: unknown }) => unknown) {
  const sent: { type: string; payload?: unknown }[] = []; const t: PaddleTransport & { terminated: boolean } = { terminated: false, onmessage: null, onerror: null, postMessage: m => { sent.push(m as never); Promise.resolve().then(() => { try { t.onmessage?.({ data: { id: (m as { id: number }).id, ok: true, result: onMessage(m as never) } } as MessageEvent); } catch (e) { t.onmessage?.({ data: { id: (m as { id: number }).id, ok: false, error: String(e) } } as MessageEvent); } }); }, terminate: () => { t.terminated = true; } };
  return { t, sent };
}
describe("createPaddleWorker", () => {
  it("initializes with bundle urls, converts boxes to lines, and terminates", async () => {
    const { t, sent } = fakeTransport(m => m.type === "init" ? { backend: "wasm" } : m.type === "predict" ? { items: diner, metrics: { detMs: 1, recMs: 1, totalMs: 2, detectedBoxes: 4, recognizedCount: 4 } } : true);
    const stages: string[] = []; const worker = createPaddleWorker(handle, message => stages.push(message.status), () => t);
    const { data } = await worker.recognize(new Blob(["png"]));
    expect(sent[0]).toMatchObject({ type: "init", payload: { cacheName: "cm-models-ocr-precise-vv", detUrl: "https://x.test/models/ocr-precise/v/PP-OCRv5_mobile_det_onnx_infer.tar", wasmPaths: "https://x.test/models/ocr-precise/v/runtime/ort/" } });
    expect(data.text).toBe("Burger 14.95\nTotal 26.41"); expect(data.confidence).toBeGreaterThan(90); expect(data.lines).toHaveLength(2); expect(data.lines?.[0]).toMatchObject({ text: "Burger 14.95", words: [] }); expect(data.lines?.[0].confidence).toBeGreaterThan(90); expect(stages).toContain("Starting precise recognition"); expect(stages).toContain("Recognizing (precise)");
    await worker.terminate(); expect(t.terminated).toBe(true); await expect(worker.recognize(new Blob(["x"]))).rejects.toMatchObject({ name: "AbortError" });
  });
  it("sends pre-decoded ImageData instead of the Blob when the page cannot rasterize in a worker", async () => {
    const { t, sent } = fakeTransport(m => m.type === "init" ? { backend: "wasm" } : m.type === "predict" ? { items: diner, metrics: { detMs: 1, recMs: 1, totalMs: 2, detectedBoxes: 4, recognizedCount: 4 } } : true);
    const decoded = { data: new Uint8ClampedArray(4), width: 1, height: 1 } as unknown as ImageData; const seen: Blob[] = [];
    const worker = createPaddleWorker(handle, () => {}, () => t, async image => { seen.push(image); return decoded; });
    const blob = new Blob(["png"]); const { data } = await worker.recognize(blob);
    expect(seen).toEqual([blob]); expect(sent[1]).toMatchObject({ type: "predict", payload: decoded }); expect(data.text).toBe("Burger 14.95\nTotal 26.41");
  });
  it("surfaces worker errors with a recovery hint", async () => {
    const { t } = fakeTransport(m => { if (m.type === "init") throw new Error("wasm load failed"); return {}; });
    const worker = createPaddleWorker(handle, () => {}, () => t); await expect(worker.recognize(new Blob(["png"]))).rejects.toThrow(/wasm load failed.*standard engine/);
  });
  it("terminates the transport even after a worker-level error", async () => {
    const { t } = fakeTransport(m => { if (m.type === "init") { t.onerror?.({ message: "importScripts failed" } as ErrorEvent); return new Promise(() => {}); } return {}; });
    const worker = createPaddleWorker(handle, () => {}, () => t); await expect(worker.recognize(new Blob(["png"]))).rejects.toThrow(/importScripts failed.*standard engine/);
    await worker.terminate(); expect(t.terminated).toBe(true);
  });
});
