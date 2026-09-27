# BiteSplit MVP Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans for native execution, or superpowers:subagent-driven-development if the user selects delegation. Complete the unchecked steps task by task. This document authorizes no implementation by itself; the current request is to prepare a plan.

**Goal:** 交付包含真实浏览器端 OCR 的小票分账 MVP：拍照/上传 → 实际识别 → 人工核对 → 选择参与者 → 分配项目 → 精确分账与分享。

**Architecture:** Next.js 首页承载单页向导，步骤由 Zustand 管理。Tesseract.js 在客户端 worker 内读取图片，纯解析器生成待核对草稿；用户确认后才转换成有效账单。金额与分账计算使用纯函数；结果从当前账单重新计算。照片与 worker 只保留在客户端内存中。

**Tech Stack:** Next.js App Router、TypeScript、Tailwind CSS、shadcn/ui、Zustand、Lucide、Tesseract.js、Vitest；Playwright 用于核心流程及真实 OCR 验收。

**Spec:** [已确认的产品与技术设计](../../design.md)

**状态:** 已按用户要求把真实 OCR 纳入本次交付；当前更新设计与计划，产品开发尚未按本计划开始。

## Global Constraints

- 项目目录为 `D:\code\devapps\BiteSplit`；现有源码位于 `src/` 下，沿用该布局。
- 五步向导：开始（含识别过程）→ 核对小票 → 加入朋友 → 分配项目 → 查看结果；只有首页业务路由。
- 所有业务金额以整数分保存；输入和显示为 USD；没有实际小费时默认为 0，已明确列出的实收小费供用户核对，建议小费不自动入账。
- 主视觉为“周末小餐馆”，英文界面，奶油白背景、番茄橙主操作色和彩色朋友标签。
- 业务数据保存在本地；照片只作当前会话预览，不写入 localStorage。
- 真实 OCR 属于本阶段必做。示例数据只用于独立的体验入口和开发夹具；图片识别失败时不能回退成示例结果。
- OCR 范围为清晰的印刷体英文餐厅小票，JPEG/PNG/WebP、USD；提供人工核对和手动输入。
- 沿用现有依赖和锁文件，增加并锁定 Tesseract.js、英文模型资源及测试所需依赖。写 Next.js 代码前，遵循 `AGENTS.md` 阅读已安装版本的相关本地指南。
- 完成后必须通过 lint、单元测试、核心流程测试及生产构建；更新 README。

## 当前基础与执行方式

已存在 Next.js 工程、shadcn/ui 基础组件、账单类型、金额工具、分摊函数与七个测试用例。首页仍是工程模板；尚无业务向导、Zustand 账单状态和本地恢复流程。已有代码作为草稿保留和检查，不视为已完成的功能。

已收到用户指定的真实测试照片：`tests/fixtures/receipts/line-thai-cafe-2026-09-05-redacted.png`。原图、人工标注与来源清单已保存；预期为 6 条收费项目、小计 7250 分、税 598 分、总计 7848 分。当前尚未运行 OCR，详见该目录 README。

建议在同一会话顺序实现。任务 1 的金额规则和任务 2 的状态接口是共同基础；任务 3 完成真实 OCR，任务 4–6 接入五步界面，任务 7 完成真实识别与整条流程验收。开发初期可用示例先调界面，但本次交付必须完成真实识别。每项任务验证后提交相关文件，保留无关的已有改动。

## Review Focus

1. 同一群人点选顺序不同，余下的一分钱不能换人：任务 1 用重排归属数组的回归测试固定结果。
2. OCR 把总额、建议小费、服务费或不完整价格当作普通项目：任务 3 的解析测试和任务 4 的核对界面拦截疑点，任务 7 用真实引擎和实际照片验收。
3. 取消、重选、重置时旧 OCR 回调不能覆盖新账单：任务 3 测试生命周期，任务 7 验证实际浏览器行为。
4. 输入未失焦就提交、删除已分配参与者，不能遗留旧金额或归属：任务 2 测试状态操作，任务 7 验证整条流程。
5. 缓存损坏、资源加载失败、刷新后照片缺失或复制被拒绝时仍可继续：任务 2–4、任务 6 实现回退，任务 7 验证。

