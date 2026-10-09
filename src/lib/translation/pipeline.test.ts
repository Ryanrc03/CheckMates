import { describe, expect, it } from "vitest";
import { normalizeSource, translationKey } from "./normalize";
import { splitProtected, joinProtected } from "./protect";
import { expandAbbreviations } from "./abbreviations";
import { matchModifier } from "./rules";
import { lookupGlossary } from "./glossary";
import { planTranslation, translatePhrase } from "./pipeline";
describe("normalize", () => {
  it("collapses whitespace and full-width punctuation", () => { expect(normalizeSource("  Fried　Tofu （12） ")).toBe("Fried Tofu (12)"); expect(translationKey("Pad  THAI")).toBe("pad thai"); });
});
describe("protect", () => {
  it("keeps quantities, counts and percentages out of the translated core", () => {
    expect(splitProtected("2x Egg Roll")).toEqual({ prefix: "2x ", core: "Egg Roll", suffix: "" });
    expect(splitProtected("Fried Tofu (12)")).toEqual({ prefix: "", core: "Fried Tofu", suffix: " (12)" });
    expect(splitProtected("Service Charge 18%")).toEqual({ prefix: "", core: "Service Charge", suffix: " 18%" });
    expect(splitProtected("Pad Thai ×2")).toEqual({ prefix: "", core: "Pad Thai", suffix: " ×2" });
    expect(splitProtected("12")).toEqual({ prefix: "", core: "12", suffix: "" });
    expect(joinProtected({ prefix: "2x ", core: "Egg Roll", suffix: " (3)" }, "蛋卷")).toBe("2x 蛋卷 (3)");
  });
  it("does not treat a leading x of a word or a trailing word ending in x as a quantity marker", () => {
    expect(splitProtected("3 Xiao Long Bao")).toEqual({ prefix: "3 ", core: "Xiao Long Bao", suffix: "" });
    expect(splitProtected("Bento Box 2")).toEqual({ prefix: "", core: "Bento Box 2", suffix: "" });
    expect(splitProtected("Egg Roll x 2")).toEqual({ prefix: "", core: "Egg Roll", suffix: " x 2" });
  });
});
describe("abbreviations", () => {
  it("expands receipt abbreviations by whole word and keeps ambiguous ones", () => {
    expect(expandAbbreviations("Chkn Fr Rice").text).toBe("Chicken Fried Rice");
    expect(expandAbbreviations("Veg Spr Roll").text).toBe("Vegetable Spring Roll");
    expect(expandAbbreviations("Beef Ndl Soup").text).toBe("Beef Noodle Soup");
    expect(expandAbbreviations("Fr Fries").text).toBe("French Fries");
    expect(expandAbbreviations("Lg Fries").text).toBe("Large Fries");
    expect(expandAbbreviations("Sm Coke").text).toBe("Small Coke");
    expect(expandAbbreviations("Bubble Tea w/ Boba").text).toBe("Bubble Tea with Boba");
    expect(expandAbbreviations("w/o Onion").text).toBe("without Onion");
    expect(expandAbbreviations("GF Pad Thai")).toEqual({ text: "GF Pad Thai", expanded: false });
    expect(expandAbbreviations("BF Combo")).toEqual({ text: "BF Combo", expanded: false });
    expect(expandAbbreviations("Bf Ndl Soup").text).toBe("Beef Noodle Soup");
    expect(expandAbbreviations("Constructor Special")).toEqual({ text: "Constructor Special", expanded: false });
  });
});
describe("rules", () => {
  it("recognises leading modifiers", () => {
    expect(matchModifier("without Onion")).toEqual({ zhPrefix: "不要", rest: "Onion", kind: "negation" });
    expect(matchModifier("No Peanuts")).toEqual({ zhPrefix: "不要", rest: "Peanuts", kind: "negation" });
    expect(matchModifier("Add Avocado")).toEqual({ zhPrefix: "加", rest: "Avocado", kind: "addition" });
    expect(matchModifier("Side of Rice")).toEqual({ zhPrefix: "配", rest: "Rice", kind: "side" });
    expect(matchModifier("Kids Mac & Cheese")).toEqual({ zhPrefix: "儿童", rest: "Mac & Cheese", kind: "kids" });
    expect(matchModifier("Half Rack Ribs")).toEqual({ zhPrefix: "半份", rest: "Rack Ribs", kind: "portion" });
    expect(matchModifier("Hot & Sour Soup")).toBeNull();
  });
});
describe("glossary", () => {
  it("matches whole phrases case-insensitively", () => { expect(lookupGlossary("pad thai")).toBe("泰式炒河粉"); expect(lookupGlossary("PAD THAI")).toBe("泰式炒河粉"); expect(lookupGlossary("Pad Thai Deluxe")).toBeNull(); expect(lookupGlossary("constructor")).toBeNull(); });
});
describe("planTranslation / translatePhrase", () => {
  const cases: [string, string, string][] = [
    ["Pineapple Fried Rice", "菠萝炒饭", "glossary"], ["Fried Tofu (12)", "炸豆腐 (12)", "glossary"], ["Milk Tea", "奶茶", "glossary"], ["Pad Thai", "泰式炒河粉", "glossary"],
    ["Chkn Fr Rice", "鸡肉炒饭", "glossary"], ["Veg Spr Roll", "蔬菜春卷", "glossary"], ["Beef Ndl Soup", "牛肉面", "glossary"], ["w/o Onion", "不要洋葱", "rule"],
    ["No Peanuts", "不要花生", "rule"], ["No Cilantro", "不要香菜", "rule"], ["Extra Spicy", "特辣", "glossary"], ["Lg Fries", "大份薯条", "rule"], ["Sm Coke", "小份可乐", "rule"],
    ["2x Egg Roll", "2x 蛋卷", "glossary"], ["Add Avocado", "加牛油果", "rule"], ["Side of Rice", "配米饭", "glossary"], ["Kids Mac & Cheese", "儿童奶酪通心粉", "glossary"],
    ["Service Charge 18%", "服务费 18%", "glossary"], ["Bubble Tea w/ Boba", "珍珠奶茶", "glossary"], ["Half Rack Ribs", "半份肋排", "glossary"], ["CHKN TIKKA MASALA", "咖喱鸡", "glossary"],
  ];
  it.each(cases)("%s → %s without a model", (source, expected, provider) => { const plan = planTranslation(source); expect(plan.kind).toBe("done"); if (plan.kind === "done") { expect(plan.result.text).toBe(expected); expect(plan.result.provider).toBe(provider); } });
  it("asks the model only for the unknown core and composes modifiers around it", async () => {
    const plan = planTranslation("No Durian Pizza"); expect(plan.kind).toBe("model"); if (plan.kind !== "model") return;
    expect(plan.modelInput).toBe("Durian Pizza"); expect(plan.compose("榴莲披萨").text).toBe("不要榴莲披萨"); expect(plan.compose("榴莲披萨").provider).toBe("model");
    expect(await translatePhrase("Grilled Octopus (2)", async () => "烤章鱼")).toEqual({ text: "烤章鱼 (2)", provider: "model", expandedSource: undefined });
  });
  it("returns null for empty, numeric, too long, or untranslated model output", async () => {
    expect(planTranslation("   ").kind).toBe("none"); expect(planTranslation("12").kind).toBe("none"); expect(planTranslation("x".repeat(121)).kind).toBe("none");
    expect(await translatePhrase("Grilled Octopus", async () => "Grilled Octopus")).toBeNull();
    expect(await translatePhrase("Grilled Octopus", async () => "\"<< 烤 >>")).toBeNull();
    expect(await translatePhrase("Grilled Octopus", null)).toBeNull();
  });
  it("never sends negation or quantity tokens to the model", async () => {
    const seen: string[] = []; await translatePhrase("w/o Durian (2)", async t => { seen.push(t); return "榴莲"; }); expect(seen).toEqual(["Durian"]);
  });
});
