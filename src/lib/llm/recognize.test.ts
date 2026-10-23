import { afterEach, describe, expect, it, vi } from "vitest";
import type { requestReceipt } from "./qwen-client";
import { createCloudRecognizer } from "./recognize";
const config = { apiKey: "k", baseUrl: "https://x.test/v1", model: "qwen3.5-plus" };
const reply = (items: [string, string | null][], subtotal: string | null) => JSON.stringify({ items: items.map(([name, lineTotal]) => ({ printedText: name, name, nameZh: name === "Milk Tea" ? "奶茶" : "", quantity: null, unitPrice: null, lineTotal, modifiers: [] })), discounts: [], subtotal, tax: "1.00", tip: null, total: null, uncertain: [] });
const options = () => ({ signal: new AbortController().signal, onProgress: vi.fn() });
function make(...answers: (string | Error)[]) {
  const request = vi.fn<typeof requestReceipt>(async () => { const next = answers.shift()!; if (next instanceof Error) throw next; return next; });
  return { request, recognize: createCloudRecognizer({ config, prepare: async () => "data:image/jpeg;base64,AA", request }) };
}
describe("cloud recognizer", () => {
  it("returns a balanced first reading after one request, with its Chinese names", async () => {
    const { request, recognize } = make(reply([["Milk Tea", "4.00"], ["Pad Thai", "12.90"]], "16.90"));
    const { draft, translations } = await recognize(new Blob(["x"]), options());
    expect(request).toHaveBeenCalledTimes(1); expect(draft.items.map(i => i.priceCents)).toEqual([400, 1290]); expect(translations).toEqual([{ name: "Milk Tea", text: "奶茶" }]);
  });
  it("re-reads once when the items miss the printed subtotal and keeps the balanced second reading", async () => {
    const { request, recognize } = make(reply([["Milk Tea", "4.00"]], "16.90"), reply([["Milk Tea", "4.00"], ["Pad Thai", "12.90"]], "16.90"));
    const { draft } = await recognize(new Blob(["x"]), options());
    expect(request).toHaveBeenCalledTimes(2); expect(request.mock.calls[1][2].recheck).toContain("the printed subtotal is $16.90");
    expect(draft.items.map(i => i.name)).toEqual(["Milk Tea", "Pad Thai"]); expect(draft.warnings).toEqual(["The double-check added Pad Thai ($12.90). Check it against the photo."]);
  });
  it("keeps the first reading with a warning when the re-read fails", async () => {
    const { recognize } = make(reply([["Milk Tea", "4.00"]], "16.90"), new Error("Cloud recognition is busy or over its quota."));
    const { draft } = await recognize(new Blob(["x"]), options());
    expect(draft.items).toHaveLength(1); expect(draft.warnings).toEqual(["The double-check could not run: Cloud recognition is busy or over its quota."]);
  });
  it("fails clearly with no items, no configuration, or a cancel", async () => {
    await expect(make(reply([], null), reply([], null)).recognize(new Blob(["x"]), options())).rejects.toThrow("No receipt items found");
    await expect(createCloudRecognizer({ config: null, prepare: async () => "u", request: vi.fn() })(new Blob(["x"]), options())).rejects.toThrow("not set up on this site");
    const controller = new AbortController();
    const request = vi.fn<typeof requestReceipt>((_url, _config, o) => new Promise((_, reject) => o.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))));
    const pending = createCloudRecognizer({ config, prepare: async () => "u", request })(new Blob(["x"]), { signal: controller.signal, onProgress: () => {} }); controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
});

const hang = (o: { signal: AbortSignal }) => new Promise<string>((_, reject) => o.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
const short = reply([["Milk Tea", "4.00"]], "16.90");
describe("cloud recognizer cancel, timeout and cleanup", () => {
  afterEach(() => { vi.useRealTimers(); });
  it("cancels during the first request", async () => {
    let started!: () => void; const begun = new Promise<void>(r => { started = r; });
    const request = vi.fn<typeof requestReceipt>((_u, _c, o) => { started(); return hang(o); });
    const controller = new AbortController();
    const pending = createCloudRecognizer({ config, prepare: async () => "u", request })(new Blob(["x"]), { signal: controller.signal, onProgress: () => {} });
    await begun; controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError", message: expect.stringContaining("Recognition canceled") });
  });
  it("cancels during the recheck instead of returning the first reading", async () => {
    let started!: () => void; const begun = new Promise<void>(r => { started = r; });
    let calls = 0;
    const request = vi.fn<typeof requestReceipt>(async (_u, _c, o) => { if (++calls === 1) return short; started(); return hang(o); });
    const controller = new AbortController();
    const pending = createCloudRecognizer({ config, prepare: async () => "u", request })(new Blob(["x"]), { signal: controller.signal, onProgress: () => {} });
    await begun; controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError", message: expect.stringContaining("Recognition canceled") });
  });
  it("times out during the first request", async () => {
    vi.useFakeTimers();
    const request = vi.fn<typeof requestReceipt>((_u, _c, o) => hang(o));
    const pending = createCloudRecognizer({ config, prepare: async () => "u", request })(new Blob(["x"]), options());
    const settled = expect(pending).rejects.toThrow("longer than 90 seconds");
    await vi.advanceTimersByTimeAsync(90000); await settled;
  });
  it("keeps the first reading with a warning when the recheck times out", async () => {
    vi.useFakeTimers();
    let calls = 0;
    const request = vi.fn<typeof requestReceipt>(async (_u, _c, o) => ++calls === 1 ? short : hang(o));
    const pending = createCloudRecognizer({ config, prepare: async () => "u", request })(new Blob(["x"]), options());
    await vi.advanceTimersByTimeAsync(90000);
    const { draft } = await pending;
    expect(draft.items).toHaveLength(1); expect(draft.warnings).toEqual(["The double-check took too long; showing the first reading."]);
  });
  it("removes its abort listener after a successful run", async () => {
    const signal = new AbortController().signal; const remove = vi.spyOn(signal, "removeEventListener");
    await make(reply([["Milk Tea", "4.00"], ["Pad Thai", "12.90"]], "16.90")).recognize(new Blob(["x"]), { signal, onProgress: () => {} });
    expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
  });
  it("reports the recheck error when the first reading is empty", async () => {
    await expect(make(reply([], null), new Error("Cloud recognition is busy or over its quota.")).recognize(new Blob(["x"]), options())).rejects.toThrow("over its quota");
  });
});
