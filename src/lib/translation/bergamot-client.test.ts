import { describe, expect, it } from "vitest";
import { createBergamotEngine, MODEL_FILES } from "./bergamot-client";
import type { BundleHandle } from "@/lib/model-assets/types";
type Msg = { id: number; name: string; args: Record<string, unknown> };
function fakeTransport(script: (message: Msg) => unknown | Promise<unknown>) {
  const sent: Msg[] = []; const transport = { onmessage: null as ((e: MessageEvent) => void) | null, onerror: null as ((e: ErrorEvent) => void) | null, terminated: false,
    postMessage(message: Msg) { sent.push(message); Promise.resolve(script(message)).then(result => transport.onmessage?.({ data: { id: message.id, result } } as MessageEvent), error => transport.onmessage?.({ data: { id: message.id, error: { name: "Error", message: String(error) } } } as MessageEvent)); },
    terminate() { transport.terminated = true; } };
  return { transport, sent };
}
const handle: BundleHandle = { id: "translate-enzh", version: "v", cacheName: "c", url: p => `https://x.test/models/translate-enzh/v/${p}`, bytes: async p => new TextEncoder().encode(p).buffer as ArrayBuffer, fetch: fetch, touch: () => {} };
describe("createBergamotEngine", () => {
  it("initializes, loads the model, warms up, translates and disposes", async () => {
    const { transport, sent } = fakeTransport(m => m.name === "translate" ? (m.args.texts as string[]).map(t => `译:${t}`) : { ok: true });
    const engine = await createBergamotEngine(handle, { createTransport: () => transport });
    expect(sent.map(m => m.name)).toEqual(["initialize", "loadModel", "translate"]);
    expect(sent[1].args).toMatchObject({ from: "en", to: "zh" }); expect((sent[1].args.vocabs as ArrayBuffer[]).length).toBe(2);
    expect(await engine.translate(["Milk Tea"])).toEqual(["译:Milk Tea"]);
    await engine.dispose(); expect(transport.terminated).toBe(true); await expect(engine.translate(["x"])).rejects.toMatchObject({ name: "AbortError" });
  });
  it("fails fast when the worker reports an error and terminates it", async () => {
    const { transport } = fakeTransport(m => { if (m.name === "initialize") throw new Error("wasm aborted"); return {}; });
    await expect(createBergamotEngine(handle, { createTransport: () => transport })).rejects.toThrow(/wasm aborted/); expect(transport.terminated).toBe(true);
  });
  it("aborts when the signal fires during setup", async () => {
    const controller = new AbortController(); const { transport } = fakeTransport(async m => { if (m.name === "loadModel") { controller.abort(); await new Promise(r => setTimeout(r, 5)); } return {}; });
    await expect(createBergamotEngine(handle, { createTransport: () => transport, signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" }); expect(transport.terminated).toBe(true);
  });
  it("exposes the file names used by the prepare script", () => { expect(MODEL_FILES.wasm).toBe("runtime/bergamot-translator-v0.6.0.wasm"); expect(MODEL_FILES.worker).toBe("runtime/translator-worker.js"); });
});
