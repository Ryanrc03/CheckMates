# CheckMates V2.3 Dish Translation Implementation Plan

> 2026-09-28：用户已明确将翻译推迟到 **V3**，本历史计划暂停执行，标题中的 V2.3 为旧编号。英译中方向已确认，模型方案需根据实测重新评审。当前工作见[新版 V2 计划](../specs/2026-09-28-checkmates-v2-image-first-design.md)。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用户主动开启后，以中英对照快速理解菜品；首次模型下载、设备不兼容或翻译失败均不阻碍分账。

**Architecture:** 独立翻译服务管理词表、缓存与 provider。原生浏览器 API 留在窗口上下文，Transformers.js 在独立 Web Worker 中按需运行；任何翻译都不改变 Bill 的名称、归属和金额。先做真实手机验证，再决定是否发布通用本地模型。

**Tech Stack:** TypeScript、React、Web Worker、可选 Chrome Translator API；Transformers.js 稳定版与英中 ONNX 模型由 Task 1 实测锁定；Vitest、Playwright。

**Spec:** [V2 设计 §1–3、§6–8](../specs/2026-09-27-checkmates-v2-design.md)。状态：草案；默认英文→简体中文，语言范围待用户评审。

## Global Constraints

- 翻译只增加展示信息，不能覆盖菜品原文、修改价格或把金额送入翻译模型。
- 主界面继续使用英文，开关为 `Show Chinese names`；菜品译文使用简体中文。
- V2 默认不新增云端 OCR 或翻译接口；不上传照片、整段 OCR 原文或人员名单。
- 模型和运行时按需加载，记录固定版本、模型 revision、文件大小、校验值和许可证。
- 手机优先；模型失败时保留原文、手动编辑和继续分账。不能把桌面支持称为手机支持。
- OCR 忙时模型翻译排队，不让两套大模型同时初始化或推理；OCR 开始前释放应用持有的翻译实例，浏览器内置模型缓存由浏览器管理。
- 修改 Next.js 代码前先阅读本仓库 `node_modules/next/dist/docs/` 中相应指南。
- 不变更账单存储 schema；翻译缓存独立，重置当前账单不能恢复其旧译文。

## Review Focus

1. 模型下载过大或手机 OOM，页面因此不可用：Task 1/3 测实际设备、下载失败与取消。
2. 菜名已修改/删除，迟到译文绑定到新菜品：Task 2/4 用请求代次、ID 和原文三者校验。
3. “No Onion” 否定语义丢失，音译菜名被编造原料：Task 1/2 的人工语料和精确词表测试。
4. 相同中文译名的两个菜被合并或变价：Task 4 验证翻译前后 Bill 深比较和各 ID 的归属。
5. 无 Translator/WebGPU/缓存权限时死循环重试或偷用云服务：Task 3/5 验证能力检测、单次降级和可恢复失败。

## 文件边界与数据合同

- Create `src/types/translation.ts`, `src/lib/translation/{glossary,cache,service,native,transformers-client}.ts`, `src/workers/translation.worker.ts`。
- Create `src/store/useTranslationStore.ts`（仅翻译展示状态），`src/components/translation/{translation-controls,dish-label}.tsx`。
- Create `tests/fixtures/translations/en-zh-dishes.json`（50 条人工语料），`docs/validation/v2-translation-benchmark.md`, `docs/translation-model-manifest.json`。
- Modify receipt/split/result 展示组件、`bill-wizard.tsx`、README；只有 Task 1 通过后才修改 package/lock 引入运行时。

`TranslationItem={id:string,name:string}`；`TranslationRequest={items:TranslationItem[],sourceLanguage:'en',targetLanguage:'zh-Hans'}`；`TranslatedItem={id:string,sourceText:string,translatedText:string,provider:'glossary'|'native'|'transformers',revision:string}`。

`TranslationProgress={stage:'queued'|'awaiting-activation'|'downloading'|'initializing'|'translating',loadedBytes?:number,totalBytes?:number,completedItems?:number,totalItems?:number}`；未知总字节数时不编造百分比。

`TranslationOptions={signal:AbortSignal,onProgress:(progress:TranslationProgress)=>void}`。

