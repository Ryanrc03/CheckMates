export const CLOUD_STAGE = { prepare: "Preparing the photo", read: "Reading with cloud recognition", recheck: "Double-checking every line" } as const;
export type CloudStep = { label: string; detail: string; state: "done" | "active" | "pending" };
/** The cloud status is shown in Chinese at the user's request (2026-10-23); stages are the strings recognize.ts reports through onProgress. */
export function cloudSteps(stage: string): CloudStep[] {
  const at = stage === CLOUD_STAGE.recheck ? 2 : stage === CLOUD_STAGE.read ? 1 : 0;
  const steps = [{ label: "压缩照片", detail: "把校正后的照片转成小尺寸 JPEG，上传更快" }, { label: "通义千问读小票", detail: "逐行识别菜名、金额、税和小费，同时翻译中文菜名" },
    at === 2 ? { label: "重新逐行核对", detail: "菜品合计和小票上的小计对不上，再读一遍找漏掉或看错的行" } : { label: "核对金额", detail: "检查菜品合计是否等于小票上的小计和总额" }];
  return steps.map((step, i) => ({ ...step, state: i < at ? "done" : i === at ? "active" : "pending" }));
}
