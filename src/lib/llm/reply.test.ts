import { describe, expect, it } from "vitest";
import { parseLlmReply, UNREADABLE_REPLY } from "./reply";
const item = { printedText: "Pad Thai x 2\nChicken", name: "Pad Thai", nameZh: "泰式炒河粉 (鸡肉)", quantity: 2, unitPrice: "12.90", lineTotal: "25.80", modifiers: ["Chicken"] };
describe("parseLlmReply", () => {
  it("accepts a schema reply, number amounts and a fenced block", () => {
    const reply = parseLlmReply("```json\n" + JSON.stringify({ items: [item, { ...item, lineTotal: 4, quantity: null }], discounts: [], subtotal: "29.80", tax: null, tip: null, total: null, uncertain: [] }) + "\n```");
    expect(reply.items[0]).toEqual(item); expect(reply.items[1].lineTotal).toBe("4"); expect(reply.subtotal).toBe("29.80"); expect(reply.discounts).toEqual([]);
  });
  it("drops bad quantities and indices, fills missing lists, and rejects non-JSON or itemless replies", () => {
    const reply = parseLlmReply(JSON.stringify({ items: [{ ...item, quantity: 0, printedText: "", modifiers: "x" }], discounts: [{ printedText: "Coupon", amount: "2.00", itemIndex: -1 }], subtotal: "", tax: "1.00" }));
    expect(reply.items[0]).toMatchObject({ quantity: null, printedText: "Pad Thai", modifiers: [] }); expect(reply.discounts[0].itemIndex).toBeNull();
    expect(reply.subtotal).toBeNull(); expect(reply.tax).toBe("1.00"); expect(reply.tip).toBeNull(); expect(reply.uncertain).toEqual([]);
    expect(() => parseLlmReply("not json")).toThrow(UNREADABLE_REPLY); expect(() => parseLlmReply("{\"total\":\"1.00\"}")).toThrow(UNREADABLE_REPLY); expect(() => parseLlmReply("{\"items\":[1]}")).toThrow(UNREADABLE_REPLY);
  });
});
