# CheckMates V2.1 OCR Implementation Plan

> 2026-09-28：历史计划，停止按本文件继续执行。未 review 的实现已从主工作区回退，保存在 `backup/unreviewed-v2-20260928`。后续以[先动态校正、再识别菜品的新计划](../specs/2026-09-28-checkmates-v2-image-first-design.md)为准；下文已完成状态仅描述回退前版本。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 只把菜品行总价、税和已收小费填入收费字段，过滤无关数字，并为不确定结果提供明确复核路径。

**Architecture:** 保留浏览器 Tesseract，增加结构化行输出与用途分类。纯函数负责提取和分类；UI 负责处理疑似项；版本化会话保存复核状态。先衡量基线，再用相同实拍证明改进。

**Tech Stack:** Next.js 16.3.6、React、TypeScript、Zustand、Tesseract.js 6.0.1、Vitest、Playwright。

**Spec:** [V2 设计 §1–4、§7](../specs/2026-09-27-checkmates-v2-design.md)。状态（2026-09-28）：本地功能已实现，回归通过；实拍发布门槛仍未验证。代码版本 `4f44e97`，见[验收记录](../../validation/v2-ocr-baseline.md)。

## 本次开发安排（2026-09-27）

用户已授权先写计划再开发。本次执行 V2.1 的完整功能闭环：评估工具 → 用途分类 → 结构化 OCR 与裁剪 → 疑似项复核及会话迁移 → 回归验收。V2.2 结果可视化与 V2.3 翻译保持后续迭代。

由主代理逐项实现，每个行为先写失败测试，完成后做一次独立代码评审。本地功能可交付，但缺少 10 张未重绘实拍 / 4 张留出集时，真实精确率、召回率和 P95 质量门槛必须标记未验证；不能用合成样本补足数量并宣称达标。本次不自动更新生产站点。

## 执行结果（2026-09-28）

| 任务 | 结果 |
| --- | --- |
| 1 质量基线 | 评估函数、语料清单和真实引擎前后记录完成；未补足实拍语料 |
| 2 用途分类 | 已实现并修复独立评审及实际裁剪测试发现的边界错误 |
| 3 结构化 OCR / 裁剪 | 已实现；裁剪取消、应用、完整照片重试和坐标几何回归通过 |
| 4 复核 / 会话迁移 | 已实现；加入、合并、排除、说明、重开、刷新及旧会话恢复通过 |
| 5 验收 / 发布记录 | 本地 63 单测、19 生产模式浏览器测试、lint、build 通过；真实留出集、P95、实体手机和线上预览未验证，未部署 |

复杂衍生样本仍需手填税额，未裁剪有 23 个待复核项，裁剪后 12 个。收费字段召回率在这一个样本上仍为 6/7，不能宣称广泛准确率提升。下方未勾选项保留未完成的验收要求或部分完成的组合要求。V2.2、V2.3 继续按独立计划推进。

## Global Constraints

- 金额仍为非负安全整数分；不为了凑齐总额而猜价格、移动小数点或补小费。
- 主界面继续使用英文；本文中文描述为需求说明，新区域使用 `Needs review` / `Ignored information`。
- 照片与识别默认在浏览器内处理，不上传小票。
- 保留取消、120 秒超时、重试、手动录入和刷新恢复。
- `bitesplit-session` 保留作为兼容存储键。扩展后写入版本 2，并迁移版本 1。
- 修改 Next.js 代码前先阅读本仓库 `node_modules/next/dist/docs/` 中相应指南。
- 未重绘实拍、遮盖衍生样本和排版合成样本分开统计；语料不足不得宣称真实准确率达标。

## Review Focus

1. `Tax ID` / `Total savings` / `Table Salt Fries` 被关键词误分类：Task 2 加精确断言。
2. 两道同价同名菜被错误合并；跨行标签关联到错误金额：Task 2 验证独立行证据和邻接边界。
3. 第一条菜品缺价或只有名称被静默丢弃：Task 2/4 验证待确认列表和恢复动作。
4. 旋转裁剪后坐标错误、旧请求在重置后写回：Task 3/4 验证不同角度和取消竞态。
5. 噪声被过滤但真实收费也大量遗漏：Task 1/5 同时报告精确率、召回率和待复核率。