## 文件与职责

| 文件或目录 | 工作 |
| --- | --- |
| `src/types/bill.ts`、`src/types/receipt.ts` | 有效账单与待核对 OCR 草稿分别建模 |
| `src/lib/money.ts`、`src/lib/split.ts` | 金额转换、稳定舍入、纯计算与边界校验 |
| `src/lib/receipt.ts` | 仅用于明确选择的示例入口 |
| `src/lib/ocr/client.ts`、`preprocess.ts`、`parseReceipt.ts` | 实际识别、图片处理、文本解析 |
| `src/lib/ocr/reconcile.ts` | 比较原票合计与当前编辑值，计算差额和待确认事项 |
| `scripts/prepare-ocr-assets.mjs`、`public/ocr/` | 固定版本的 worker、WASM 和英文模型资源准备 |
| `src/lib/session.ts` | 持久化数据的运行时校验和安全恢复 |
| `src/lib/share.ts` | 将计算结果格式化成可分享的纯文本 |
| `src/store/useBillStore.ts` | 账单操作、步骤切换、持久化和重置 |
| `src/components/bill-wizard.tsx` | 客户端向导容器、恢复状态、照片预览生命周期 |
| `src/components/home/home-step.tsx` | 拍照、上传、试用示例 |
| `src/components/receipt/receipt-step.tsx` | 编辑项目和额外费用 |
| `src/components/people/people-step.tsx` | 参与者管理 |
| `src/components/split/split-step.tsx` | 逐项选择参与者 |
| `src/components/result/result-step.tsx` | 结果、分享和重新开始 |
| `src/components/ui/` | 复用现有 shadcn/ui 控件 |
| `src/app/page.tsx`、`layout.tsx`、`globals.css` | 页面入口、品牌信息、主题和响应式布局 |
| `tests/e2e/bill-flow.spec.ts`、`ocr-flow.spec.ts` | 实际浏览器中的完整分账和真实 OCR |
| `tests/fixtures/receipts/` | 有来源记录的小票图片及人工核对的预期数据 |

## 任务 1：确认金额规则与计算基础

**文件：** 修改 `src/lib/money.ts`、`src/lib/split.ts` 及它们现有的测试文件；必要时调整 `src/types/bill.ts`。

**接口：** 保留 `parseMoney(value: string): number | null`、`formatMoney(cents: number): string`、`moneyInput(cents: number): string`、`allocateCents(total: number, weights: number[]): number[]`、`splitBill(bill: Bill): SplitResult`。参与者数组的顺序定义稳定顺序；改名不改变 ID 和位置。

- [ ] 先运行现有测试，确认迁移后的基线；阅读相关类型和实现。
- [ ] 添加并运行回归测试：1001 分由 A、B 共享，归属数组写成 `[B, A]` 或 `[A, B]` 都得到 A=501、B=500。确认现有实现能暴露该问题。
- [ ] 为纯函数补充以下断言：
  - A、B 共享 1001 分，B 独享 500 分，税 151、小费 302：项目 `[501, 1000]`，税 `[50, 101]`，小费 `[101, 201]`，总额 `[652, 1302]`，账单总额 1954。
  - `allocateCents(2, [1, 1, 1])` 得到 `[1, 1, 0]`；权重为零的人不承担费用。
  - 空人员、空项目、未知或重复归属、负数、非整数、超过安全整数的金额及合计均拒绝；零小计且额外费用为零可算，额外费用大于零则拒绝。
  - 重复调用结果相同，输入对象不被修改；若干固定的多人多项目样例逐项核对四个总和。
- [ ] 修正项目分配时的排序，先校验参与者 ID，再按账单参与者顺序分配余数；在不安全的加总进入后续计算前拒绝输入。
- [ ] 测试金额输入：`"12.34" → 1234`、`"0.5" → 50`、空白/负数/三位小数/不安全金额 → `null`；保留现有美元符号支持。
- [ ] 运行 `npm test -- src/lib/money.test.ts src/lib/split.test.ts`，所有断言通过后提交本任务。

