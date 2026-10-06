# CheckMates Weighted Split & Receipt Recognition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task after user review. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 单道菜支持均分、比例与实际数量分摊，并可靠区分复杂小票的数量、净行价、附属项、折扣、税费与付款信息。

**Architecture:** 复用整数分最大余数分配器，新增单一 allocation 合同并迁移 session。识别保持本地 Tesseract，分开做版面归一化、行分类关联、金额校验与人工复核；confirmed bill 只计算净行价。

**Tech Stack:** 现有 Next.js 16.3.6、React 19.2.8、TypeScript、Zustand、Tesseract.js 6.0.1、Vitest、Playwright；默认不新增运行时依赖。

**Spec:** [设计与三张小票分析](../specs/2026-10-06-weighted-split-receipt-recognition-design.md)。基线 `main@8ce4d03`；状态：**待 review，未执行。** 本计划不是开发授权；用户要求本轮止于计划。

## Global Constraints

- 保持英文产品界面、USD、非负安全整数分；权重与数量也是安全整数。算法内部 BigInt，session 不存 BigInt 或派生金额。
- session 升至 2；v1 迁移为 equal allocation，保留已有编辑文本；未知版本安全恢复。
- 图片留在浏览器；本轮原图与原始 OCR 仅保存在被 Git 忽略的 `.private/receipt-upgrade/2026-10-06/`。
- purchase quantity、可分配单位总数和个人 units 分离；不把小票数量直接当鸡翅个数。
- 比例按权重归一化；数量必须分完；税/小费总池规则与稳定余数顺序保持现有定义。
- 折扣支持净价/未扣/未确定三种状态；未确定不能确认；不造负商品，不重复扣款，不按菜名合并。
- 浏览器 OCR 总预算 120 秒、最多一次增强候选；取消/重选/错误不覆盖已有编辑；人工修正与原始识别结果分别记录。
- 375px / 1280px 无横向溢出，金额有文本，控件支持键盘。
- 产品代码前重新阅读 repo 的 AGENTS.md 与 `node_modules/next/dist/docs/` 相关指南。此次规划已查看 Server/Client Components 与 use-client；保留现有 BillWizard client 边界。
- 2026-09-29 Result 解释计划待执行，本轮不并入完整图表 UI；不覆盖当前已有未提交文档，不自动推送或部署。

## Review Focus

1. 一份菜与六个鸡翅、菜单编号与购买数量混淆：数量建议不得替用户确定食用份额（Task 1/3/4）。
2. 一分钱、比例权重、同名成员或逆序点选：按 ID 和稳定顺序正确补分，无舍入损失（Task 1/3）。
3. 未分完、成员删除、未应用输入、刷新及 Receipt 往返：显示可修复状态，不默默归一化或丢字段（Task 2/3）。
4. 折后价、优惠说明与重复商品：超市小计保持 7448，而不是重复扣款的 7101（Task 4/6）。
5. Total item(s)、Taxes、Table Games、底部税表及遮挡：不能丢真实收费或重复计税，缺失/冲突仍需复核（Task 4/5/6）。

---

## 文件边界与接口

| 文件 | 职责 |
| --- | --- |
| `src/types/bill.ts`、`src/types/receipt.ts` | allocation、原始编辑、识别证据与 confirmed metadata 合同 |
| `src/lib/allocation.ts`（新） | 原 allocateCents 实现原样抽出，作为无反向依赖的金额分配底层 |
| `src/lib/item-allocation.ts`（新） | 分配校验与每道菜真实金额 |
| `src/lib/split.ts` | 聚合逐菜分配，复用 allocateCents |
| `src/lib/session.ts`、`src/store/useBillStore.ts` | v1→v2、数据校验、成员删除与草稿恢复 |
| `src/components/split/item-allocation-editor.tsx`（新）、`split-step.tsx` | 三种模式、待应用编辑、分配预览 |
| `src/components/receipt/receipt-step.tsx` | 保留 allocation；结构化识别 review |
| `src/components/result/result-step.tsx`、`src/lib/share.ts` | 显示当前结果，复用金额来源；权重项简要依据 |
| `src/types/ocr.ts`（新）、`src/lib/ocr/worker.ts`、`client.ts` | 本地引擎输出的 normalized line/word 证据 |
| `src/lib/ocr/classifyLines.ts`（新） | 分区、行角色、数量/单价/税码/父子关联 |
| `src/lib/ocr/resolveAmounts.ts`（新） | 净价候选、折扣状态、税汇总语义 |
| `src/lib/ocr/parseReceipt.ts`、`reconcile.ts` | 组装草稿与逐项核对；保留旧入口 |
| `src/components/bill-wizard.tsx` | 把 OCR lines 传给 parser，继续防止过期请求写入 |
| `src/lib/receipt.ts` 及现有测试 | demo/手工菜品使用新合同，更新旧 personIds 访问 |
| `tests/fixtures/receipts/`、`tests/e2e/`、`docs/validation/` | 人工真值、回归、原始/人工修正报告 |