`TranslationProvider={id:'native'|'transformers',revision:string,availability:()=>Promise<'ready'|'download-required'|'unavailable'>,prepare:(options:TranslationOptions)=>Promise<void>,translate:(request:TranslationRequest,options:TranslationOptions)=>Promise<TranslatedItem[]>,dispose:()=>Promise<void>}`。prepare 单独处理需要用户激活的下载/初始化；原生 API 在点击处理器中启动，不能假定排队后仍保留 user activation。

公共入口 `translateDishes(request:TranslationRequest,options:TranslationOptions):Promise<TranslatedItem[]>`；单次最多50项，每项最多120字符；更长文本保留原文并提示单独精简，不能偷偷截断后当成完整译文。

服务另提供 `setOcrBusy(busy:boolean):Promise<void>` 和 `cancelTranslations():Promise<void>`。busy=true 先暂停出队、取消正在进行的翻译并释放实例，调用者等待后再启动 OCR；期间新请求可排队，busy=false 后继续。被取消的当前批次显示重试入口，已完成译文保留。cancelTranslations 取消活动及排队请求并使其 Promise 以 AbortError 结束。排队恢复若遇原生下载需激活，显示按钮再次 prepare，不能自动循环 create。

能力探测通过 `getTranslationCapabilities():Promise<{providerId:TranslationProvider['id'],availability:'ready'|'download-required'|'unavailable'}[]>` 返回，不下载模型。UI 依据探测结果显示提供者与下载提示；用户点击时直接调用 `prepareTranslation(providerId:TranslationProvider['id'],options:TranslationOptions):Promise<void>`，同步转发对应 provider.prepare，不能先 await 另一轮能力探测而消耗激活。OCR busy 时禁止 prepare；这两个方法同属 TranslationService。

### Task 1：验证本地英中翻译是否适合这个产品

**Files:** Create `tests/fixtures/translations/en-zh-dishes.json`, `docs/validation/v2-translation-benchmark.md`, `docs/translation-model-manifest.json`；临时探针仅放 `.private/translation-probe/`。

**Interfaces:** 输出 go/no-go 报告，包含 npm 精确版本、模型完整 commit revision、所用 dtype、实际请求清单/大小、设备浏览器版本、速度与人工语义评分。该报告是 Task 3 选择模型的输入，不是生产功能。

- [ ] 先冻结50条独立人工语料：常见英文菜名、`Pineapple Fried Rice`、`Fried Tofu (12)`、`Pad Thai`、缩写、`No Onion`、`No peanuts`、`Extra spicy`、混合中文和未知专名。允许多个正确译法；模型文本不用于生成标准答案。
- [ ] 比较词表、Chrome Translator 和 `Xenova/opus-mt-en-zh` 的实际结果。Transformers.js 可从已核对的稳定版3.8.1开始探针；若改版本，记录原因并检查版本对应文档和支持的模型格式。
- [ ] 从模型仓库解析完整 revision 并锁定，不用浮动 main。核查中文语言 token/配置能产出简体中文；小型通用翻译模型不假定天然熟悉所有菜名。记录原模型及 ONNX 产物许可。
- [ ] 对桌面 Chrome、真实 Android Chrome、真实 iPhone Safari 分别测冷启动/热态10菜批次、取消、网络断开、缓存命中、WASM/WebGPU 路径。模型权重不提交 Git，不能把仓库总大小误记为单次下载。
- [ ] 判断是否达到设计门槛：语义可用 ≥90%；否定/数量关键错误样例为0；热态10菜P95≤3秒；20Mbps冷态≤90秒或可恢复错误；取消≤1秒恢复操作。没有设备时明确缺项。
- [ ] **决策点：**达标的平台进入 Task 3 对应 provider 实现；未达标的平台只能先交付词表/原文路径。若主力手机无法支持通用翻译，停止承诺 V2.3 全量发布，提交报告并另议云服务的隐私/费用，不在实现中静默换云 API。
- [ ] 提交语料、测量和模型清单，临时探针不进入生产入口。该任务不要求人为把不可行实验改成成功。

### Task 2：词表、缓存、任务队列与防止过期结果

**Files:** Create `src/types/translation.ts`, `src/lib/translation/glossary.ts`, `cache.ts`, `service.ts` 及相应 `*.test.ts`；Create `src/store/useTranslationStore.ts` 及测试。

