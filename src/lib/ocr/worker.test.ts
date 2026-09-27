import { expect, it } from "vitest";
import { createBrowserWorker } from "./worker";
it("rejects model initialization failures and terminates the owned worker", async () => {
  let stopped = false;
  const transport = { onmessage: null as ((e: MessageEvent) => void) | null, onerror: null as ((e: ErrorEvent) => void) | null,
    postMessage(message: unknown) { const packet = message as { action: string; jobId: string }; queueMicrotask(() => transport.onmessage?.({ data: { ...packet, status: packet.action === "loadLanguage" ? "reject" : "resolve", data: packet.action === "loadLanguage" ? "model unavailable" : {} } } as MessageEvent)); },
    terminate() { stopped = true; } };
  const worker = createBrowserWorker(() => {}, transport, "http://localhost:3100");
  await expect(worker.recognize(new Blob())).rejects.toThrow("model unavailable"); await worker.terminate(); expect(stopped).toBe(true);
});
it("termination interrupts resource initialization without waiting for a late result", async () => {
  const transport = { onmessage: null, onerror: null, postMessage() {}, terminate() {} };
  const worker = createBrowserWorker(() => {}, transport, "http://localhost:3100"); const recognition = worker.recognize(new Blob()); const rejected = expect(recognition).rejects.toMatchObject({ name: "AbortError" }); await worker.terminate(); await rejected;
});