共用合同（完整字段在 Task 1/4 定义并核对引用）：

```ts
type ItemShare = { personId: string; units: number; weightSum: string; cents: number };
type AllocationEdit = {
  mode: "equal" | "ratio" | "quantity";
  totalUnits: string; unitLabel: string;
  entries: { personId: string; value: string }[];
};
type AllocationCheck = { valid: true } | { valid: false; code: string; message: string };
type OcrLine = { text: string; confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
  words: { text: string; confidence: number; bbox: OcrLine["bbox"] }[] };
type OcrEvidence = { text: string; confidence: number; lines?: OcrLine[] };
```

`ItemShare[]` 仅列参与者，按 bill.people 排序；weightSum 是 BigInt 总权重十进制字符串。ReceiptItem 采用 spec 的 ItemAllocation，并允许可选 receiptDetails。Draft.details 可选，因此旧 draft 可不填；实际结构化内容由 Task 4 定义。allocationEdits 存 BillSession，按 itemId 保存原始文本。

## Task 0：标注与浏览器基线（A/B 共用）

**Files:** 新建三份 `tests/fixtures/receipts/{olive-garden,krung-thep,chinatown-supermarket}.expected.json` 和 `.transcription.txt`；新增 `src/lib/ocr/receipt-fixtures.test.ts`、`docs/validation/2026-10-06-receipt-upgrade-baseline.md`；本地图像/原始输出使用 `.private/receipt-upgrade/2026-10-06/`，不修改公开 corpus 声明来冒充已发布图片。

**Interfaces:** expected JSON 为人工标注，含稳定 source-row ID、收费行、数量、附属行、折扣语义及票面金额；保持真值与 OCR 输出独立。

- [ ] 根据附件逐行标注；完美转录去掉卡号、订单号、员工名等非解析必要信息，保留布局/标签和项目顺序。同名收费行必须不同 ID。模糊项标 unknown，不用 OCR 反生成真值。
- [ ] 写标注一致性测试：Olive 11 行合计 24727、税 1466、total 26193；Thai 6 行合计 8750、购买数量合计 9、税 525、total 9275；Grocery 15 行合计 7448、折扣说明合计 347（included）、税 224、total 7672。断言 Grocery 直接行价之和与 subtotal 一致。
- [ ] 运行 `npm.cmd test -- src/lib/ocr/receipt-fixtures.test.ts`，标注矛盾必须先修正。
- [ ] 启动当前应用，用三张本地图运行原图和四角校正后的真实浏览器 OCR；保存原始 text/当前 draft、调整方式、收费价格命中、误报、缺失、冷/暖耗时与人工修正次数。不能把手工真值填回后算作识别正确。
- [ ] 将本轮 Node 基线作为单独一列引用；填写浏览器基线，提出后续改善目标供用户评估，不能用 Node 的 73/49/56 confidence 当正确率。提交仅安全标注与汇总文档。

**验收：** 三份真值与图一致，浏览器基线能复现；本地私有文件仍被忽略。此任务不改善产品行为。

## Task 1：分配合同与准确金额（A）

**Files:** 修改 `src/types/bill.ts`、`src/types/receipt.ts`、`src/lib/split.ts`；新建 `src/lib/allocation.ts`、`src/lib/item-allocation.ts`、`item-allocation.test.ts`；更新 `split.test.ts`。