**Interfaces:** `lookupDishTranslation(name:string,targetLanguage:'zh-Hans'):string|null`；`translationCacheKey(name:string,targetLanguage:string,revision:string):string`；缓存条目包含原文、译文、provider、revision、createdAt。`createTranslationService(providers:TranslationProvider[]):TranslationService` 返回上述 translateDishes / setOcrBusy / cancelTranslations / getTranslationCapabilities / prepareTranslation 方法，生产使用单例，测试注入替身；TranslationService 类型定义在 `src/types/translation.ts`。

- [ ] 写失败测试：精确词表 `Pineapple Fried Rice → 菠萝炒饭`、`No Onion → 不要洋葱`；未知名称返回 null，不做子串拼接。`Milk Tea` 与 `Milk Tea with Cheese` 不能共用缓存键。
- [ ] 缓存只规整大小写与连续空白，不删除数量或否定词。键包括目标语言、词表版本和引擎/模型revision。最多300条、30天TTL；损坏 JSON、配额满或禁用存储时退到内存，仍可分账。
- [ ] 实现词表→有效缓存→provider 顺序；同批同名菜只翻译一次再映射回多个 ID。模型队列并发1，OCR busy 时保持 queued，纯词表/缓存命中仍可立即返回。测试 OCR 开始前 dispose 完成、忙态期间无 provider 调用、解除后恢复，以及待用户激活时只提示一次。
- [ ] 每次翻译记录 request generation 和提交时的原文。测试发起 Soup 翻译后改名 Salad、删除条目、重置账单、切语言四种情况；旧结果全部丢弃。
- [ ] 切回原文只隐藏译文；重置当前账单清除 active results 并取消任务；独立“清除翻译缓存”只清翻译条目，不删账单。模型资源缓存与菜名缓存分别管理，不谎称清词条已删除模型。
- [ ] Run `npm.cmd test -- src/lib/translation src/store/useTranslationStore.test.ts`；模型提供者用确定性替身测试业务状态，真实模型质量仍由 Task 1/5 测量。通过后提交。

### Task 3：实现支持平台上的翻译 provider

**Files:** Create `src/lib/translation/native.ts`, `transformers-client.ts`, `src/workers/translation.worker.ts`, provider 测试；按 Task 1 结论 Modify `package.json`, `package-lock.json`, `next.config.ts`（仅实测必要时）。

**Interfaces:** 两种 provider 实现同一 TranslationProvider；浏览器原生 targetLanguage 由适配器将 `zh-Hans` 映射为支持的 `zh`。Worker 消息包含 jobId、generation、request，返回进度/结果/错误。

- [ ] 先写失败测试：没有 `Translator` 返回 unavailable；原生 API 可用但模型未下载时返回 download-required；prepare 由用户点击触发才 create。原生 API 不放入 Web Worker，也不在模块顶层访问 window。排队丢失激活时进入 awaiting-activation，重新点击可继续，无无限重试。
- [ ] 在 Task 1 通过的平台上实现 Transformers provider；动态 import 运行时、固定 revision 的模型资源，量化格式取自实测清单，Worker 持有单个 pipeline。首页和“仅算账”流程不下载 ONNX。
- [ ] 浏览器内置模型优先；不支持则在明确展示下载体积后使用本地模型。WebGPU 失败至多重建一次 WASM worker；原 worker 必须释放，避免同时驻留两份模型。
- [ ] 下载90秒仍无法就绪时返回可重试错误；用户取消则终止本地 worker 并忽略迟到事件。原生调用按已支持的取消/释放能力清理，不能仅隐藏 spinner 却继续更新当前菜品。
- [ ] 对所有返回文本限制长度并作为 React 文本渲染；输出含 HTML 也不能执行。只发菜名到本地 provider，网络只允许固定模型/运行时资源请求，不出现携带菜名的云端推理请求。
- [ ] Run provider 单测、`npm.cmd run build` 和真实浏览器首访加载测试；核对实际下载文件与 manifest 一致。若 Next 打包配置需变更，先读安装包文档；不能无依据切换整个项目构建工具。通过后提交。

### Task 4：接入中英对照与可理解的加载反馈

**Files:** Create `src/components/translation/translation-controls.tsx`, `src/components/translation/dish-label.tsx`, `src/lib/translation/share.ts`, `src/lib/translation/share.test.ts`, `tests/e2e/dish-translation.spec.ts`；Modify `src/components/receipt/receipt-step.tsx`, `src/components/split/split-step.tsx`, `src/components/result/person-breakdown.tsx`, `src/components/result/result-step.tsx`, `src/components/bill-wizard.tsx`, `src/app/globals.css`。本任务的结果页/详细分享接入依赖 V2.2 Task 2；Task 1–3 可提前独立完成。

