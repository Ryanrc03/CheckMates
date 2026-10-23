import type { CloudConfig } from "./config";
import { FIRST_REQUEST, RECEIPT_PROMPT, RECEIPT_SCHEMA } from "./prompt";
import { UNREADABLE_REPLY } from "./reply";
export type RequestOptions = { signal: AbortSignal; recheck?: string; fetch?: typeof fetch };
function httpMessage(status: number): string {
  if (status === 401 || status === 403) return "Cloud recognition rejected its key. Choose Standard or Precise, and update the key in the deployment settings.";
  if (status === 429) return "Cloud recognition is busy or over its quota. Wait a minute and try again, or choose Standard or Precise.";
  if (status === 400 || status === 413) return "Cloud recognition could not accept this photo. Try a smaller, clearer photo, or choose Standard or Precise.";
  return `Cloud recognition failed (HTTP ${status}). Try again, or choose Standard or Precise.`;
}
/** One chat completion straight from the browser: DashScope answers CORS preflights for any origin (checked 2026-10-22). */
export async function requestReceipt(imageUrl: string, config: CloudConfig, { signal, recheck, fetch: send = (input, init) => fetch(input, init) }: RequestOptions): Promise<string> {
  const body = { model: config.model, enable_thinking: false, temperature: 0, response_format: { type: "json_schema", json_schema: { name: "receipt", strict: true, schema: RECEIPT_SCHEMA } },
    messages: [{ role: "system", content: RECEIPT_PROMPT }, { role: "user", content: [{ type: "image_url", image_url: { url: imageUrl } }, { type: "text", text: recheck ?? FIRST_REQUEST }] }] };
  let response: Response;
  try { response = await send(`${config.baseUrl}/chat/completions`, { method: "POST", signal, headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify(body) }); }
  catch (error) { if (signal.aborted) throw error; throw new Error("Could not reach cloud recognition. Check your connection, or choose Standard or Precise."); }
  if (!response.ok) throw new Error(httpMessage(response.status));
  const reply: unknown = await response.json().catch(() => null);
  const content = (reply as { choices?: { message?: { content?: unknown } }[] } | null)?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error(UNREADABLE_REPLY);
  return content;
}
