import { describe, expect, it, vi } from "vitest";
import { requestReceipt } from "./qwen-client";
import { UNREADABLE_REPLY } from "./reply";
const config = { apiKey: "secret", baseUrl: "https://x.test/v1", model: "qwen3.5-plus" };
const live = () => new AbortController().signal;
const ok = (content: unknown) => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200, headers: { "Content-Type": "application/json" } });
describe("requestReceipt", () => {
  it("posts one image with the schema, thinking off, and returns the message content", async () => {
    const send = vi.fn<typeof fetch>(async () => ok("{\"items\":[]}"));
    await expect(requestReceipt("data:image/jpeg;base64,AA", config, { signal: live(), fetch: send })).resolves.toBe("{\"items\":[]}");
    const [url, init] = send.mock.calls[0]; const body = JSON.parse(String(init?.body));
    expect(url).toBe("https://x.test/v1/chat/completions"); expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer secret");
    expect(body).toMatchObject({ model: "qwen3.5-plus", enable_thinking: false, temperature: 0, response_format: { type: "json_schema", json_schema: { name: "receipt", strict: true } } });
    expect(body.messages[0].role).toBe("system"); expect(body.messages[1].content).toEqual([{ type: "image_url", image_url: { url: "data:image/jpeg;base64,AA" } }, { type: "text", text: "Transcribe this receipt." }]);
  });
  it("sends the recheck text in place of the first request", async () => {
    const send = vi.fn<typeof fetch>(async () => ok("{}"));
    await requestReceipt("u", config, { signal: live(), fetch: send, recheck: "Read again." });
    expect(JSON.parse(String(send.mock.calls[0][1]?.body)).messages[1].content[1].text).toBe("Read again.");
  });
  it("turns HTTP, network and shape failures into next-step messages", async () => {
    for (const [status, message] of [[401, "rejected its key"], [429, "over its quota"], [413, "smaller, clearer photo"], [500, "HTTP 500"]] as const)
      await expect(requestReceipt("u", config, { signal: live(), fetch: async () => new Response("{}", { status }) })).rejects.toThrow(message);
    await expect(requestReceipt("u", config, { signal: live(), fetch: async () => { throw new TypeError("Failed to fetch"); } })).rejects.toThrow("Could not reach cloud recognition");
    await expect(requestReceipt("u", config, { signal: live(), fetch: async () => ok(null) })).rejects.toThrow(UNREADABLE_REPLY);
  });
  it("passes a cancellation through unchanged", async () => {
    const controller = new AbortController(); controller.abort();
    await expect(requestReceipt("u", config, { signal: controller.signal, fetch: async () => { throw new DOMException("aborted", "AbortError"); } })).rejects.toMatchObject({ name: "AbortError" });
  });
  it("maps DashScope error codes before the status fallback", async () => {
    const body = (code: string, status: number) => async () => new Response(JSON.stringify({ error: { code } }), { status });
    for (const [code, status, message] of [["Arrearage", 400, "no balance"], ["DataInspectionFailed", 400, "content check"], ["data_inspection_failed", 400, "content check"], ["model_not_found", 400, "model is not available"], ["", 404, "model is not available"]] as const)
      await expect(requestReceipt("u", config, { signal: live(), fetch: body(code, status) })).rejects.toThrow(message);
  });
});
