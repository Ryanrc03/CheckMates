export function normalizeSource(text: string): string { return text.normalize("NFKC").replace(/\s+/g, " ").trim(); }
export function translationKey(text: string): string { return normalizeSource(text).toLowerCase(); }
