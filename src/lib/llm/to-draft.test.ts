import { describe, expect, it } from "vitest";
import { isDraft } from "@/lib/session";
import type { LlmItem, LlmReceipt } from "./reply";
import { mergeReadings, readingProblem, toDraft } from "./to-draft";
const line = (name: string, lineTotal: string | null, extra: Partial<LlmItem> = {}): LlmItem => ({ printedText: name, name, nameZh: "", quantity: null, unitPrice: null, lineTotal, modifiers: [], ...extra });
const receipt = (items: LlmItem[], extra: Partial<LlmReceipt> = {}): LlmReceipt => ({ items, discounts: [], subtotal: null, tax: null, tip: null, total: null, uncertain: [], ...extra });
describe("toDraft", () => {
  it("maps a Line Thai style reply to a valid draft with cents, details and Chinese names", () => {
    const { draft, translations } = toDraft(receipt([line("Pad Thai", "25.80", { printedText: "Pad Thai x 2\nChicken\n($12.90 each)", nameZh: "泰式炒河粉 (鸡肉)", quantity: 2, unitPrice: "12.90", modifiers: ["Chicken"] }), line("Milk Tea", "$4.00", { nameZh: "奶茶" }), line("  ", "1.00")], { subtotal: "29.80", tax: "2.46", total: "32.26" }), "qwen3.5-plus");
    expect(isDraft(draft)).toBe(true);
    expect(draft.items.map(i => [i.name, i.priceCents])).toEqual([["Pad Thai", 2580], ["Milk Tea", 400]]);
    expect(draft.items[0].details).toMatchObject({ quantity: 2, unitPriceCents: 1290, printedPriceCents: 2580, sourceLines: ["Pad Thai x 2", "Chicken", "($12.90 each)"], modifiers: [{ text: "Chicken", sourceLine: "Chicken" }], discounts: [], reviewCodes: [] });
    expect([draft.printedSubtotalCents, draft.taxCents, draft.tipCents, draft.printedTotalCents]).toEqual([2980, 246, 0, 3226]);
    expect(translations).toEqual([{ name: "Pad Thai", text: "泰式炒河粉 (鸡肉)" }, { name: "Milk Tea", text: "奶茶" }]); expect(draft.rawText).toContain("qwen3.5-plus");
  });
  it("drops a Chinese name that adds a protein the receipt never prints, and keeps the rest", () => {
    const { translations } = toDraft(receipt([
      line("Pad Kra Pow", "12.90", { modifiers: ["Chicken"], nameZh: "打抛猪肉饭" }), line("Pad Kra Pow", "12.90", { modifiers: ["Chicken"], nameZh: "打抛饭 (鸡肉)" }), line("Kung Pao Chicken", "11.00", { nameZh: "宫保鸡丁" }),
      line("Fried Calamari", "9.00", { nameZh: "炸鱿鱼" }), line("Brown Sugar Milk", "8.00", { nameZh: "黑糖牛奶" }), line("Beef Pho", "13.00", { nameZh: "牛肉河粉" }),
    ]), "m");
    expect(translations.map(t => t.text)).toEqual(["打抛饭 (鸡肉)", "宫保鸡丁", "炸鱿鱼", "黑糖牛奶", "牛肉河粉"]);
  });
  it("keeps Chinese names whose protein-looking characters are not proteins, or are printed, and drops invented ones", () => {
    const keep: [string, string, Partial<LlmItem>?][] = [["Egg Fried Rice", "鸡蛋炒饭"], ["House Cocktail", "鸡尾酒"], ["Avocado Toast", "牛油果吐司"], ["Croissant", "牛角包"], ["Escargot", "法式蜗牛"], ["Eggplant with Garlic Sauce", "鱼香茄子"], ["Fish Sauce Wings", "越南鱼露鸡翅"], ["Har Gow", "虾饺"], ["Lobster Roll", "龙虾卷"], ["Kani Salad", "蟹柳沙拉"], ["Unagi Roll", "鳗鱼卷"], ["Takoyaki", "章鱼小丸子"], ["Bulgogi", "韩式烤牛肉"], ["Chashu Ramen", "叉烧拉面"], ["Karaage", "日式炸鸡"], ["宫保鸡丁", "宫保鸡丁", { printedText: "宫保鸡丁" }]];
    const { translations: kept } = toDraft(receipt(keep.map(([name, nameZh, extra]) => line(name, "5.00", { nameZh, ...extra }))), "m"); expect(kept.map(t => t.text)).toEqual(keep.map(k => k[1]));
    const drop = [line("Pad Kra Pow", "5.00", { modifiers: ["Chicken"], nameZh: "打抛猪肉饭" }), line("Kung Pao Shrimp", "5.00", { nameZh: "宫保鸡丁" }), line("Pho", "5.00", { modifiers: ["Chicken"], nameZh: "牛肉河粉" }), line("Fried Tofu", "5.00", { nameZh: "红烧鱼" })];
    expect(toDraft(receipt(drop), "m").translations).toEqual([]);
  });
  it("keeps unreadable amounts null with a warning and leaves every discount for the user", () => {
    const { draft } = toDraft(receipt([line("Soup", "8.2?"), line("Toast", "6.00")], { discounts: [{ printedText: "Toast coupon", amount: "-1.00", itemIndex: 1 }, { printedText: "Happy hour", amount: "2.00", itemIndex: null }], uncertain: ["soup amount smudged"] }), "m");
    expect(draft.items[0].priceCents).toBeNull(); expect(draft.items[1].details?.discounts).toEqual([{ discountCents: 100, inclusion: "unresolved", sourceLine: "Toast coupon" }]); expect(draft.items[1].details?.reviewCodes).toEqual(["discount"]);
    expect(draft.unassignedDiscounts).toEqual(["Happy hour"]); expect(draft.warnings).toEqual(["Cloud recognition was unsure: soup amount smudged", "Could not read the amount \"8.2?\" for Soup. Enter it from the photo."]);
  });
});
describe("readingProblem", () => {
  const draft = (items: LlmItem[], extra: Partial<LlmReceipt> = {}) => toDraft(receipt(items, extra), "m").draft;
  it("accepts items that add up to the printed subtotal, or to the total with tax and tip", () => {
    expect(readingProblem(draft([line("A", "4.00"), line("B", "12.90")], { subtotal: "16.90" }))).toBeNull();
    expect(readingProblem(draft([line("A", "4.00")], { tax: "0.33", tip: "1.00", total: "5.33" }))).toBeNull();
    expect(readingProblem(draft([line("A", "4.00")]))).toBeNull(); // nothing printed to check against
  });
  it("names the gap, unreadable amounts and an empty reading, and skips the sum when a discount is listed", () => {
    expect(readingProblem(draft([line("A", "4.00")], { subtotal: "16.90" }))).toBe("Its item amounts add up to $4.00, but the printed subtotal is $16.90.");
    expect(readingProblem(draft([line("A", null)]))).toBe("The amounts for A were unreadable.");
    expect(readingProblem(draft([]))).toBe("It lists no items.");
    expect(readingProblem(draft([line("A", "4.00")], { subtotal: "3.00", discounts: [{ printedText: "Coupon", amount: "1.00", itemIndex: 0 }] }))).toBeNull();
  });
});
describe("mergeReadings", () => {
  const reading = (items: LlmItem[], subtotal: string) => toDraft(receipt(items, { subtotal }), "m");
  it("prefers a balanced second reading as is", () => {
    const second = reading([line("A", "4.00"), line("B", "12.90")], "16.90");
    expect(mergeReadings(reading([line("A", "4.00")], "16.90"), second)).toBe(second);
  });
  it("blanks amounts the readings disagree on and lists lines only one reading found", () => {
    const { draft } = mergeReadings(reading([line("Pad Thai", "12.90"), line("Tea", "3.00")], "17.90"), reading([line("Pad Thai", "13.00"), line("Rice", "2.00")], "17.90"));
    expect(draft.items.map(i => [i.name, i.priceCents])).toEqual([["Pad Thai", null], ["Rice", 200]]); expect(draft.items[0].details?.reviewCodes).toEqual(["ocr-price"]);
    expect(draft.warnings).toEqual(["Two readings disagree on the amount for Pad Thai ($12.90 or $13.00). Enter the printed amount.", "Only the second reading found Rice. Check it against the photo.", "The first reading also found Tea ($3.00). Add it if it is on the receipt."]);
  });
});
describe("review fixes", () => {
  const reading = (items: LlmItem[], subtotal: string) => toDraft(receipt(items, { subtotal }), "m");
  it("keeps the first reading when the recheck finds no items", () => {
    const first = reading([line("A", "4.00")], "16.90");
    const { draft } = mergeReadings(first, reading([], "16.90"));
    expect(draft.items.map(i => [i.name, i.priceCents])).toEqual([["A", 400]]);
    expect(draft.warnings).toEqual(["The double-check found no items; showing the first reading. Compare every line with the photo."]);
  });
  it("matches non-Latin names across readings", () => {
    const { draft } = mergeReadings(reading([line("宫保鸡丁", "12.00"), line("麻婆豆腐", "9.00")], "27.00"), reading([line("酸辣汤", "6.00"), line("麻婆豆腐", "9.00")], "27.00"));
    expect(draft.items.map(i => [i.name, i.priceCents])).toEqual([["酸辣汤", 600], ["麻婆豆腐", 900]]);
    expect(draft.warnings).toContain("Only the second reading found 酸辣汤. Check it against the photo.");
    expect(draft.warnings).toContain("The first reading also found 宫保鸡丁 ($12.00). Add it if it is on the receipt.");
  });
  it("warns about unreadable subtotal, tax and tip instead of dropping them", () => {
    const { draft } = toDraft(receipt([line("A", "4.00")], { subtotal: "4.0?", tax: "0.3?", tip: "1.0?", total: "5.3?" }), "m");
    expect([draft.printedSubtotalCents, draft.taxCents, draft.tipCents, draft.printedTotalCents]).toEqual([null, null, null, null]);
    expect(draft.warnings).toEqual(["Could not read the printed subtotal \"4.0?\". Enter it from the photo.", "Could not read the printed tax \"0.3?\". Enter it from the photo.", "Could not read the printed tip \"1.0?\". Enter it from the photo.", "Could not read the printed total \"5.3?\". Enter it from the photo."]);
    expect(isDraft(draft)).toBe(true);
  });
  it("reads thousands separators but not a decimal comma", () => {
    expect(toDraft(receipt([line("A", "1,234.50")]), "m").draft.items[0].priceCents).toBe(123450);
    const { draft } = toDraft(receipt([line("A", "12,90")]), "m");
    expect(draft.items[0].priceCents).toBeNull(); expect(draft.warnings).toEqual(["Could not read the amount \"12,90\" for A. Enter it from the photo."]);
  });
  it("does not double the minus sign of a discount in rawText", () => {
    const { draft } = toDraft(receipt([line("A", "4.00")], { discounts: [{ printedText: "Coupon", amount: "-1.00", itemIndex: 0 }] }), "m");
    expect(draft.rawText).toContain("Coupon  -1.00"); expect(draft.rawText).not.toContain("--");
  });
  it("fills an unreadable amount from the other reading", () => {
    const { draft } = mergeReadings(reading([line("A", "4.00"), line("B", "2.00")], "9.00"), reading([line("A", null), line("B", "2.00")], "9.00"));
    expect(draft.items.map(i => i.priceCents)).toEqual([400, 200]); expect(draft.warnings).toEqual(["Only one reading could read the amount for A. Check it against the photo."]);
  });
  it("pairs duplicate names in order", () => {
    const { draft } = mergeReadings(reading([line("Tea", "3.00"), line("Tea", "3.00")], "9.00"), reading([line("Tea", "3.00"), line("Tea", "3.00"), line("Rice", "2.00")], "9.00"));
    expect(draft.items.map(i => i.priceCents)).toEqual([300, 300, 200]); expect(draft.warnings).toEqual(["Only the second reading found Rice. Check it against the photo."]);
  });
  it("names an unreadable tip instead of blaming the items", () => {
    expect(readingProblem(toDraft(receipt([line("A", "4.00")], { tax: "0.33", tip: "1.0?", total: "5.33" }), "m").draft)).toBe("The printed tip was unreadable.");
  });
  it("pairs names that differ only in Unicode normalization", () => {
    const { draft } = mergeReadings(reading([line("Crème", "5.00")], "7.00"), reading([line("Crème", "6.00")], "7.00"));
    expect(draft.items[0].priceCents).toBeNull(); expect(draft.warnings).toEqual(["Two readings disagree on the amount for Crème ($5.00 or $6.00). Enter the printed amount."]);
  });
});
