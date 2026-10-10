# CheckMates Split Explanation Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task after user review. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用户能在 Result 页从逐菜份额、税费比例和余分分配核对个人应付金额。

**Architecture:** 在现有整数分算法中保留分配过程，旧 `allocateCents` / `splitBill` 继续提供兼容返回值。Result 的金额、条形图和展开说明读取同一份 `BillBreakdown`，不独立复算。

**Tech Stack:** 现有 React、TypeScript、CSS、Vitest、Playwright；无新增运行时依赖。

**Spec:** [可核对的分账结果设计](../specs/2026-09-29-checkmates-split-explanation-design.md)。基线 `main@8ce4d03`。状态：**已在 `feat/split-explanation` 本地实施，待用户验收后再发布。**

## Global Constraints

- 本计划首批只实现 Result 页解释；Split 即时反馈和详细复制属于文末后续项。
- 产品界面继续用英文；USD；非负安全整数分；分配规则完全兼容当前版本。
- 逐菜均分；税和总小费各自按个人菜品小计分配；最大余数法、稳定成员顺序均保持不变。
- 金额及明细同源；不从近似百分比反算金额；图形不修改或持久化计算结果。
- 375px 和 1280px 可用；不能依赖颜色或 hover；不引入图表库。
- 未开始写 Next.js 产品代码前，阅读 `node_modules/next/dist/docs/` 对应指南。

## Review Focus

1. 一分钱均分或税费补分：说明不得把每个人都普通四舍五入到同一结果（Task 1/2）。
2. 全零或零消费成员：不出现除零、NaN，也不能让零权重的人承担费用（Task 1/2）。
3. 同名不同 ID、逆序点击成员：显示和分配必须按 ID 与稳定顺序关联（Task 1/3）。
4. 返回修改或删除成员：金额条和明细不能残留旧值（Task 3）。
5. 长菜名、多菜、小屏幕与极小税段：数值不能被裁切，文字须完整可读（Task 2/3）。

---

## 文件与数据合同

| 文件 | 职责 |
| --- | --- |
| `src/lib/split.ts` | 生成金额及分配过程，保留旧公开函数 |
| `src/types/split-detail.ts`（新增） | 分配过程及逐菜明细的类型 |
| `src/lib/split-detail.test.ts`（新增） | 固定验算、边界及旧算法兼容 |
| `src/components/result/person-breakdown.tsx`（新增） | 逐菜和税费展开内容 |
| `src/components/result/share-composition.tsx`（新增） | 同一尺度下的金额构成条及文本替代 |
| `src/components/result/result-step.tsx`、`src/app/globals.css` | 接入明细、布局和全单分配核对 |
| `tests/e2e/result-explanation.spec.ts`（新增） | 真实流程、回退修改及可访问性 |

```ts
type AllocationPart = { weight: number; baseCents: number; extraCent: boolean; cents: number };
type AllocationTrace = { poolCents: number; weightSum: string; parts: AllocationPart[] };
type ItemAllocation = {
  itemId: string; itemName: string; priceCents: number;
  personIds: string[]; allocation: AllocationTrace;
};
type BillBreakdown = {
  result: SplitResult; items: ItemAllocation[];
  tax: AllocationTrace; tip: AllocationTrace;
};
```

`weightSum` 是 BigInt 分母的十进制字符串。item.personIds 和 allocation.parts 一一对应，按 bill.people 顺序排列；tax/tip.parts 与 bill.people 同序。大额展示只格式化最终整数分，比例图允许近似但不参与分配。

### Task 1：让现有算法保留过程

**Files:** 修改 `src/lib/split.ts`；新增 `src/types/split-detail.ts`、`src/lib/split-detail.test.ts`；沿用 `src/lib/split.test.ts`。

**Interfaces:** `allocateCentsDetailed(total: number, weights: number[]): AllocationTrace`；`explainSplitBill(bill: Bill): BillBreakdown`。旧函数包装它们，不保留第二套算法。

