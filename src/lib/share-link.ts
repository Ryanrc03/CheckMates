import type { CurrencyCode, PersonShare, SplitResult } from "@/types/bill";
import { DEFAULT_CURRENCY, isCurrency } from "./money";
import { validCents } from "./session";

/** A read-only copy of the final amounts. It travels in the URL fragment, which browsers never send to the server. */
export type SharedSplit = { currency: CurrencyCode; result: SplitResult };

const PREFIX = "#share=";
const MAX_PEOPLE = 50;
const MAX_NAME = 80;

function toBase64Url(text: string): string {
  let binary = "";
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): string | null {
  if (!/^[A-Za-z0-9_-]*$/.test(value)) return null;
  try {
    const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
    return new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(binary, c => c.charCodeAt(0)));
  } catch { return null; }
}

export function encodeSharedSplit(result: SplitResult, currency: CurrencyCode = DEFAULT_CURRENCY): string {
  const payload = { v: 1, c: currency, s: result.subtotalCents, x: result.taxCents, t: result.tipCents, p: result.people.map(p => [p.name, p.itemsCents, p.taxCents, p.tipCents]) };
  return toBase64Url(JSON.stringify(payload));
}

export function shareUrl(base: string, result: SplitResult, currency?: CurrencyCode): string {
  return `${base.split("#")[0]}${PREFIX}${encodeSharedSplit(result, currency)}`;
}

/** Rejects anything that is not a complete, internally consistent split. */
export function decodeSharedSplit(hash: string): SharedSplit | null {
  if (!hash.startsWith(PREFIX)) return null;
  const json = fromBase64Url(hash.slice(PREFIX.length));
  if (json === null) return null;
  let data: unknown;
  try { data = JSON.parse(json); } catch { return null; }
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const { v, c, s, x, t, p } = data as Record<string, unknown>;
  if (v !== 1 || !isCurrency(c) || !validCents(s) || !validCents(x) || !validCents(t) || !Array.isArray(p) || p.length === 0 || p.length > MAX_PEOPLE) return null;
  const people: PersonShare[] = [];
  for (const [index, row] of p.entries()) {
    if (!Array.isArray(row) || row.length !== 4) return null;
    const [name, itemsCents, taxCents, tipCents] = row as unknown[];
    if (typeof name !== "string" || !name.trim() || name.length > MAX_NAME || !validCents(itemsCents) || !validCents(taxCents) || !validCents(tipCents)) return null;
    const totalCents = itemsCents + taxCents + tipCents;
    if (!validCents(totalCents)) return null;
    people.push({ id: `shared-${index}`, name: name.trim(), itemsCents, taxCents, tipCents, totalCents });
  }
  const sum = (key: "itemsCents" | "taxCents" | "tipCents") => people.reduce((total, person) => total + person[key], 0);
  const totalCents = s + x + t;
  if (!validCents(totalCents) || sum("itemsCents") !== s || sum("taxCents") !== x || sum("tipCents") !== t) return null;
  return { currency: c, result: { subtotalCents: s, taxCents: x, tipCents: t, totalCents, people } };
}