**Interfaces:** `validateItemAllocation(allocation: ItemAllocation, people: Person[]): AllocationCheck`；`allocateItemCents(item: ReceiptItem, people: Person[]): ItemShare[]`；`splitBill(bill: Bill): SplitResult` 返回合同保持兼容。allocateCents 实现移到 allocation.ts，split.ts 兼容 re-export；item-allocation 只依赖 allocation.ts，不反向导入 split.ts。canonical ItemAllocation 见 spec；未分配 equal / 空 shares / 未分完数量只在 validate 时无效，金额层抛可读错误。

- [ ] 写失败测试 `splits six wings by consumption`：1200 分、quantity(totalUnits=6)、units `[2,2,1,1]` → `[400,400,200,200]`；相同比例 ratio 同结果；将 receiptQuantity 设为 1 不改变用户 totalUnits=6。
- [ ] 写失败测试 `allocates weighted pennies in stable person order`：1001 分同权重 → `[334,333,167,167]`；shares 逆序仍相同；1 分 `[2,2,1,1]` → `[1,0,0,0]`；同名不同 ID 独立；不改变输入。
- [ ] 写失败测试 `preserves fees and equal behavior`：1200 分上述份额、税120、小费240 → 应付 `[520,520,260,260]`，总计1560；equal 的现有测试结果不变；全零/零消费成员与安全整数上限仍符合原约束。
- [ ] 写失败测试 `rejects invalid quantities and identities`：total 6 但分配5/7、空 shares、未知/重复 ID、负数、NaN、非整数/溢出均无效；ratio `[2,2,1]` 本身有效，不强求分母6。
- [ ] 运行 `npm.cmd test -- src/lib/split.test.ts src/lib/item-allocation.test.ts`，确认新测试失败；实现类型和唯一逐菜分配入口，splitBill 聚合该入口结果，再运行至通过。
- [ ] 在本任务分支暂时更新必要调用位置以保持 TypeScript 可检查；不要在产品代码并存顶层 personIds 与 allocation。通过目标测试并提交 `feat: calculate exact weighted item shares`。

## Task 2：session 迁移与字段贯通（A）

**Files:** 修改 `src/lib/session.ts`、`src/store/useBillStore.ts`、`src/types/receipt.ts`、`src/lib/receipt.ts`、`src/components/receipt/receipt-step.tsx`、`src/components/split/split-step.tsx` 的旧字段访问；扩展 `useBillStore.test.ts`；新建 `src/lib/session.test.ts`。同步调整现有测试对旧合同的访问。

**Interfaces:** `migrateSession(input: unknown): BillSession | null` 读取完整 version/state envelope；v1→v2；`restoreSession(state)` 验证 canonical v2；store 新增 `saveAllocationEdit(itemId, edit)`、`applyAllocation(itemId, allocation)`、`discardAllocationEdit(itemId)`。现有 equal toggle/Everyone action 转读 allocation。isBill/restoreSession 做结构校验并接受编辑中的未分完状态；availableStep("result") 做完整分配与pending校验，恢复时退到Split而非清空session。

- [ ] 写失败测试 `migrates v1 without changing bill or unfinished edits`：v1 items/ReceiptEdit.items 的 personIds 全部迁为 equal；保留税/小费、名字、草稿、price="12."、step；已完成的 equal Result 金额与旧值一致。旧 draft 没有 details 也能恢复。
- [ ] 写失败测试 `restores editable quantity and removes deleted identities`：quantity 6 只分5能保存并恢复到 Split；删除一个吃2个的人后删除该 share，totalUnits 保持6，不能进入 Result；同名按 ID 清除。pending 编辑的 entry 也清除该 ID。
- [ ] 写失败测试 `round trips allocation metadata and raw pending inputs`：切回 Receipt 改净价、confirmed allocation/receiptDetails 不丢；allocationEdits 中空字符串保留，pending 不让查看 Result；非法 canonical units、重复 ID、损坏版本/额外 action 键拒绝；存储写失败可继续编辑。
- [ ] 运行 `npm.cmd test -- src/store/useBillStore.test.ts src/lib/session.test.ts` 确认新场景失败，实现迁移/验证/store actions 与 Receipt 候选重建，运行至通过。
- [ ] 修改 demo/add item 初始 allocation，确保新菜默认为未分配 equal；只有 Apply 成功才清除 pending 编辑；模式/成员变化不偷偷重算比例。运行 `npx.cmd tsc --noEmit`，修正全仓旧字段引用，再提交 `feat: migrate and recover weighted bill sessions`。

