import { describe, expect, it } from "vitest";
import { CLOUD_STAGE, cloudSteps } from "./progress";
describe("cloudSteps", () => {
  it("walks from preparing to reading and keeps the check pending", () => {
    expect(cloudSteps("Reading your receipt").map(s => s.state)).toEqual(["active", "pending", "pending"]); // the wizard's first stage, before the recognizer reports
    expect(cloudSteps(CLOUD_STAGE.prepare).map(s => s.state)).toEqual(["active", "pending", "pending"]);
    expect(cloudSteps(CLOUD_STAGE.read).map(s => [s.label, s.state])).toEqual([["压缩照片", "done"], ["通义千问读小票", "active"], ["核对金额", "pending"]]);
  });
  it("turns the last step into the line-by-line recheck when the totals did not match", () => {
    expect(cloudSteps(CLOUD_STAGE.recheck).map(s => [s.label, s.state])).toEqual([["压缩照片", "done"], ["通义千问读小票", "done"], ["重新逐行核对", "active"]]);
    expect(cloudSteps(CLOUD_STAGE.recheck)[2].detail).toContain("小计");
  });
});