**产出：** UI 可依赖、与点击顺序无关的分摊计算；无浏览器依赖。

## 任务 2：账单操作与会话恢复

**文件：** 新增 `src/lib/receipt.ts`、`src/lib/session.ts`、`src/store/useBillStore.ts` 及对应测试；补充 `src/types/bill.ts`，新增 `src/types/receipt.ts`；新增 `vitest.config.ts` 处理 `@/` 别名并限定单元测试范围为 `src/**/*.test.ts`。

**接口：**

- `createMockBill(): Bill`：每次返回独立数据，项目归属和人员初始为空，小费为 0。
- `ReceiptDraft`：`items` 中每项含 `name`、`priceCents: number | null`、`sourceLine`；另有 `rawText`、`taxCents: number | null`、`tipCents: number | null`、`printedSubtotalCents: number | null`、`printedTotalCents: number | null`、`warnings: string[]`。原始识别行保留用于核对；识别不出的金额用 null 表达，不能伪装成 0。
- `BillSession`：`bill: Bill`、`step: WizardStep`、`source: "demo" | "photo" | null`、`fileName: string | null`、`receiptDraft: ReceiptDraft | null`。
- `restoreSession(input: unknown): BillSession | null`：校验恢复数据；损坏或不兼容的结构返回 `null`。
- `createBillStore(storage: StateStorage)`：生成可注入存储实现的 Zustand store，返回类型由实现推导，供测试使用；生产导出 `useBillStore`。
- 状态操作：`startBill(source, fileName?)`、`setReceiptDraft(draft: ReceiptDraft)`、`confirmReceipt(bill: Bill)`、`updateItem(id, patch)`、`addItem()`、`removeItem(id)`、`setExtras(taxCents, tipCents)`、`addPerson(name)`、`renamePerson(id, name)`、`removePerson(id)`、`togglePerson(itemId, personId)`、`assignEveryone(itemId)`、`goTo(step)`、`resetBill()`。
- `startBill("demo")` 创建示例；`startBill("photo")` 创建空的照片会话，不插入示例项目。识别成功只写入草稿，确认有效字段与警告后才使用 `confirmReceipt` 进入后续步骤。
- 运行时状态含 `hasHydrated` 和可展示的存储失败提示；它们及图片 URL 都不持久化。`goTo` 校验目标步骤所需数据，错误时保留当前步骤。

- [ ] 为创建、独立示例对象、修改、返回上一步和重置写失败测试；示例固定为 Burger 1495、Fries 595、Lemonade 350、Tax 201、Tip 0，总计 2641 分。
- [ ] 补充照片会话初始无示例项目、未填写的识别金额阻止确认、草稿及警告刷新后恢复等测试。
- [ ] 实现上述操作。姓名去除首尾空格，拒绝空姓名；参与者使用稳定 ID。删除人时清除其所有归属，返回分配时保留其他选择。
- [ ] 使用内存存储替身测试：新建 store 恢复同一数据、未知版本回到首页、非法 JSON/错误结构安全回退、写入异常仍可继续操作、reset 后再次恢复不出现旧账单。
- [ ] 实现版本化 localStorage 存储，缓存 key 为 `bitesplit-session`，初始版本为 1；客户端挂载后恢复，恢复完成前显示简短加载状态以避免服务端/客户端不一致。
- [ ] 仅序列化 `BillSession`；结果由当前 `Bill` 计算。恢复时若账单不足以支撑保存的步骤，则退回最近可编辑的步骤。
- [ ] 运行相关单元测试；通过后提交本任务。

**产出：** 五步界面可共享的一套状态，以及刷新和重置的确定行为。

## 任务 3：真实 OCR、解析与合计核对

**文件：** 新增 `src/lib/ocr/client.ts`、`preprocess.ts`、`parseReceipt.ts`、`reconcile.ts` 与单元测试；新增 `scripts/prepare-ocr-assets.mjs`、`tests/fixtures/receipts/`；更新依赖及相关资源忽略规则。

**接口：**