## Task 3：三种分配 UI、预览与 Result（A 独立验收）

**Files:** 新建 `src/components/split/item-allocation-editor.tsx`、`tests/e2e/weighted-split.spec.ts`；修改 `split-step.tsx`、`result-step.tsx`、`share.ts`、`share.test.ts`、`src/app/globals.css`。

**Interfaces:** `ItemAllocationEditor({item, people}: {item: ReceiptItem; people: Person[]})` 使用 Task 1/2；preview 调用 allocateItemCents。简版分享总金额来源仍为 splitBill；新增权重/数量行可复用 ItemShare，不新增独立计算器。

- [ ] 写失败 E2E `allocates six wings and previews exact shares`：手工录入12美元、四人，切 Quantity，总6，填2/2/1/1并 Apply；即时显示4/4/2/2；再加税1.20、小费2.40，Result 为5.20/5.20/2.60/2.60，总15.60，复制同值。
- [ ] 写失败 E2E `blocks incomplete overallocated and pending inputs`：只分5、分7、空输入、未 Apply 时不能继续；错误有可访问文本；不显示旧 valid preview。ratio 与 quantity 不互相误用总数；0 输入退出 share；负/小数输入给出原因。
- [ ] 写失败 E2E `keeps allocations through edit refresh and member removal`：应用2/2/1/1，刷新、回 Receipt 将12改10.01，再到 Split/Result得到3.34/3.33/1.67/1.67；删除成员后回到可修复分配；切回 Equal 清除当前菜自定义份额；其他菜不受影响。
- [ ] 写失败 E2E `fits keyboard and mobile layouts`：375/1280px、长名字、长菜名、同名成员，无溢出；模式、units、Apply 可键盘操作；Everyone 保留在 Equal 模式。
- [ ] 运行 `npm.cmd run test:e2e -- tests/e2e/weighted-split.spec.ts` 确认预期界面缺失；实现模式编辑、分配数量提示、有效预览和 Result 的简要按菜依据。无效 allocation 不算最终税费，保留现有向导路径。
- [ ] 运行目标 E2E、`npm.cmd test`、`npm.cmd run lint`、`npx.cmd tsc --noEmit`，记录截图和守恒验算；提交 `feat: split dishes by ratio or consumed units`。提供 A 的本地 demo 供 review。

## Task 4：复杂小票语义与净行价（B1）

**Files:** 新建 `classifyLines.ts`、`resolveAmounts.ts` 及各自 `.test.ts`；修改 `parseReceipt.ts`、`parseReceipt.test.ts`、`reconcile.ts`、`src/types/receipt.ts`；新建 `src/lib/ocr/reconcile.test.ts`。

**Interfaces:** `parseReceiptText(text: string, lines?: OcrLine[]): ReceiptDraft` 保留旧 text-only 调用；`classifyReceiptLines(text, lines?)` 输出分区与角色、source ID/line/位置；`resolveReceiptAmounts(classified)` 输出 Draft.items/details 与 totals。公共类型定义于 `src/types/receipt.ts`，模块不互相循环依赖。

details 固定包含可选 `quantity: number|null`、`unitPriceCents: number|null`、`taxCode: string|null`、`sourceLines: string[]`、`bbox`、`parentSourceId`、`modifiers: {text,sourceLine}[]`、`discounts: {discountCents:number,inclusion:"included"|"subtract"|"unresolved",sourceLine:string}[]`、`reviewCodes:string[]`；priceCents 是建议净行价，未知则 null。税汇总事实单独保留，taxCents 只采用选定的总税或验证后的明细和。

