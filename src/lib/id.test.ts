import { afterEach, describe, expect, it, vi } from "vitest";
import { newId } from "./id";
const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
describe("newId", () => {
  afterEach(() => { vi.unstubAllGlobals(); });
  it("uses crypto.randomUUID when the browser offers it", () => {
    vi.stubGlobal("crypto", { randomUUID: () => "11111111-2222-4333-8444-555555555555", getRandomValues: (a: Uint8Array) => a });
    expect(newId()).toBe("11111111-2222-4333-8444-555555555555");
  });
  it("still produces unique v4 ids without randomUUID (plain http on a LAN is not a secure context)", () => {
    const real = globalThis.crypto; vi.stubGlobal("crypto", { getRandomValues: (a: Uint8Array) => real.getRandomValues(a) }); // no randomUUID on the stub
    const ids = Array.from({ length: 50 }, () => newId());
    for (const id of ids) expect(id).toMatch(V4);
    expect(new Set(ids).size).toBe(50);
  });
});