## 文件边界与数据合同

- 新增 `src/types/ocr.ts`：`OcrWord`、`OcrLine`、`OcrDocument`、`NormalizedRect`。
- 新增 `src/lib/ocr/classifyLines.ts`：行用途；`extractReceipt.ts`：聚合为草稿；`evidence.ts`：复核数据验证。
- 修改 `src/lib/ocr/parseReceipt.ts`：保留 `parseReceiptText(text: string): ReceiptDraft` 作为兼容包装。
- 修改 worker/client/preprocess、`src/types/receipt.ts`、session/store：完整传播结构化结果及复核状态。
- 新增 `src/components/receipt/crop-editor.tsx`、`receipt-review.tsx`：裁剪和疑似项复核。

合同：`BBox={x0:number,y0:number,x1:number,y1:number}`，像素坐标相对本次送入 OCR 的处理图；`OcrWord={text:string,confidence:number|null,bbox:BBox|null}`；`OcrLine={id:string,text:string,confidence:number|null,bbox:BBox|null,words:OcrWord[]}`；`OcrDocument={text:string,confidence:number|null,lines:OcrLine[]}`。无结构化输出时以纯文本行构建 `bbox:null` 的兼容结果，不能伪造坐标。

`ClassifiedLine={lineIds:string[],role:'item'|'tax'|'chargedTip'|'subtotal'|'total'|'metadata'|'suggestion'|'unitPrice'|'modifier'|'unknownFinancial'|'unknown',label:string,amountCents:number|null,reason:string}`。

`ReviewCandidate={id:string,lineIds:string[],text:string,amountCents:number|null,kind:'possibleItem'|'ambiguousAmount'|'unsupportedFee',reason:string}`；`ReviewDecision={candidateId:string,action:'include'|'merge'|'exclude'|'manualCorrection',targetItemId?:string,note:string}`。含混财务疑点的排除/修正必须填写说明。

`ReceiptDraft` 新增可选 `evidence:{version:1,lines:OcrLine[],review:ReviewCandidate[],decisions:ReviewDecision[],ignored:ClassifiedLine[]}`。旧草稿没有 evidence 也可正常恢复。不持久化 Worker、图片或裁剪预览 URL。

### Task 1：建立可重复的提取质量基线

**Files:** Create `tests/fixtures/receipts-v2/manifest.json`, `tests/e2e/ocr-quality.spec.ts`, `docs/validation/v2-ocr-baseline.md`。Extend `tests/fixtures/receipts/README.md`。

**Interfaces:** 标注包含 `id`、`kind`（real/derivative/synthetic）、来源许可、SHA-256、dev/holdout 分组、`fields:[{id,role,amountCents,sourceText}]`。实拍观察表逐项人工绑定到标注 ID；同价条目不能仅凭金额匹配。输出 TP/FP/FN 原始计数与指标，不向应用注入标注值。

- [ ] 收集设计规定的 10 张实拍/100 条收费行，先分 6/4 再改规则；原图只用于授权的本机验收，公开版本去除交易标识且不重绘菜品文字。素材不足仍可完成工具，但报告标记验收缺口。
- [x] 为报告计数建立固定案例：标注 10 项，9 项正确接纳、1 项漏掉、额外接纳 1 项元数据，断言 `TP=9,FP=1,FN=1,precision=0.9,recall=0.9`；全不接纳时 precision 为 null、recall 为 0，不能记成 100%。
- [ ] 运行真实浏览器 OCR，记录 MVP 的自动结果、错误类型、手工修正次数和耗时；把 Line Thai 衍生图单列。对所有原始文本和报告检查交易识别信息。
- [x] Run `npm.cmd run test:e2e -- --grep 'OCR quality baseline'`；预期真实引擎输出与报告生成成功，低基线指标不会被包装成 V2 通过。
- [x] 提交可复现的语料清单、评估流程和报告；尚无授权的照片路径保持本地忽略，不加入 Git。

### Task 2：实现基于证据的用途分类与草稿组装