- `prepareReceiptImage(file: File, rotation: 0 | 90 | 180 | 270): Promise<Blob>`：检查 JPEG/PNG/WebP 可解码性、修正方向、保留文字比例；输入文件上限 15 MiB，输出最多 600 万像素，超过范围给出可行动的提示。旋转为用户显式选择；初版不依赖自动方向检测。
- `recognizeReceipt(image: Blob, options: { signal: AbortSignal; onProgress: (stage: string, progress: number | null) => void }): Promise<{ text: string; confidence: number }>`：按需加载英文模型，只在客户端执行；进度未知时传 null，不显示虚假的百分比。
- `parseReceiptText(text: string): ReceiptDraft`：纯函数，输入识别文本，输出待核对草稿，不生成可直接结算的结果。
- `reconcileReceipt(draft: ReceiptDraft, confirmed: Bill, addedTipCents: number): { differenceCents: number | null; warnings: string[] }`：另加小费必须由用户明确输入并与票上已包含的小费区分；总额语义含糊时返回提示，不能自行假定。

- [ ] 安装并锁定兼容版本的 Tesseract.js。准备脚本从锁定依赖复制 worker/core 文件，将固定版本英文 traineddata 部署到同站点 `public/ocr/`，记录来源、许可与校验值。配置明确的 workerPath/corePath/langPath；生产构建前执行准备，资源缺失时明确失败。
- [ ] 先写解析测试：`Burger 14.95 / Fries 5.95 / Lemonade 3.50 / Subtotal 24.40 / Tax 2.01 / Total 26.41` 提取 3 个项目、小计 2440、税 201、原票总额 2641；税和合计不能混入项目。
- [ ] 补充案例：建议小费 18%/20% 不入账；明确实收 gratuity 4.00 可作为小费候选；折扣/服务费/多税行/重复总额有警告；缺价行保留 null；数量×单价含糊时保留原始行并要求确认行总价。不要把电话、日期、卡号尾数解析成菜品金额。
- [ ] 实现解析和合计核对。清晰项目价只通过整数分解析；原票小计、总额分别存储。已加小费不得与建议小费或用户追加小费重复计入。合计差额不为零时需要用户处理或显式确认原因。
- [ ] 实现 worker 适配器和预处理。一次只运行一项识别，整个任务上限 120 秒；超时、取消和重置释放 worker。创建中的 worker 在完成初始化后也应被清理；请求 ID 防止迟到结果覆盖新会话。
- [ ] 使用可控 worker 替身测试进度、取消、初始化失败、超时、重选与迟到回调。替身测试只用于生命周期，不能代替真实识别验收。
- [ ] 安装英文模型后，对独立准备的清晰小票图片实际运行 worker，核对真实输出来自图片；空白图没有文字也应转为可理解的失败状态。
- [ ] 运行 OCR 单元测试并记录资源版本。实际浏览器与生产构建的整体验证在任务 7 完成；通过本任务检查后提交。

**产出：** 能读取真实图片的 OCR 服务、可测试的解析器、明确的合计差额与人工核对规则。

