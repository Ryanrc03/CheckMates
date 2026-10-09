import { expandAbbreviations } from "./abbreviations";
import { lookupGlossary } from "./glossary";
import { normalizeSource } from "./normalize";
import { joinProtected, splitProtected, type ProtectedParts } from "./protect";
import { matchModifier } from "./rules";
import { MAX_SOURCE_LENGTH, type TranslationProvider } from "./types";
export type PhraseTranslation = { text: string; provider: TranslationProvider; expandedSource?: string };
export type ModelTranslate = (text: string) => Promise<string | null>;
export type TranslationPlan = { kind: "done"; result: PhraseTranslation } | { kind: "model"; modelInput: string; compose: (modelOutput: string) => PhraseTranslation } | { kind: "none" };
const CJK = /[㐀-鿿]/;
export function sanitizeModelOutput(output: string | null | undefined, input: string): string | null {
  if (!output) return null; const text = output.replace(/^["'“”‘’\s]+|["'“”‘’\s]+$/g, "").trim();
  if (!text || text.length > 200 || /[<>\u0000-\u001f]/.test(text) || !CJK.test(text) || text.toLowerCase() === input.toLowerCase()) return null;
  return text;
}
function finish(parts: ProtectedParts, text: string, provider: TranslationProvider, expandedSource: string | undefined): PhraseTranslation { return { text: joinProtected(parts, text), provider, expandedSource }; }
export function planTranslation(source: string): TranslationPlan {
  const normalized = normalizeSource(source); if (!normalized || normalized.length > MAX_SOURCE_LENGTH) return { kind: "none" };
  const parts = splitProtected(normalized); if (!parts.core || !/[a-z]/i.test(parts.core)) return { kind: "none" };
  const { text: core, expanded } = expandAbbreviations(parts.core); const expandedSource = expanded ? core : undefined;
  const direct = lookupGlossary(core); if (direct) return { kind: "done", result: finish(parts, direct, "glossary", expandedSource) };
  const modifier = matchModifier(core);
  if (modifier) {
    const rest = lookupGlossary(modifier.rest); if (rest) return { kind: "done", result: finish(parts, `${modifier.zhPrefix}${rest}`, "rule", expandedSource) };
    return { kind: "model", modelInput: modifier.rest, compose: output => finish(parts, `${modifier.zhPrefix}${output}`, "model", expandedSource) };
  }
  return { kind: "model", modelInput: core, compose: output => finish(parts, output, "model", expandedSource) };
}
export async function translatePhrase(source: string, model: ModelTranslate | null): Promise<PhraseTranslation | null> {
  const plan = planTranslation(source); if (plan.kind === "done") return plan.result; if (plan.kind === "none" || !model) return null;
  const output = sanitizeModelOutput(await model(plan.modelInput), plan.modelInput); return output ? plan.compose(output) : null;
}