- [ ] 写失败测试 `keeps exact shared-item and fee remainders`：1001分均分得 `[501,500]`，base `[500,500]`、extra `[true,false]`；合成账单菜品 `[501,1000]`、税 `[50,101]`、小费 `[101,201]`、应付 `[652,1302]`、总计1954。
- [ ] 写失败测试 `preserves existing allocation rules`：税 base `[50,100]`、extra `[false,true]`；小费 base `[100,201]`、extra `[true,false]`；逆序点击和相同显示姓名不改变 ID 对应金额。
- [ ] 写失败测试 `handles zero and safe-integer limits`：全零账单分母 `"0"`、各部分0；零权重成员承担0；`allocateCentsDetailed(2,[1,1,1])` 得 `[1,1,0]`；重复/未知 ID、溢出仍抛错；最大安全整数金额与原函数一致，输入 bill 不变。
- [ ] 运行 `npm test -- src/lib/split.test.ts src/lib/split-detail.test.ts`，确认新增测试因缺少实现失败。
- [ ] 实现上述函数和类型；逐菜、税、小费继续使用 BigInt，先分基础金额，再按余数排序补分。保留原输入校验和异常约定。
- [ ] 运行相同目标测试并确认全部通过，再提交 `feat: expose exact split calculation details`。

### Task 2：个人明细和金额构成条

**Files:** 新增 `person-breakdown.tsx`、`share-composition.tsx`、`tests/e2e/result-explanation.spec.ts`；修改 `result-step.tsx`、`globals.css`。

**Interfaces:** `PersonBreakdown({ personId, breakdown, people }: { personId: string; breakdown: BillBreakdown; people: Person[] })`；`ShareComposition({ share, maxTotalCents }: { share: PersonShare; maxTotalCents: number })`。Result 每次 render 只调用一次 `explainSplitBill(s.bill)`，原简版分享继续使用 breakdown.result。

- [ ] 写失败浏览器用例 `result explanation shows item and fee calculations`：在实际向导录入10.01共享菜和5.00第二人独享菜、税1.51、小费3.02，结果为6.52/13.02；展开后分别有实际逐菜金额、基础税/小费及余分说明。
- [ ] 写失败用例 `result explanation handles zero and small segments`：全零时出现零金额说明、不出现 `0 / 0`；被分配到零分的菜品行仍显示；极小税段不强制加宽，完整金额在文本中可读。
- [ ] 运行 `npm run test:e2e -- --grep 'result explanation'`，确认失败是界面尚缺失。
- [ ] 实现个人展开内容：行价、共享成员/人数、实际份额；税费公式下使用 `Base $… + remaining $… = $…`，无小费显示 `No tip added`。余分统一说明稳定顺序，不把近似百分比写成精确等式。
- [ ] 增加原生 CSS 构成条：全体共用最大个人总额尺度、Items/Tax/Tip 稳定配色及可读金额；全零时不除零。姓名卡片颜色与构成图例分离。
- [ ] 底部保留账单总额，加 `Allocation difference $0.00`；不添加“小票正确识别”断言。details 保持原生键盘行为和焦点样式。
- [ ] 重跑目标用例，检查375px/1280px截图及键盘展开，再提交 `feat: explain each person split on results`。

### Task 3：修改后同步、回归和本地交付

**Files:** 扩展 `tests/e2e/result-explanation.spec.ts`；更新 `README.md`、`docs/validation/split-explanation.md`（新增）。

**Interfaces:** 沿用 Task 1/2；不新增 session schema 或结果缓存。

- [ ] 写用例 `result explanation updates after receipt edits`：第二人独享菜从500分改到600分，菜品 `[501,1100]`、税 `[47,104]`、小费 `[95,207]`、应付 `[643,1411]`，总计2054；简版复制、明细和条形同步。
- [ ] 写用例 `result explanation follows current people and assignments`：重新分配、删除成员并修复未分配菜后，结果中没有旧成员；同名成员以 ID 区分；刷新后从当前 bill 重建明细。
- [ ] 写用例 `result explanation fits mobile and long content`：375px下长姓名、长菜名、多菜可展开，无页面横向溢出；不用 hover 即可获得全部金额。
- [ ] 运行 `npm test`、`npm run lint`、`npm run build`，随后运行生产模式完整浏览器套件；每人逐菜和、所有人税/小费和、最终总额逐项守恒。
- [ ] 用本次原型三个固定场景核对产品结果，记录截图与文案；写清“金额分配相符”和“票面识别正确”的区别，提交 `test: verify explainable split result journeys`。
- [ ] 给出本地 demo 和验证记录供用户 review；本任务不自动推送或部署。

## 后续小步（首批验收后再排）

1. Split 页每道菜下即时显示被选成员的真实份额；未分配时只提示，税和最终应付等分配完成后展示。
2. 增加详细版复制，复用 BillBreakdown；保留简版和剪贴板失败回退。

任务共享同一份数据合同。实施验证记录见 [split-explanation.md](../../validation/split-explanation.md)；本地验收后再决定发布。