**Files:** Create `src/types/ocr.ts`, `src/lib/ocr/classifyLines.ts`, `src/lib/ocr/extractReceipt.ts`, `src/lib/ocr/evidence.ts`, `src/lib/ocr/classifyLines.test.ts`, `src/lib/ocr/extractReceipt.test.ts`；Modify `src/lib/ocr/parseReceipt.ts`, `src/lib/ocr/parseReceipt.test.ts`, `src/types/receipt.ts`。

**Interfaces:** `classifyReceiptLines(doc: OcrDocument): ClassifiedLine[]`；`extractReceipt(doc: OcrDocument): ReceiptDraft`。`parseReceiptText` 调用同一提取器，不保留第二套金额算法。

- [x] 先写并观察失败的断言：`Tax ID 123456` 不产生税；`Total savings 2.00` 不产生总计；`Table Salt Fries $4.00` 保留为菜品；`Visa $78.48` 不成为菜品。
- [x] 增加固定数据：`Pad Thai x2 $25.80 / ($12.90 each)` 只有 2580 分收费；`Tax (8.25%) $5.98` 得 598 分；`Gratuity (18%) $4.00` 在已收区域得 400 分；同数字出现在 Suggested tip 区域时不计费。
- [x] 增加结构化行样例：名称/金额分栏，税标签下一行金额，两个各 $8.00 的真实 Soup 行；断言不漏收费、不按同名同价去重、不跨越付款/元数据边界借金额。
- [x] 将原“首个缺价菜不能丢失”回归改为意图等价断言：`Soup 8.0 / Salad 5.00` 的 Soup 出现在 `evidence.review`，Salad 为 500 分；木纹随机文字不自动成为收费菜。服务费/负折扣进入 unsupportedFee，必须有可见复核项。
- [x] 按用途优先级实现：建议区域/元数据 → 费用标签 → 带价菜 → 单价/备注 → 疑似项；标签用上下文语法而非任意子串。金额解析复用 `parseMoney`，不把百分比或整数编号当价格。
- [x] Run `npm.cmd test -- src/lib/ocr/parseReceipt.test.ts src/lib/ocr/classifyLines.test.ts src/lib/ocr/extractReceipt.test.ts`；预期上述精确结果、现有总额对账回归全部通过，再提交。

### Task 3：连接结构化 OCR 与手机手动裁剪

**Files:** Modify `src/lib/ocr/worker.ts`, `src/lib/ocr/client.ts`, `src/lib/ocr/preprocess.ts`, `src/components/bill-wizard.tsx`, `src/lib/ocr/worker.test.ts`, `src/lib/ocr/client.test.ts`；Create `src/components/receipt/crop-editor.tsx`, `src/lib/ocr/preprocess.test.ts`。

**Interfaces:** `OcrWorker.recognize(image:Blob):Promise<{data:OcrDocument}>`；`recognizeReceipt` 传播 `OcrDocument`；`prepareReceiptImage(file:File,rotation:0|90|180|270,crop?:NormalizedRect):Promise<Blob>`；`NormalizedRect={x:number,y:number,width:number,height:number}`，取值位于 0..1，基于旋转后的可见预览。

- [x] 先写失败测试：worker 请求 `output:{text:true,blocks:true}`，安全展开 block/paragraph/line/word；空 blocks 回退为纯文本，畸形 bbox 不参与空间推断，置信度缺失不会变成 100%。
- [x] 加裁剪几何测试：归一化框 `(0.25,0.25,0.5,0.5)` 在旋转后 1000×2000 图上对应 x=250,y=500,w=500,h=1000；90° 旋转以 2000×1000 尺寸计算。越界/零面积被拒绝，取消裁剪保持当前草稿。
- [x] 在现有 worker 协议适配器中请求 blocks，并扩展类型传播。保留初始化期间 terminate 能力；不要换回无法及时取得 worker 的高层工厂。
- [x] 实现可触摸和键盘调整的裁剪框；“应用并识别”显式触发，先旋转再裁剪、最后按现有 6MP 上限缩放。提供未裁剪重试；保留当前覆盖编辑的确认流程。
- [ ] 测试 worker 下载失败、连续换图、裁剪后取消、重置后的迟到结果；实际旋转矩形票据检查裁剪方向。裁剪不把票面税/总计区域默认切掉。
- [x] Run `npm.cmd test -- src/lib/ocr` 和相关真实 OCR 浏览器用例；保持原有 120 秒错误路径，成功后提交。

