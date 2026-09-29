# CheckMates V2.2 Explainable Results Implementation Plan

> 2026-09-28：暂缓执行。本轮仅处理动态图片校正和菜品识别，见[新版 V2 计划](../specs/2026-09-28-checkmates-v2-image-first-design.md)。本文件保留为后续待办，不代表当前开发范围。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用金额构成图和逐菜计算过程，让用户能够核对每个人的应付金额及每一分的去向。

**Architecture:** 在既有整数分算法内部生成分配过程，原 `splitBill` 返回值保持兼容。图表、个人详情、复制文本都读取相同计算结果；票面核对与分摊守恒分别展示。

**Tech Stack:** React、TypeScript、原生 CSS/SVG、Vitest、Playwright；无需新增图表依赖。

**Spec:** [V2 设计 §1–3、§5、§7](../specs/2026-09-27-checkmates-v2-design.md)。状态：草案。

## Global Constraints

- 金额仍为非负安全整数分；分账采用稳定参与者顺序和最大余数法。
- 任何图表、翻译、OCR 提示都不能改变算账规则。
- 主界面继续使用英文；本文中文为需求说明，计算文案测试使用英文 UI 文本。
- 图表只展示结果，不从圆整百分比反算税或小费，不存储衍生结果到 localStorage。
- 手机优先：375px 可用，信息不能仅由颜色或 hover 提供，减少动画设置必须有效。
- 修改 Next.js 代码前先阅读本仓库 `node_modules/next/dist/docs/` 中相应指南。

## Review Focus

1. 一分钱无法均分，图表/文案与实际分配不一致：Task 1/2 固定奇数分断言。
2. 全零账单或零消费参与者出现除零、NaN 或承担税费：Task 1/3 验证零值。
3. 返回修改价格、名称、成员后，结果和说明仍显示旧数据：Task 2/4 做完整往返流程。
4. 大额金额转换为浮点数导致末位丢失：Task 1/3 覆盖安全整数上界，图形近似与金额文本分离。
5. 分摊守恒被当成“小票识别完全正确”：Task 3 独立验证无票面总额和仍有核对差异的提示。

## 文件边界与数据合同

- Modify `src/lib/split.ts`：同一算法同时生成金额与分配过程。
- Create `src/types/split-detail.ts`：计算解释数据；`src/lib/split-detail.test.ts`：固定验算案例。
- Create `src/components/result/share-chart.tsx`, `person-breakdown.tsx`, `reconciliation-status.tsx`：图形、逐人解释、全单核对。
- Modify `result-step.tsx`, `src/lib/share.ts`, `share.test.ts`, `src/app/globals.css`。
- Create `tests/e2e/result-explanation.spec.ts`；原有 `bill-flow.spec.ts` 保持回归。

`AllocationPart={weight:number,baseCents:number,roundingCents:0|1,cents:number,remainderNumerator:string}`；`AllocationTrace={amountCents:number,denominator:string,parts:AllocationPart[]}`。字符串用于表示可能超出 Number 范围的精确 BigInt 分母/余数，不能用来直接格式化为美元。

`ItemAllocation={itemId:string,itemName:string,priceCents:number,personIds:string[],allocation:AllocationTrace}`；`BillBreakdown={result:SplitResult,itemAllocations:ItemAllocation[],tax:AllocationTrace,tip:AllocationTrace}`。item 的 personIds 按 bill.people 的稳定顺序；tax/tip.parts 与 bill.people 同序。

合同函数：`allocateCentsDetailed(total:number,weights:number[]):AllocationTrace`；`explainSplitBill(bill:Bill):BillBreakdown`。`allocateCents` 映射 detailed.parts.cents，`splitBill` 返回 explainSplitBill.result；两个包装不复制计算逻辑。

### Task 1：在原计算中保留分配过程

**Files:** Modify `src/lib/split.ts`, `src/lib/split.test.ts`；Create `src/types/split-detail.ts`, `src/lib/split-detail.test.ts`。

**Interfaces:** 产生上述 AllocationTrace 和 BillBreakdown。只计算一次，逐菜和税/小费都复用同一分配函数。

- [ ] 先写失败断言：`allocateCentsDetailed(1001,[1,1])` 的基础分配为 `[500,500]`，余分 `[1,0]`，最终 `[501,500]`；`allocateCentsDetailed(2,[1,1,1])` 最终 `[1,1,0]`。
- [ ] 用固定 A/B 案例断言菜品 `[501,1000]`，税 `[50,101]`，小费 `[101,201]`，总额 `[652,1302]`、账单1954；税的 base 为 `[50,100]` 且 rounding 为 `[0,1]`，小费 base 为 `[100,201]` 且 rounding 为 `[1,0]`。
- [ ] 验证 click-order `[B,A]` 与 `[A,B]` 不改变说明或金额；不同菜的同名参与者用 ID 绑定；输入 bill 不被修改。
- [ ] 实现详细返回结构，并让旧函数通过包装调用。精确乘法/余数继续使用 BigInt；输入/合计安全边界和异常行为保持原约定。
- [ ] 覆盖全零账单、零权重、只有一人、非法/重复成员 ID、溢出和 `Number.MAX_SAFE_INTEGER` 金额。零权重且总额为零时全部金额为零，分母记录 `"0"`，不计算百分比。
- [ ] Run `npm.cmd test -- src/lib/split.test.ts src/lib/split-detail.test.ts src/lib/money.test.ts`；预期所有旧金额回归完全一致，新 trace 与结果逐项相加一致，再提交。