- [ ] 写失败测试 `parses restaurant quantities without multiplying line totals`：完美转录 Olive 11行/24727/1466/26193；Seafood qty2 4498、Tour qty4 8996，另一行 Tour 不合并；Table Games 299 不丢；无价附属项关联且源行可追踪，独立缺价 Soup 仍是 null 候选。
- [ ] 写失败测试 `distinguishes menu ids modifiers and item-count subtotal`：Thai 恰6行 `[600,1200,1400,2800,2400,350]`、quantity sum9；unitPrice1400/800；Total 9 item(s)→subtotal8750、Taxes525、Grand Total9275；付款9275不覆写；[Chicken]/辣度为 modifier。
- [ ] 写失败测试 `does not subtract included grocery discounts twice`：Grocery15行、净行价和7448、347折扣 included、tax224、total7672；3.50/3.49同名分开；促销2/$6.99不是qty2；FT0等不入名称；You Saved、Item Count、Payment、AMOUNT 不入items。
- [ ] 写失败测试 `separates tax detail from taxable amounts and summary`：上方Tax224 + 下方taxable998/6450、tax30/194，只得224；缺上方汇总时用清楚明细224；矛盾的汇总与明细需警告，不能相加成448。
- [ ] 写失败测试 `requires explicit review of conflicting prices and discounts`：另一张构造票明确原行价1000、独立折扣100、净900→subtract候选；缺 subtotal/单价证据→unresolved；负号丢失的 Disc 不成收费商品；subtotal相同但两行金额相抵出错仍逐项报警。
- [ ] 写变体测试：改变店名、菜名、价格、quantity及尾部tax code后仍按结构解析；付款与税表调换位置不改变总税；带价格的 Chicken、Table Games 不是元信息；不只对样本词匹配。
- [ ] 运行 `npm.cmd test -- src/lib/ocr/parseReceipt.test.ts src/lib/ocr/classifyLines.test.ts src/lib/ocr/resolveAmounts.test.ts src/lib/ocr/reconcile.test.ts` 确认新场景失败；实现分区/角色、数量候选与金额证据；保持旧 parser 行为中保守留空、charged tip/added tip 区分。
- [ ] 运行相同测试至通过，扩展 session.isDraft/metadata validators 接受并校验新可选字段，旧 draft 不丢；提交 `feat: interpret receipt quantities modifiers and net prices`。

## Task 5：OCR 坐标和有预算的增强扫描（B2）

**Files:** 新建 `src/types/ocr.ts`、`src/lib/ocr/normalizeLines.ts`、`normalizeLines.test.ts`、`retry.ts`、`retry.test.ts`；修改 `worker.ts`、`worker.test.ts`、`client.ts`、`client.test.ts`、`bill-wizard.tsx`。图像增强如需要，集中于现有 `src/lib/ocr/preprocess.ts`，不修改已确认的原图。

**Interfaces:** recognize 返回 OcrEvidence；`normalizeOcrLines(blocks: unknown): OcrLine[]` 验证坐标与 confidence，缺失时输出[]；`shouldRetryReceipt(evidence: OcrEvidence, draft: ReceiptDraft): boolean`。候选 OCR 参数作为 worker recognize 的可选参数，仅适配已安装引擎协议，先核对本地源码。

- [ ] 写失败测试 `preserves line coordinates and tolerates missing blocks`：显式请求 text+blocks，normalized text/bbox/confidence 保留；缺块/损坏坐标回退原始文本，不能让 blank/error 被当成功；symbol大对象不入session。
- [ ] 写失败测试 `retries at most once within the same cancellation budget`：missing financial amounts、无法对账或confidence<60触发候选；清楚且一致不重复；最多两次 recognize、initialize仅一次、120秒共享；abort during load/recognize/retry 终止worker。
- [ ] 写失败测试 `never overwrites edits from a stale or conflicting candidate`：重选/返回/取消后迟到输出不能写store；两次价格不同则draft有待review证据，而非选一个凑总额；资源失败能手工输入。
- [ ] 运行 `npm.cmd test -- src/lib/ocr/worker.test.ts src/lib/ocr/client.test.ts src/lib/ocr/normalizeLines.test.ts src/lib/ocr/retry.test.ts` 确认新场景失败；实现 adapter 和 wizard 的 lines 接入、候选判定与生命周期。
- [ ] 使用 Task 0 三张本地图比较现有默认与 single-column 模式、现有裁切与必要的对比度处理；如自动重试没有减少漏读/误报且耗时增加，则保留坐标接入，增强扫描改为用户手动入口。决定与证据写入验证记录，不盲目做默认二次扫描。
- [ ] 重跑目标测试、既有真实 Line Thai 和 synthetic 浏览器 OCR；保存冷/暖/取消记录，确认没有更换本地模型或新增图片网络上传。提交 `feat: use local OCR layout evidence for receipt review`。

## Task 6：结构化复核与完整回归（B 完成验收）

