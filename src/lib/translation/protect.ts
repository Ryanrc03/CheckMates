export type ProtectedParts = { prefix: string; core: string; suffix: string };
// "2x", "2 x", "x2" or a bare count before a word; the x must not start a word ("3 Xiao Long Bao").
const LEADING = /^(?:\d+\s*[x×](?![a-z])\s*|[x×]\s*\d+\s*|\d+\s+(?=[a-z]))/i;
// "(12)", "(12 pcs)", " x2", " ×2", "×2", "18%", "$12.00"; a quantity x needs a space before it so "Box 2" stays whole.
const TRAILING = /(?:\s*\(\s*\d+(?:\s*(?:pc|pcs|ea|each))?\s*\)|\s+[x×]\s*\d+|×\s*\d+|\s*\d+(?:\.\d+)?\s*%|\s*\$\s*\d+(?:\.\d{2})?)+$/i;
export function splitProtected(source: string): ProtectedParts {
  let core = source; let prefix = ""; let suffix = "";
  const lead = core.match(LEADING); if (lead) { prefix = lead[0].replace(/\s+$/, "") + " "; core = core.slice(lead[0].length); }
  const trail = core.match(TRAILING); if (trail && trail.index !== undefined && trail.index > 0) { suffix = " " + trail[0].trim(); core = core.slice(0, trail.index); }
  return { prefix, core: core.trim(), suffix };
}
export function joinProtected(parts: ProtectedParts, translatedCore: string): string { return `${parts.prefix}${translatedCore}${parts.suffix}`.trim(); }