### Task 2：逐人逐菜的可展开计算说明

**Files:** Create `src/components/result/person-breakdown.tsx`, `src/lib/result-copy.ts`, `src/lib/result-copy.test.ts`, `tests/e2e/result-explanation.spec.ts`；Modify `src/components/result/result-step.tsx`, `src/lib/share.ts`, `src/lib/share.test.ts`。

**Interfaces:** `PersonBreakdown({personId:string,bill:Bill,breakdown:BillBreakdown})` 只读数据；`describeAllocation(part:AllocationPart,trace:AllocationTrace):string` 输出基础份额和余分说明；`formatDetailedShareText(bill:Bill,breakdown:BillBreakdown):string` 为新增详细复制格式，现有简版 `formatShareText` 保留。

- [ ] 先写文案测试：1001/2 显示 `Base $5.00 + remainder $0.01 = $5.01`；不能把 A/B 都写成四舍五入 $5.01；税显示权重 `501 / 1501` 及最终 `$0.50`，不将近似百分比视为精确等式。
- [ ] 在个人卡片中逐项列出菜品全价、共享人数、个人份额；独享菜显示全额；余分只有实际得到的人显示 +$0.01。其他人得到零分也应可检查，不隐藏条目以免误解。
- [ ] 展示“个人菜品小计 / 全单菜品小计”与税、小费总池，解释分别分摊；说明小费池包含票上已收小费和用户新增小费，来源总额可展示，但不重新以两个池计算，保持原算法。
- [ ] 增加简版/详细版复制选择，详细版包括计算方式、最终金额、币种。无剪贴板权限时可手动选取相同内容；分享不自动发送到任何服务。
- [ ] Run `npm.cmd test -- src/lib/share.test.ts src/lib/result-copy.test.ts`；在浏览器验证 A=$6.52/B=$13.02 的展开和复制文本，再提交。

### Task 3：金额构成图与两种独立核对状态

**Files:** Create `src/components/result/share-chart.tsx`, `src/components/result/reconciliation-status.tsx`；Modify `src/components/result/result-step.tsx`, `src/app/globals.css`；Extend `tests/e2e/result-explanation.spec.ts`。

**Interfaces:** `ShareChart({people:PersonShare[]})` 用共同最大个人总额为横轴；`ReconciliationStatus({bill:Bill,breakdown:BillBreakdown,draft:ReceiptDraft|null,source:BillSession['source'],receiptConfirmed:boolean,addedTipCents:number,reviewNote:string})` 复用 `reconcileReceipt` 判定票面差额，source 区分示例与照片，不能仅凭金额相等宣称小票已复核。

- [ ] 先写浏览器失败用例：A/B 两条横向堆叠条，共享 Items/Tax/Tip 图例且含数值表；375px 无横向溢出；全零账单仍显示 `$0.00`，样式中没有 NaN/Infinity。
- [ ] CSS/SVG 只计算展示比例，金额标签一律用 `formatMoney`。绘图过程允许数值近似，不能回写分配结果。极小税段不通过人为加宽假装准确占比，可用文字标记补充。
- [ ] 每人图形配可读的完整文本替代；details 支持键盘，图例有标签，动画尊重 `prefers-reduced-motion`。结果一屏先看到总额、每人应付和展开入口。
- [ ] 状态1：分配合计与账单相差0分。状态2：票面总额已核对 / 差额及用户说明 / 票面总额未识别。没有真实照片的示例账单显示 Sample；不能显示“已核对小票”。
- [ ] Run `npm.cmd run test:e2e -- --grep 'result explanation'`；覆盖票面总额缺失、人工处理差额、零消费参与者、长名字和高对比度/减少动画检查，再提交。

### Task 4：更改账单后的同步与最终验收

**Files:** Complete `tests/e2e/result-explanation.spec.ts`；Update `docs/verification.md`, `README.md`。

**Interfaces:** 不新增持久化结果字段；结果、图形、明细和复制文本均由当前 bill 生成。

- [ ] 走完整流程：得到 A=652/B=1302 后返回把 B 独享菜500改为600；重新进入结果，断言菜品 `[501,1100]`、税 `[47,104]`、小费 `[95,207]`、应付 `[643,1411]`、合计2054。共享名单、详情和复制内容同步新 bill。
- [ ] 删除 A 后回分配页面处理未分配项，再进结果；验证不存在已删除 A 的条形或明细。刷新与重置也不能保留旧解释。
- [ ] 验证每人逐菜份额和等于个人菜品小计、所有人 tax/tip 分别等于原池、最终合计等于总额。图形截图不能替代这些金额断言。
- [ ] Run `npm.cmd run lint`、`npm.cmd test`、`npm.cmd run build` 和生产浏览器测试；视觉检查375px/1280px及键盘、读屏文本。
- [ ] 记录固定案例截图、结果文本和计算规则。完成预览验收后给出 V2.2 发布建议；文档写清“分摊一致”和“票面一致”的区别。提交本迭代。
