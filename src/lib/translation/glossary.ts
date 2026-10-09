import { GLOSSARY } from "./glossary-data";
import { translationKey } from "./normalize";
export function lookupGlossary(phrase: string): string | null { const key = translationKey(phrase); return Object.hasOwn(GLOSSARY, key) ? GLOSSARY[key] : null; }
