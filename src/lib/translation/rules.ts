export type ModifierKind = "negation" | "addition" | "side" | "size" | "kids" | "portion";
export type ModifierMatch = { zhPrefix: string; rest: string; kind: ModifierKind };
const MODIFIERS: { pattern: RegExp; zhPrefix: string; kind: ModifierKind }[] = [
  { pattern: /^(?:no|without|hold|skip|minus)\s+(.+)$/i, zhPrefix: "不要", kind: "negation" },
  { pattern: /^(?:extra|add|added|with|plus)\s+(.+)$/i, zhPrefix: "加", kind: "addition" },
  { pattern: /^(?:side of|side)\s+(.+)$/i, zhPrefix: "配", kind: "side" },
  { pattern: /^(?:large)\s+(.+)$/i, zhPrefix: "大份", kind: "size" },
  { pattern: /^(?:small)\s+(.+)$/i, zhPrefix: "小份", kind: "size" },
  { pattern: /^(?:medium)\s+(.+)$/i, zhPrefix: "中份", kind: "size" },
  { pattern: /^(?:kids?|kid's|children's|child)\s+(.+)$/i, zhPrefix: "儿童", kind: "kids" },
  { pattern: /^(?:half)\s+(.+)$/i, zhPrefix: "半份", kind: "portion" },
  { pattern: /^(?:double)\s+(.+)$/i, zhPrefix: "双份", kind: "portion" },
];
export function matchModifier(core: string): ModifierMatch | null {
  for (const { pattern, zhPrefix, kind } of MODIFIERS) { const match = core.match(pattern); if (match && match[1].trim()) return { zhPrefix, rest: match[1].trim(), kind }; }
  return null;
}