**Interfaces:** `DishLabel({id:string,originalName:string})` 展示原文和匹配当前原文的译文，不改输入框值；TranslationControls 使用能力探测、prepareTranslation 和 translateDishes，BillWizard 在 OCR 开始前 await setOcrBusy(true)、结束的 finally 中解除，在 reset 时 cancelTranslations。`formatBilingualShareText(bill:Bill,breakdown:BillBreakdown,translations:TranslatedItem[]):string` 位于 `src/lib/translation/share.ts`，只用 ID 与 sourceText 同时匹配的译文组合展示名称，再调用 V2.2 的 formatDetailedShareText；不修改传入 Bill 或 breakdown。

- [ ] 先写浏览器失败测试：“显示中文菜名”点击前无模型请求；词表命中立即展示；未命中显示下载/排队/翻译状态和取消；失败仍可进入分配及结果。
- [ ] 为整单与单项提供入口。核对页将译文放在原文编辑框旁/下方，分配页和结果明细共用 DishLabel；始终保留原文，机器输出不自动成为持久化菜名。
- [ ] 改名后立即清理该条旧译文，给出重新翻译入口；同译名的两个菜仍是两个独立 ID。加载状态用 aria-live，双语长名换行，375px 无横向溢出。
- [ ] 加 `Include Chinese names` 详细分享选项。单测断言匹配菜名显示 `Pineapple Fried Rice / 菠萝炒饭`，旧 sourceText、删除的 ID 不输出译文；所有原始金额和原文保留，输入对象不变。译文仅作机器翻译参考，不另设不存在的“已确认译文”状态。
- [ ] 对开启/关闭翻译前后的 Bill、splitBill 结果做深比较，断言对象值完全一致；仅翻译 cache/store 改变。
- [ ] Run `npm.cmd run test:e2e -- --grep 'dish translation'` 和相关单测，再提交。UI状态测试可替换 provider；报告明确区分这种测试和真实模型验收。

### Task 5：生产资源、手机体验与最终验收

**Files:** Update `docs/validation/v2-translation-benchmark.md`, `docs/translation-model-manifest.json`, `README.md`, `docs/verification.md`；Complete `tests/e2e/dish-translation.spec.ts`。

**Interfaces:** 输出支持设备列表、实际下载量、冷/热耗时和语言覆盖声明；不得把实验未过的平台列为已支持。

- [ ] 使用真实 provider 在生产构建中翻译与 Task 1 独立的10个菜名，至少含原文未被词表覆盖的菜。检查原文/译文同屏以及没有菜名出站请求。
- [ ] 对真实手机重复基准；记录模型缓存命中、存储被清理后的重新下载、弱网、离线、内存压力下的恢复能力。不用单元测试替身宣称质量和性能通过。
- [ ] 断言首页初始模型请求数0、用户不使用翻译时分账性能不回退、OCR与翻译不同时加载大模型。确认翻译失败/取消不取消用户正在进行的算账编辑。
- [ ] Run `npm.cmd run lint`、`npm.cmd test`、`npm.cmd run build`，再跑完整生产浏览器流程。记录哪些平台仅支持词表，哪些有通用本地翻译。
- [ ] 在 Vercel 预览中验证模型资源的CORS、缓存及固定revision；大模型不提交Git，也不默认通过Serverless函数转发。验收后按实施时授权发布，写入已知限制并提交。

## 选型依据

- [Chrome Translator API](https://developer.chrome.com/docs/ai/translator-api)：当前只覆盖桌面，不适合作为手机产品唯一翻译途径。
- [Transformers.js 官方文档](https://huggingface.co/docs/transformers.js/en/index)和[Next.js 客户端 Worker 示例](https://huggingface.co/docs/transformers.js/v3.8.1/tutorials/next)：浏览器内推理及按需生命周期。
- [Xenova 英中候选](https://huggingface.co/Xenova/opus-mt-en-zh)与[文件大小](https://huggingface.co/Xenova/opus-mt-en-zh/tree/main/onnx)：能力与下载成本需按实际选用文件核对，不能假设 q4 一定比 q8 小。
