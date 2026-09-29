# CheckMates V2-A Image Correction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 每张收据照片在 OCR 前独立检测倾斜与边界，给出可调整的校正预览，并从确认后的图像识别。

**Architecture:** 把图像几何和像素分析放在 `src/lib/receipt-image/`；UI 保管当前照片、校正参数和任务代次。自动检测无法确信时保留完整原图。现有 Tesseract 与金额解析不改。

**Tech Stack:** Next.js 16.3.6、React 19、TypeScript、Canvas、Vitest、Playwright。

**Spec:** [2026-09-28-checkmates-v2-image-first-design.md](../specs/2026-09-28-checkmates-v2-image-first-design.md) §1–4、§5 V2-A、§6 图片校正。

**执行状态（2026-09-28）：** V2-A 的本地实现与桌面浏览器回归已完成，证据见[验证记录](../../validation/v2-image-correction.md)。真实 iPhone/Android、完整真实照片集仍未验收，因此尚未发布。V2-B 等待 V2-A demo review 后另起任务。

## Global Constraints

- 每张新照片单独分析，不复用上一张的几何参数。
- 原图仅留浏览器本地；JPEG/PNG/WebP，最大 15 MiB；输出最多 600 万像素。
- 自动校正可被用户覆写，所有导出从源图重算，不能裁掉票底税费。
- V2-A 不更换 OCR 引擎，也不加入翻译、V2-B 菜品解析、结果可视化。
- 用户编辑收据后重新识别，必须先确认替换；迟到任务不能覆写新照片。

## Review Focus

- 整页白底或无清晰边缘：不强行自动裁剪，允许原图继续。
- 四角交叉或过窄：拒绝变换，保留可编辑预览。
- +/−30°、非整数角、90° 用户方向：每张分别估角；不能固定 7°。
- 切换照片、取消、重新识别：异步旧结果不能覆盖当前照片和人工编辑。
- 手机触摸及键盘四角操作：坐标相对图像，不相对页面宽度；不依赖 hover。

---

### Task 1: Isolated baseline and fixtures

**Files:** `tests/fixtures/receipts/`、`tests/e2e/photo-adjustment.spec.ts`。

- [ ] 建立独立 worktree，安装依赖，运行 `npm test` 验证 MVP 基线。
- [ ] 使用现有 synthetic receipt 在测试运行时生成多角度、透视、白底和低对比输入，期望值手工固定。
- [ ] 先写上传后出现照片调整步骤的浏览器测试，运行并确认因步骤缺失失败。
- [ ] 完成后每个新输入都单独验收，不把同图变体计作独立实拍。

### Task 2: Geometric image core

**Files:** 新增 `src/lib/receipt-image/geometry.ts`、`geometry.test.ts`、`render.ts`、`render.test.ts`。

**Interfaces:** `Point = {x:number;y:number}` 为 0–1 归一化坐标；`Quad = [Point,Point,Point,Point]` 顺序左上、右上、右下、左下；`isValidQuad(quad): boolean`；`renderCorrection(source: CanvasImageSource, width:number,height:number, adjustment:{corners:Quad|null;angle:number;quarterTurns:number}, maxPixels:number): HTMLCanvasElement`。

- [ ] 写有效、越界、交叉、退化四角测试，确认失败。
- [ ] 实现四角验证，运行目标测试直至通过。
- [ ] 写透视导出测试：四色角点变换后位置与预期一致，原图不被修改；确认失败。
- [ ] 实现单次从原图采样的透视/旋转导出，最大 600 万像素，白色背景；通过目标测试。

### Task 3: Per-photo detection

**Files:** 新增 `src/lib/receipt-image/analyze.ts`、`analyze.test.ts`。

**Interfaces:** `analyzeReceiptImage(imageData: ImageData): { angle:number; corners:Quad|null; angleReliable:boolean; boundaryReliable:boolean }`；角度单位度，正值表示照片中文字顺时针倾斜。

- [ ] 用已知角度之外的合成图写输入→输出测试，含 ±30°、0°、非整数角与失败返回；确认失败。
- [ ] 实现基于缩略图的文字行投影估角，结果保守；通过测试。
- [ ] 写暗背景梯形和白底无边界测试，确认失败。
- [ ] 实现保守亮纸边界建议；无可靠边界返回 `null`，不推测四角；通过测试。
- [ ] 浏览器中记录桌面性能与未通过样本，必要时收紧可靠性判断。

### Task 4: Photo adjustment UI and OCR handoff

**Files:** 新增 `src/components/receipt/photo-adjustment.tsx`、测试 `tests/e2e/photo-adjustment.spec.ts`；修改 `src/components/bill-wizard.tsx`、`src/components/home/home-step.tsx`、`src/components/receipt/receipt-step.tsx`、`src/app/globals.css`。

**Interfaces:** 当前照片 `File`＋源图 URL；校正状态绑定单张照片；确认按钮调用 `onConfirm(blob)`，OCR 只接收该 Blob。

- [ ] 写浏览器测试：上传后先显示调整界面，确认前无 OCR 请求；确认后识别现有 synthetic fixture；确认失败。
- [ ] 接入照片选择、自动分析和预览；保留手动与 demo 入口；通过测试。
- [ ] 写拖角、键盘移角、角度输入、90°、重置、保留原图和错误恢复测试；确认失败，再实现通过。
- [ ] 写更换照片、取消、旧任务、重新识别确认和已有编辑保护测试；确认失败，再实现通过。
- [ ] 更新原 OCR 浏览器测试，仅适配新增确认步骤，不削弱价格和隐私断言。

### Task 5: Verification and handoff

**Files:** `docs/validation/v2-image-correction.md`、本计划。

- [ ] 运行 `npm test`、`npm run lint`、`npm run build`、`npm run test:e2e`；记录完整结果。
- [ ] 按同图原图/校正后运行 OCR 对照并记录，不混入 V2-B 解析改动。
- [ ] 用真实 iPhone Safari 与 Android Chrome 试拍并记录；若当前环境无法接触物理设备，明确列为未完成验收，不能声称手机通过。
- [ ] 提供本地 demo 地址、已完成与未完成事项，交用户 review 后再开始 V2-B。