### Task 4：让疑似项可处理，并迁移旧账单

**Files:** Create `src/components/receipt/receipt-review.tsx`, `src/lib/session.test.ts`, `src/lib/ocr/evidence.test.ts`, `tests/e2e/receipt-review.spec.ts`；Modify `src/components/receipt/receipt-step.tsx`, `src/lib/session.ts`, `src/lib/ocr/evidence.ts`, `src/store/useBillStore.ts`, `src/store/useBillStore.test.ts`。

**Interfaces:** `decodeSessionEnvelope(input:unknown):BillSession|null` 支持旧 `{version:1,state}` 和新 `{version:2,state}`；store 的 `resolveReceiptCandidate(decision:ReviewDecision,nextEdit:ReceiptEdit):void` 原子保存决策与表单快照。操作 include/merge 必须对应稳定 item ID，不能凭列表索引修改菜品。

- [x] 先写失败测试：版本 1 的账单、未完成输入、人员分配原样恢复；版本 2 evidence 的外来属性不恢复成 action；损坏坐标/决策不能使应用崩溃。reset 后新 store 不能读回旧复核决定。
- [x] 新增“待确认 N 项”，展示原行、候选用途和原因。疑似菜支持补价加入；备注可并入指定菜；排除保留记录；unsupportedFee 要填写实际处理说明。待处理疑点未清零时，下一步聚焦该区域。
- [x] 复核动作先由当前编辑值生成 nextEdit，同一事件更新 ReceiptStep 本地编辑状态并调用 resolveReceiptCandidate；不能只更新 store 而被旧表单 effect 覆盖。测试加入缺价菜后立即刷新，价格、ID 和决策共同恢复；无效目标 ID 不能记录为已处理。
- [x] 沿用显式人工复核和票面总计差额检查，增加逐项决策约束。候选被删除或合并后重新计算待确认数，不能用总勾选掩盖未解决的收费项。
- [x] v1 无新证据字段时正常展示旧表单；新识别后才创建证据。保留 `bitesplit-session`，写入 schema 2，存储失败继续显示原有警告。
- [x] Run `npm.cmd test -- src/store src/lib/session.test.ts`（新增 session 测试文件）和 `npm.cmd run test:e2e -- --grep 'receipt review'`；覆盖加入、合并、排除、刷新及重置，再提交。

### Task 5：实拍留出验收与发布记录

**Files:** Update `tests/e2e/ocr-quality.spec.ts`, `docs/validation/v2-ocr-baseline.md`, `docs/verification.md`, `README.md`。

**Interfaces:** 消费 Task 1 的固定语料和 Task 2–4 的结果；输出同版本、同设备的 before/after 报告。

- [ ] 在未用于调参的 4 张实拍和固定干扰集上运行；报告有用收费项精确率 ≥98%、精确金额召回率 ≥90% 是否达成，以及每个失败样例，不以合成图替代实拍。
- [x] 校验 Line Thai 收费 `[1390,790,400,2580,1290,800]`，人工确认税 598 后总计 7848，A/B 各3924；结果要区分自动正确与人工修正。
- [ ] 验证裁剪后含糊税率、手写小费、未知折扣仍提示复核；试验任何新规则后不得反复调留出集再称其为独立验收。
- [ ] Run `npm.cmd run lint`、`npm.cmd test`、`npm.cmd run build`，再以生产服务运行 `npm.cmd run test:e2e`；同时记录同机 P95 与 MVP 比值。Windows 可单独启动 3200 服务并设置 `E2E_PRODUCTION=1`。
- [ ] 保存质量结论及限制。满足门槛才给出 V2.1 发布建议；先发布预览验证线上 OCR 资源和隐私请求，再依实施时的发布授权升级生产。提交验收记录。