**技术依据：** [Tesseract.js API](https://github.com/naptha/tesseract.js/blob/master/docs/api.md)、[资源路径配置](https://github.com/naptha/tesseract.js/blob/master/docs/local-installation.md)。实现时以锁定版本文档和类型为准。

## 任务 4：视觉框架、入口与小票编辑

**文件：** 修改 `src/app/page.tsx`、`src/app/layout.tsx`、`src/app/globals.css`；新增向导容器、首页和小票组件。

**接口：** `BillWizard` 管理恢复状态、当前步骤、照片 object URL 和 OCR AbortController；步骤组件读取 `useBillStore`。首页 `onPhotoSelected(file: File)` 接入任务 3 的预处理与识别，再写入 `ReceiptDraft`；照片重选、重置和卸载时取消旧请求并释放 URL。

- [ ] 建立奶油白/番茄橙主题、窄列布局、步骤进度和底部操作区；复用 Button、Input、Card 等现有控件。设置 BiteSplit 页面标题和描述。
- [ ] 首页提供拍照与上传输入、示例入口；选取取消不改变账单。检查图片 MIME 和可解码性，失败时说明原因并保留重新选择/示例入口。
- [ ] 照片入口显示资源准备、识别进度、取消和错误重试；成功后显示实际识别草稿。示例入口有独立标记；空白图或失败后可使用空表单手动录入，绝不能替换成示例明细。
- [ ] 核对界面提供原图放大、90 度旋转后重试、原始文字和疑点提示。重新识别覆盖已编辑内容前确认；单纯恢复照片预览不触发账单重建。
- [ ] 显示原票小计/总额与编辑后合计；将票上实收小费和额外新增小费区分。金额缺失或含糊提示填写，差额要求修正或显式说明。警告未处理前不能进入人员步骤。
- [ ] 实现项目增删改、税和小费编辑以及派生的小计/总额。输入过程保留原始字符串，允许暂时输入 `12.`；提交时统一解析，错误标到对应字段。
- [ ] 下一步采用表单提交：从最新输入统一校验金额与待确认事项，调用 `confirmReceipt` 后进入人员步骤，保证未失焦输入也生效。空项目名、未填价格或全部删除后不能继续。
- [ ] 在浏览器检查 375px 和桌面布局、输入 `12.34` 后直接点击下一步、错误字段修正、图片选择失败与取消。主要按钮至少 44px 高，底部内容不被固定按钮或安全区遮挡。
- [ ] 运行 lint 和现有单元测试，通过后提交本任务。

**产出：** 真实上传识别与人工核对流程，视觉系统初步完整。

## 任务 5：参与者与逐项分配

**文件：** 新增 `src/components/people/people-step.tsx`、`src/components/split/split-step.tsx`；接入向导容器。

**接口：** 复用任务 2 的人员和分配操作；颜色映射以参与者 ID 为依据，在步骤间保持一致。至少一名参与者才能继续，每个项目至少选择一人才能计算。

- [ ] 完成人员添加、改名和删除，支持 Enter 添加；标签包含姓名和有文字辅助说明的删除按钮。
- [ ] 完成每个项目的多人选择与“Everyone”操作，使用 `aria-pressed` 表达选择；展示“已分配 x/y 项”及未分配提示。
- [ ] 支持返回修改小票和人员；删除已分配者后更新归属和完成计数，新加入者只在再次点击 Everyone 时被加入该项目。
- [ ] 核对空人员、同名不同 ID、长姓名换行、所有人共享、取消最后一个选择及删除已分配人的行为。
- [ ] 运行状态测试和 lint，在手机宽度及键盘操作下走通到分配步骤；通过后提交本任务。

**产出：** 用户能明确表达每道项目由谁承担，不丢失返回修改前的选择。

## 任务 6：结果、复制与重新开始

**文件：** 新增 `src/components/result/result-step.tsx`、`src/lib/share.ts`、`src/lib/share.test.ts`；接入向导容器。

**接口：** `formatShareText(result: SplitResult): string` 输出标题、每人总额、小计、税、小费、账单总额；组件使用 `splitBill` 的当前结果。剪贴板调用属于 UI，不进入纯函数。

- [ ] 先测试分享文本金额与任务 1 的 1954 分样例一致，并逐人包含 A=$6.52、B=$13.02；总额展示 $19.54。
- [ ] 实现结果页：每人应付金额、可展开的项目金额/税/小费汇总、账单总额，以及按稳定顺序展示的参与者标签。
- [ ] 实现 Copy summary，写入成功才提示已复制；权限被拒绝时展示可手动选取的完整文本。
- [ ] 提供返回修改和重新开始。重新开始调用统一 reset、释放照片预览并回首页；页面不使用“已付款/已结清”的文案。
- [ ] 从结果页返回修改价格和归属后再次计算，验证结果与分享文本均刷新；运行分享和计算测试及 lint，通过后提交本任务。

**产出：** 第一条完整分账流程可交付使用。

## 任务 7：真实 OCR 验收、文档与交付

**文件：** 新增 `playwright.config.ts`、`tests/e2e/bill-flow.spec.ts`、`tests/e2e/ocr-flow.spec.ts`；扩展已有 `tests/fixtures/receipts/manifest.json`；更新 `package.json`、锁文件、`.gitignore`、`README.md`。业务修复限定在验收发现的问题。

- [ ] 添加 Playwright 开发依赖与 `test:e2e` 命令，配置本地 webServer；测试报告和运行产物加入忽略规则。Vitest 不收集端到端测试文件。
- [ ] 编写完整示例流程：将 Burger 从 1495 改成 1001、删除 Lemonade、Fries 改成 500、税改成 151、小费改成 302；A/B 共享 Burger，B 独享 Fries；断言 A=$6.52、B=$13.02、总额=$19.54。价格修改后立即点击下一步，不先手动失焦。
- [ ] 编写刷新恢复、返回修改、删除参与者后的未分配拦截、最终重置再刷新等行为测试。
- [ ] 真实 OCR 测试必须启动浏览器中的 Tesseract worker，不能模拟 recognize 返回值。准备至少两张清晰测试小票图片及人工标注 JSON，验证图片中特定项目与金额、税和总额被提取，接着完成分账并核对总额。
- [ ] 用户提供的 Line Thai Cafe 原图必须参与真实浏览器验收：收费行金额为 `[1390, 790, 400, 2580, 1290, 800]`，税 598，总计 7848。覆盖 ×2 数量、each 单价行、Fried Tofu (12)、Chicken/No Onion 备注和重复付款总额。A/B 共享全部项目、零小费时各付 3924 分；人工修正前后的结果分别记录。
- [ ] 收集至少三张来源允许用于测试的真实英文餐厅小票照片，记录来源与使用许可，覆盖清晰正面、轻微倾斜/光照差和复杂小费区。清晰照片必须产生与照片一致的可用项目；每张记录误读、遗漏及手动修正后的完整分账结果。若缺实拍材料，明确记录验收缺项，不能把生成图片标为实拍验证。
- [ ] 空白、模糊图测试不要求猜出金额，要求保留手动继续路径；验证旋转重试、识别取消、重选图片、reset 与迟到结果、模型资源加载失败、超时后重试。
- [ ] 覆盖损坏缓存、复制权限失败和刷新后的照片重新附加；识别草稿可恢复，进行中的 worker 不冒充恢复成功。确认图片内容未发送到 OCR 后端。
- [ ] 在生产构建启动后实际识别一张新图片，检查 worker/WASM/英文模型资源无 404 或跨域错误。清缓存后记录首次加载与第二次识别耗时；120 秒内必须成功或进入可恢复错误状态，取消操作及时返回可操作界面。
- [ ] 在 375px 宽度和桌面宽度检查完整五步的布局与焦点：无横向溢出、按钮不遮内容、错误可定位、姓名可读、键盘可完成主要操作，并支持减少动画设置。
- [ ] 重写 README：Node 24/npm 安装与启动命令、目录职责、金额规则、缓存范围、真实 OCR 流程、资源准备/部署命令、首次加载联网说明、支持的语言/图片范围、测试命令和实测限制。
- [ ] 执行 `npm run lint`、`npm test`、`npm run test:e2e`、`npm run build`，逐项确认成功；构建后的首页做一次启动检查。若失败，按具体失败修复并重跑受影响检查。
- [ ] 对照 `docs/design.md` 的验收清单检查遗漏，保存简短验证记录到 `docs/verification.md`，记录实际命令、结果和任何未解决限制；通过后提交本任务。

**产出：** 可本地运行、包含真实 OCR 并可复现验证的 MVP 仓库；验证记录清楚区分引擎集成测试、实拍识别结果和需人工修正的情况。

## 本次完成标准与后续范围

本次完成必须同时满足：真实图片识别、可核对的实际明细、完整分账分享、会话恢复、精确金额，以及 lint/单元测试/真实 OCR 浏览器测试/生产构建通过。示例流程跑通不能作为 MVP 完成结论。

后续再考虑多语言、复杂折扣自动分配、多张小票、云同步和支付。真实 Tesseract.js OCR 已属于本次范围，不再列作后续阶段。
