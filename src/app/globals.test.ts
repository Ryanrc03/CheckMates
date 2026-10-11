import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

const css = readFileSync(new URL("./globals.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

function topLevel(source: string) {
  const statements: { head: string; body: string }[] = []; let depth = 0, start = 0, head = "";
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (c === "{") { if (depth === 0) { head = source.slice(start, i).trim(); start = i + 1; } depth++; }
    else if (c === "}") { depth--; if (depth === 0) { statements.push({ head, body: source.slice(start, i) }); start = i + 1; } }
    else if (c === ";" && depth === 0) { statements.push({ head: source.slice(start, i).trim(), body: "" }); start = i + 1; }
  }
  return statements;
}
const statements = topLevel(css);
const outsideRoot = statements.filter(s => s.head !== ":root").map(s => `${s.head}{${s.body}}`).join("\n");

it("keeps every rule inside a cascade layer or a token block", () => {
  expect(statements.map(s => s.head).filter(head => !/^(@import|@custom-variant|@theme|:root$|@layer)/.test(head))).toEqual([]);
});

it("keeps color literals inside :root", () => {
  expect(outsideRoot.match(/#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab)\(|(?<![-\w])(?:white|black)(?![-\w])/gi) ?? []).toEqual([]);
});

it("keeps every font size at 12px or larger", () => {
  const sizes = [...css.matchAll(/font(?:-size)?\s*:\s*([^;{}]+)/g)].flatMap(m => [...m[1].matchAll(/(\d*\.?\d+)(px|rem)\b/g)].map(n => Number(n[1]) * (n[2] === "rem" ? 16 : 1)));
  expect(sizes.filter(size => size < 12)).toEqual([]);
});

it("never restyles shadcn primitives through data-slot selectors", () => {
  expect(css).not.toMatch(/\[data-slot/);
});

// Chromium resolves color-mix(in oklch, <color>, transparent) to hue "none", which renders the tint pink; alpha-only mixes use srgb.
it("mixes with transparent in srgb", () => {
  expect(css).not.toMatch(/color-mix\(in oklch[^;]*transparent/);
});