**Files:** 新建 `src/components/receipt/receipt-line-details.tsx`、`tests/e2e/complex-receipts.spec.ts`、`docs/validation/2026-10-06-weighted-split-receipts.md`；修改 `receipt-step.tsx`、`src/lib/session.ts`、`useBillStore.ts`、`README.md`、相关 `.test.ts` 和 `tests/e2e/ocr-flow.spec.ts`。

**Interfaces:** details review 使用 Task 4 元信息；`confirmReceipt` 和 receiptReady 同时验证 unresolved financial 状态；用户选择 included/subtract 后更新编辑净价与证据，确认一次写入 canonical priceCents/receiptDetails/allocation，不二次扣款。

- [ ] 写失败 E2E `reviews net prices and preserves allocations`：注入明确标识的 parser draft 测UI（不是OCR准确率测试），展示 quantity/unitPrice/modifier/源行；included subtotal7448、tax224、total7672；选subtract只应用一次，重新打开/刷新/确认仍同净价；返回修改不丢权重。
- [ ] 写失败 E2E `blocks unresolved financial interpretation`：折扣未确定、缺价、冲突不能仅勾checkbox或填差额理由继续；明确解答后可继续；已解决但真实差额仍沿用解释路径；用户added tip不进入票面差额。
- [ ] 写真实浏览器样本用例并单独标 image Kind/来源：私有样本由明确环境变量指定本地目录，缺文件则skip并报告，不能冒充三图已验收；公开CI继续用既有fixture。每次保存原始draft，然后另记录人工修正，原始指标不得读取修正后的数据。
- [ ] 运行目标浏览器测试确认新增场景失败，实现 receipt-line-details 与净价确认路径；375/1280px核对源行、数量与折扣不会挤掉金额，键盘可确认。
- [ ] 执行 `npm.cmd test`、`npm.cmd run lint`、`npx.cmd tsc --noEmit`、`npm.cmd run build`；在 PowerShell 设置 `$env:E2E_PRODUCTION='1'` 后运行 `npm.cmd run test:e2e`，结束移除该变量。有失败先定位，不能称已完成。
- [ ] 对三图记录前后收费行precision/recall、逐项价格匹配、数量/名称、票面税/总计、误报/未解决项、人工改动数与耗时；校正参数保持可复现。旧Line Thai与synthetic无回归；人工矫正成功不能替代识别指标。
- [ ] README更新支持范围与限制；验证记录分开写“原始识别”“结构解析”“人工确认”“分配守恒”。提交 `test: verify weighted splits and complex receipt review`，提供本地demo供用户review；不自动发布。

## 自检与交付

- 数据变化由 Task 1 定义、Task 2迁移、Task 3展示；receiptQuantity不进入 allocation 自动推导。
- 净价/税语义由 Task 4 定义、Task 5提供版面证据、Task 6确认；收据与Result继续只有一个canonical价格来源。
- Review Focus 五类输入均有归属测试；三图人工金额已独立验算；空/损坏/OCR取消使用旧回退路径。
- 先交付 A，再交付 B；Task 0为测量准备。每阶段独立review，首次编码以本次计划review后的明确指令为准。
- 本次只写计划与设计，不运行上面的待开发测试或宣称升级已通过；不提交已有其他文档改动。

## 开发验收记录（2026-10-06）

Task 0–6 已实施。完整验证：88/88 单元测试、41/41 生产浏览器测试（包含三张私有原图，没有跳过）、lint/类型检查/构建通过。最终独立 review 的三个 Important 问题在同一修补阶段修复，新增失败回归转绿。详见 `docs/validation/2026-10-06-weighted-split-receipts.md`。

实现调整：ItemShare 从同一 splitBill 计算派生供结果及分享；元信息类型分到 receipt-details.ts 以避免循环依赖；样本测试集中于 complex-receipts/receipt-fixtures 测试；保留单次默认 OCR，第二种版面扫描改为手动 Enhanced。原图与默认校正/单列比较没有一致提升依据，所以未新增自动第二次扫描或对比度变换。整单优惠不自动分配，单独显示证据、要求人工更正净行价并确认。

历史勾选列表保留为原计划，不代表逐条测试名一字不差实现。特别是原始图片的完整菜名/价格对齐、最小人工修正次数与跨设备准确率尚未建立可靠指标；金额多重集覆盖率明确不作为整体识别准确率。开发在 `codex/weighted-receipts` 分支完成，保留供 review，不自动发布。
