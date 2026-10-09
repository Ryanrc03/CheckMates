import { useTranslationStore } from "@/store/useTranslationStore";
import { translationKey } from "@/lib/translation/normalize";
export function DishLabel({ id, originalName }: { id: string; originalName: string }) {
  const enabled = useTranslationStore(s => s.enabled); const result = useTranslationStore(s => s.results[id]); const pending = useTranslationStore(s => !!s.pending[id]);
  if (!enabled || !translationKey(originalName)) return null;
  if (result && translationKey(result.sourceText) === translationKey(originalName)) return <span className="dish-translation" lang="zh-Hans" data-provider={result.provider}>{result.translatedText}</span>;
  return <span className="dish-translation muted">{pending ? "Translating…" : "Not translated"}</span>;
}
