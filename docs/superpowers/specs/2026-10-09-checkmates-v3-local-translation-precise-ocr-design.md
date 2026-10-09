# CheckMates V3：本地菜名翻译（Firefox Translations / Bergamot）与 PaddleOCR 精细识别设计

日期：2026-10-09。状态：**设计已由用户确认（2026-10-09），进入实施。** 基线 `main@8ce4d03`，功能分支 `feat/v3-local-translation-precise-ocr`。依据：[2026-10-09 手机端本地翻译调研与实测](2026-10-09-checkmates-on-device-translation-mobile-research.md)、[2026-09-28 本地推理调研](2026-09-28-checkmates-local-inference-research.md)、[2026-09-27 翻译计划的合同](../plans/2026-09-27-checkmates-v2-translation.md)。

交付边界（用户选择）：在功能分支上完成开发、单测、桌面 Chromium 浏览器测试和生产构建；**不推送、不部署**；真机验证延后，所有文档只能声明桌面验证。

## 1. 目标与非目标

目标：

1. **一键中文菜名**：确认页的 `Show Chinese names` 开关打开后，每个菜品名下方显示简体中文译文；分配页同步显示。译文只是展示信息：原文始终可见可编辑，账单 ID、金额、分账计算不变。
2. **翻译流水线**：规则与词表优先，Mozilla Firefox Translations en→zh-Hans 模型（bergamot WASM）只处理词表未命中的部分。否定、数量、数字永远不进模型。
3. **精细识别**：照片校正确认页可选 `Precise` 引擎，按需下载 PaddleOCR PP-OCRv5 mobile 模型，在 Worker 内识别，结果按几何重建成文本行后交给现有解析器；Tesseract 仍是默认引擎。
4. **共享的本地模型资产层**：两个功能共用"按需下载 → Cache API 按版本缓存 → 进度/取消 → 到期清理 → 用户可删除"的基础设施；所有资源同源、固定版本、带 SHA-256 manifest 与许可信息。

非目标（本轮不做）：

- 不做版面感知的新解析器（属于 10/06 识别计划）；精细识别只替换"文字→行"这一层，解析仍用 `parseReceiptText`。
- 不做云端翻译或云端 OCR；不新增 Translator API 等平台接口。
- 不改账单 session schema（版本仍为 1），不改金额计算，不改英文主界面。
- 结果页与复制文本目前没有菜名，所以不加"复制时附中文"选项。
- 不做分块断点续传、不做 COOP/COEP 多线程、不做 WebGPU；不承诺离线可用。
- 不在本轮部署或做真机验收。

## 2. 关键选型

| 决策 | 选择 | 理由 / 放弃的备选 |
| --- | --- | --- |
| 翻译模型 | Mozilla `translations-models` en→zh-Hans **v2.2**（base-memory 架构）：`model.enzh.intgemm.alphas.bin` 43,849,787 B、`srcvocab.enzh.spm` 806,952 B、`trgvocab.enzh.spm` 772,004 B、`lex.50.50.enzh.s2t.bin` 6,506,248 B，合计 51,934,991 B；MPL-2.0 | 调研中唯一体积/质量/速度都可接受的候选（17/50 正确、12 ms/条、内存 0.2–0.4 GB）。opus-mt 质量更差且 Transformers.js 4.x 需打补丁；小 LLM 体积与内存超限 |
| 翻译运行时 | Firefox 自带 bergamot-translator **v0.6.0** wasm（Remote Settings `translations-wasm` release v0.6.0，4,960,506 B，sha256 `a3a89d9a…`）+ mozilla-central 生成的胶水 `bergamot-translator.js`（MPL-2.0，约 100 KB，随仓库 vendored）+ 本项目自己的经典 Worker | npm `@browsermt/bergamot-translator` 0.4.9 是 2022 年构建，输出一致但内存多一倍；无维护中的 npm 包 |
| OCR 精细引擎 | `@paddleocr/paddleocr-js` 0.4.2（Apache-2.0）+ 它依赖的 `onnxruntime-web`（锁定具体版本），PP-OCRv5_mobile det + rec（ONNX，`.tar`，Apache-2.0），`wasm` 后端、单线程 | 9/28 实测在样本上文字读取优于 Tesseract；SDK 自带 Worker 传输层；不需要 COOP/COEP |
| 资源托管 | 同源 `public/models/<bundle>/<version>/...`，由 `scripts/prepare-model-assets.mjs` 在 `prepare` 阶段生成：从固定 URL 下载（Mozilla Remote Settings CDN、PaddlePaddle BOS）或从 `node_modules` 复制，逐文件校验 SHA-256，写 `public/models/manifest.json`；目录被 Git 忽略，快照提交到 `docs/model-assets-manifest.json` | 与现有 `public/ocr` 做法一致；GitHub LFS 对象已下线；第三方 CDN 不能当生产源；R2 等到流量超预算再切 |
| 运行时与模型的缓存层次 | **模型数据文件**进 Cache API（翻译：4 个模型文件 + wasm；OCR：2 个 .tar）；**运行时代码**（Paddle worker 11 MB、ORT wasm 14 MB）作为带 `Cache-Control: immutable` 的版本化静态文件走 HTTP 缓存 | 运行时代码由 `new Worker(url)`/ORT 自己加载，不便经 Cache API 中转；用户看到的"首次下载大小"仍把它们算进去 |
| 模型调用方式 | 逐条翻译，同名去重 | 整批调用会改变 11/50 条输出，且评审只针对逐条结果 |
| 清除策略 | 不在 `pagehide` 清理；启动时按 14 天未用或版本不符清理；首页 "Offline data" 提供删除；以 `caches.keys()` 为准 | iOS 划掉标签页不触发 `pagehide`；`storage.estimate()` 删除后不刷新 |

## 3. 架构与模块

```
src/lib/model-assets/        资产层（manifest、Cache API、进度、到期、删除）
  types.ts  manifest.ts  bundles.ts  bundles.test.ts
src/lib/translation/         翻译
  types.ts  normalize.ts  rules.ts  glossary.ts  glossary-data.ts  pipeline.ts
  bergamot-client.ts  service.ts  cache.ts  *.test.ts
src/store/useTranslationStore.ts
src/components/translation/translation-controls.tsx  dish-label.tsx
src/components/home/offline-data.tsx
src/lib/ocr/paddle/          精细识别
  spatial.ts  adapter.ts  factory.ts  *.test.ts
src/lib/ocr/client.ts        recognizeReceipt 增加 engine 参数（兼容旧调用）
vendor/bergamot/             bergamot-translator.js（MPL-2.0 胶水）、translator-worker.js（本项目）、VENDOR.md
scripts/prepare-model-assets.mjs
public/models/               生成物（gitignore）
docs/model-assets-manifest.json  manifest 快照
```

### 3.1 资产层 `src/lib/model-assets/`

Manifest（`public/models/manifest.json`，由 prepare 脚本生成，客户端按需 `fetch` 同源读取；`docs/model-assets-manifest.json` 为提交的快照）：

```ts
type ModelBundleId = "translate-enzh" | "ocr-precise";
type ModelAssetFile = { path: string; bytes: number; sha256: string; role: "model" | "runtime"; cache: "cache-api" | "http" };
type ModelBundleManifest = { id: ModelBundleId; version: string; totalBytes: number; files: ModelAssetFile[]; license: string; sources: { file: string; url: string }[] };
type ModelAssetsManifest = { generatedAt: string; bundles: Record<ModelBundleId, ModelBundleManifest> };
```

接口（`bundles.ts`，所有函数接受可注入的 `caches`、`localStorage`、`fetch`、`now` 以便单测）：

- `getBundleStatus(id)` → `{ id, version, totalBytes, downloadBytes, cached: boolean, installedAt, lastUsedAt }`。`cached` 以 Cache API 中 `cache: "cache-api"` 的全部文件都存在为准。
- `ensureBundle(id, { signal, onProgress })` → `BundleHandle`。逐文件 `cache.match(url)`，缺失的用 `fetch` 流式读取并按 manifest 字节数报告进度 `{ stage: "checking" | "downloading" | "ready", loadedBytes, totalBytes, file }`，完成后 `cache.put`（整文件响应）；校验 `Content-Length` 与 manifest 一致，不一致视为失败。`signal` 中止时抛 `AbortError`，已存好的文件保留（下次续用）。
- `BundleHandle`：`{ id, version, url(path) → 同源绝对 URL, bytes(path) → ArrayBuffer（Cache API）, fetch: typeof fetch（命中 Cache API 时直接返回缓存响应，否则走网络；供 PaddleOCR SDK 的 fetch 选项使用）, touch() }`。
- `removeBundle(id)` → 删除该 bundle 当前版本与所有旧版本的缓存名（`cm-models-<id>-v*`），清 localStorage 记录。
- `purgeExpiredBundles({ maxAgeDays: 14 })` → 在前台启动时调用（`BillWizard` 挂载后、`visibilitychange→visible` 时），删除 `lastUsedAt` 超期或版本与 manifest 不符的 bundle，返回已删除列表。
- 记录存放在 localStorage 键 `bitesplit-model-assets`：`{ version: 1, bundles: { [id]: { version, installedAt, lastUsedAt } } }`；损坏时按空处理。
- 缓存名 `cm-models-<id>-v<version>`；键为同源绝对 URL。不使用 `navigator.storage.estimate()` 判断状态。

`next.config.ts` 的 `headers()` 为 `/models/:path*` 设 `Cache-Control: public, max-age=31536000, immutable`（路径含版本号）。修改前按 AGENTS.md 读 `node_modules/next/dist/docs/` 的 headers 与 public-folder 文档。

### 3.2 翻译 `src/lib/translation/`

类型（沿用 2026-09-27 计划的合同，按本设计裁剪）：

```ts
type TranslationProvider = "glossary" | "rule" | "model";
type TranslationItem = { id: string; name: string };
type TranslatedItem = { id: string; sourceText: string; translatedText: string; provider: TranslationProvider; revision: string };
type TranslationProgress = { stage: "queued" | "awaiting-download" | "downloading" | "initializing" | "translating" | "ready"; loadedBytes?: number; totalBytes?: number; completedItems?: number; totalItems?: number };
type TranslationService = {
  getCapabilities(): Promise<{ modelAvailable: boolean; modelCached: boolean; downloadBytes: number; reason?: string }>;
  translateDishes(items: TranslationItem[], options: { signal: AbortSignal; onProgress: (p: TranslationProgress) => void; allowModel: boolean }): Promise<TranslatedItem[]>;
  setOcrBusy(busy: boolean): Promise<void>;
  cancelTranslations(): Promise<void>;
  dispose(): Promise<void>;
};
```

流水线（`pipeline.ts`，纯函数 + 可注入的模型函数）：对每条原文依次

1. `normalize`：trim、合并空白、全角括号归一；记录原始大小写。
2. `protect`：摘出并保护数量/数字片段：前缀 `2x`/`2 x`/`x2`、尾部 `(12)`、百分比 `18%`、金额与纯数字；翻译核心部分后按原位置拼回（`Fried Tofu (12) → 炸豆腐 (12)`、`2x Egg Roll → 2x 蛋卷`）。
3. `modifierRules`：以词边界匹配否定与修饰前缀：`No|Without|W/O|Hold|Skip` → `不要 + 核心`；`Extra` → `加 + 核心`（`Extra Spicy` 为整句词表命中 `特辣`，优先于规则）；`Add|With|W/` → `加 + 核心`；`Side of|Side` → `配 + 核心`；`Lg|Large|Sm|Small|Md|Medium|Reg|Regular` → `大份/小份/中份/普通 + 核心`。规则只递归处理一次核心部分，核心部分再走词表/模型。
4. `expandAbbreviations`：整词映射（不区分大小写）：Chkn/Chk→Chicken、Fr→Fried、Veg→Vegetable、Spr→Spring、Ndl→Noodle、Bf→Beef（仅在后面跟食物名词时；单独的 `BF` 保留）、Mush→Mushroom、Shrmp→Shrimp、Choc→Chocolate、Bev→Beverage、Btl→Bottle、Rst→Roast、Grl→Grilled、Swt→Sweet、Sr→Sour……；歧义缩写（GF、BF、SS、LG 作为菜名一部分时）保留原样。展开结果记入 provenance，便于显示。
5. `glossary`：规范化整句精确命中（约 250 条：常见美式/亚洲菜名、饮品、甜点、菜系专名、修饰语）→ 译文，provider `glossary`。
6. 未命中 → 模型（`allowModel` 为真且引擎可用时）；否则返回 `null`（UI 显示"未翻译"）。模型输出经 `postprocess`：去首尾空白与引号、繁转简不做（模型输出已是简体）、含 `>>`/`<<`/控制字符视为失败。

模型客户端（`bergamot-client.ts`）：在主线程创建经典 Worker `new Worker("/models/translate-enzh/<version>/runtime/translator-worker.js")`，协议 `{ id, name, args }` ↔ `{ id, result | error }`，方法 `initialize({ wasmBytes })`、`loadModel({ model, lex, vocabs })`（ArrayBuffer 以 transfer 方式传入）、`translate({ texts }) → string[]`、`free()`。模型字节来自 `BundleHandle.bytes()`。首次翻译前做一次 `translate(["warm up"])` 预热（调研：首次调用 183–235 ms）。Worker 文件 `vendor/bergamot/translator-worker.js` 用 `importScripts` 加载同目录的 `bergamot-translator.js`，调用 `loadBergamot({ INITIAL_MEMORY: 40 MiB, wasmBinary })`，`AlignedMemory` 对齐 model 256 / lex 64 / vocab 64，`TranslationModel` 七参数构造，配置与 Firefox `translations-engine.worker.js` 相同（beam-size 1、gemm-precision int8shiftAlphaAll 等）。能力探测：`typeof WebAssembly === "object"` 且 WASM SIMD 可用（用一段最小 SIMD 字节码 `WebAssembly.validate`），否则 `modelAvailable=false, reason="wasm-simd"`。

服务（`service.ts`）：单例；队列并发 1；OCR busy 时 `translateDishes` 进入 `queued`，`setOcrBusy(true)` 先取消进行中的模型任务并 `dispose` 引擎（释放约 0.4 GB），`setOcrBusy(false)` 后继续；每次请求带 generation，返回前校验 `(id, sourceText)` 仍与请求一致；`cancelTranslations` 以 `AbortError` 结束活动与排队请求；词表/规则命中不经队列，立即返回；同名菜去重后映射回多个 ID；单次最多 50 项、每项 120 字符，超限项原文保留并标 `too-long`。

译文缓存（`cache.ts`）：localStorage 键 `bitesplit-translations` `{ version: 1, entries: { [normalizedSource]: { text, provider, revision, at } } }`，上限 300 条、30 天 TTL，LRU 淘汰；损坏或配额满时退化为内存缓存。缓存键只规整大小写与空白，不删除数量与否定；`revision` = `glossaryVersion + modelVersion`，规则或模型升级后旧条目失效。与账单 session 分开；`resetBill` 只清当前展示结果，不清译文缓存；首页 "Offline data" 的删除按钮同时清译文缓存（说明文案写明）。

状态（`useTranslationStore.ts`，zustand，不持久化）：`enabled: boolean`（开关，持久化到 localStorage `bitesplit-translation-enabled`）、`status: TranslationProgress & { error?: string }`、`results: Map<itemId, TranslatedItem>`、动作 `setEnabled`、`request(items)`、`cancel`、`clearForBill`、`invalidate(itemId)`（改名时立即清掉该项旧译文并重新请求）。

UI：

- `TranslationControls`（确认页，items 上方）：`Show Chinese names` 开关；开启后：词表/规则命中的项立即显示；若还有未命中项且模型未缓存，显示内联面板 "Translate the rest with the on-device model? One-time download of 57 MB; nothing leaves your phone. [Download and translate] [Not now]"；下载/初始化/翻译时显示 `role="status"` 进度（`aria-live`）与 `Cancel`；失败显示可重试错误，不阻塞分账。模型缓存已存在时直接翻译。
- `DishLabel({ id, originalName })`：读取 store，`sourceText` 与当前原文一致时显示译文（`<span lang="zh-Hans">`），否则显示 "Translating…"/"Not translated"/空；不改输入框的值。确认页放在名称输入框下方，分配页放在 `<h2>` 下方。375px 下双语长名换行、无横向溢出。
- 开关关闭：只隐藏译文；分配页同步。
- `BillWizard`：OCR 开始前 `await setOcrBusy(true)`，`finally` 中解除；`reset` 时 `cancelTranslations` + `clearForBill`；挂载后 `purgeExpiredBundles`。

### 3.3 精细识别 `src/lib/ocr/paddle/`

- `spatial.ts`：`spatialRows(items: { poly: [x,y][]; text: string; score: number }[]) → { lines: { text; bbox; confidence }[]; text: string; estimatedAngleDeg: number; meanScore: number }`。算法沿用 9/28 实验：对含字母且宽度 > 3×高度的框取多边形首边角度的中位数作为行倾角；按该角度旋转所有框；按中心 y 分组（阈值 0.55 × 组内最大行高，就近归组）；组内按 x 排序拼接文本（空格分隔）；行按 y 排序。纯函数，带夹具单测（9/28 的 `results/ocr.json` 里 PaddleOCR 原始框作为夹具）。
- `adapter.ts`：`createPaddleWorker(deps) → OcrWorker`，实现现有 `{ recognize(image: Blob) → { data: { text, confidence } }, terminate() }`。`recognize`：`await sdk.predict(image)` → `spatialRows` → `text` 为行文本，`confidence` 为平均 score × 100。`terminate`：`sdk.dispose()`，中止进行中的请求。进度通过 logger 报告 `"Downloading precise recognition model"`（含字节）、`"Starting precise recognition"`、`"Recognizing (precise)"`。
- `factory.ts`：`createPrecisePaddleFactory()`：`ensureBundle("ocr-precise")` → 动态 `import("@paddleocr/paddleocr-js")` → `PaddleOCR.create({ textDetectionModelName: "PP-OCRv5_mobile_det", textRecognitionModelName: "PP-OCRv5_mobile_rec", textDetectionModelAsset: { url: handle.url("PP-OCRv5_mobile_det_onnx_infer.tar") }, textRecognitionModelAsset: { url: handle.url("PP-OCRv5_mobile_rec_onnx_infer.tar") }, fetch: handle.fetch, worker: { createWorker: () => new Worker(handle.url("runtime/worker-entry.js"), { type: "module" }) }, ortOptions: { backend: "wasm", wasmPaths: handle.url("runtime/ort/"), numThreads: 1 } })`。SDK 主线程模块只在精细模式下动态加载，不进入首屏 bundle。
- `client.ts`：`recognizeReceipt(image, { signal, onProgress, engine?: "standard" | "precise" })`，默认 `standard`；`createReceiptRecognizer` 改为接受 `(engine) → factory`。120 秒预算、取消、worker 终止、迟到结果丢弃的现有逻辑不变。
- 引擎选择持久化：localStorage `bitesplit-ocr-engine`。
- UI：`PhotoAdjustment` 的确认区增加分段选择 `Recognition engine: Standard (fast) / Precise (first use downloads ~35 MB)`；确认按钮文案随之变化；`BillWizard.recognizePrepared(image, file, engine)`。`HomeStep` 的下载进度框沿用 `stage`/`progress`。精细模式失败或超时后，错误文案提示 "Try the standard engine or enter items manually"。

### 3.4 首页 "Offline data"

`HomeStep` 底部一个折叠小节：列出两个 bundle 的名称、版本、大小与状态（`Not downloaded` / `Downloaded · 57 MB`），每行 `Remove` 按钮（`removeBundle` + 翻译缓存清理），说明文案："Models are stored in this browser only. iOS may also remove them after 7 days without use."

### 3.5 资源准备脚本 `scripts/prepare-model-assets.mjs`

- 来源表（固定）：
  - `translate-enzh` v`2.2-b0.6.0`：4 个模型文件来自 `https://firefox-settings-attachments.cdn.mozilla.net/main-workspace/translations-models/<location>`（Remote Settings 记录 2025-09-18，sha256 见本文 §2）；wasm 来自 `.../translations-wasm/05082c31-aee8-4249-9e01-c1865afd7520.wasm`（sha256 `a3a89d9a…`）；`bergamot-translator.js`、`translator-worker.js` 来自仓库 `vendor/bergamot/`。
  - `ocr-precise` v`ppocrv5m-sdk0.4.2`：`PP-OCRv5_mobile_det_onnx_infer.tar`、`PP-OCRv5_mobile_rec_onnx_infer.tar` 来自 `https://paddle-model-ecology.bj.bcebos.com/paddlex/official_inference_model/paddle3.0.0/`（首次执行时记录 sha256 并固定进脚本）；`runtime/worker-entry.js` 来自 `node_modules/@paddleocr/paddleocr-js/dist/assets/`（版本校验 0.4.2）；`runtime/ort/*.wasm|*.mjs` 来自 `node_modules/onnxruntime-web/dist/`（版本校验，仅复制 wasm 单线程 SIMD 所需文件）。
- 下载到 `.model-assets-cache/`（gitignore），校验 sha256 后复制到 `public/models/<id>/<version>/`；任何不匹配、缺文件、版本不符都让脚本失败。
- 写 `public/models/manifest.json` 与 `docs/model-assets-manifest.json`；复制许可文件（`MPL-2.0.txt`、PaddleOCR 与 ORT 的 LICENSE）到各 bundle 目录。
- `package.json`：`prepare:models` 脚本；`predev`/`prebuild` 增加该步骤；`.gitignore` 增加 `/public/models/`、`/.model-assets-cache/`。

## 4. 数据流

翻译：确认页开关打开 → store `request(items)` → service：规则/词表立即返回 → 剩余项若 `allowModel`（用户已同意下载或模型已缓存）→ `ensureBundle("translate-enzh")`（进度）→ Worker 初始化 + 载模型 + 预热 → 逐条 `translate` → 结果经 generation/`(id, sourceText)` 校验写入 store 与译文缓存 → `DishLabel` 渲染。改名 → `invalidate(id)` → 该项重新走流水线。OCR 开始 → `setOcrBusy(true)` 释放引擎 → OCR 结束 → `setOcrBusy(false)` → 排队请求继续。

精细识别：校正页选择 `Precise` → 确认 → `recognizeReceipt(image, { engine: "precise" })` → `ensureBundle("ocr-precise")`（进度）→ SDK 创建（Worker + ORT + 模型 .tar 经 Cache API）→ `predict` → `spatialRows` → `parseReceiptText` → `setReceiptDraft`（与标准路径完全一致，复用迟到结果保护与编辑确认）。

## 5. 错误处理

- 所有翻译失败（无 SIMD、下载失败、校验失败、Worker 崩溃、超时 90 秒未就绪）→ `status.error` 可重试文案；已有词表译文保留；分账不受影响。
- 资产下载中止：已存文件保留；下次 `ensureBundle` 续用；UI 回到 "Download and translate"。
- 版本升级：manifest 版本变更 → 旧缓存名在 `purgeExpiredBundles` 时删除；译文缓存 `revision` 不同 → 条目失效。
- 精细识别失败 → 现有错误通道（重试 / 标准引擎 / 手动录入）；SDK 初始化超时计入 120 秒预算。
- 译文内容按 React 文本渲染，不渲染 HTML；长度上限 200 字符。
- 网络：只允许同源 `/models/*` 请求；任何携带菜名的出站请求都不存在（浏览器测试断言）。

## 6. 测试

- Vitest（`src/**/*.test.ts`）：`normalize/protect/modifierRules/expandAbbreviations/glossary/pipeline`（含 50 条语料中的否定、数量、缩写、歧义保留断言；模型函数用替身）；`service`（排队、OCR busy、取消、过期结果、同名去重、上限）；`cache`（TTL、LRU、损坏 JSON、配额错误）；`model-assets/bundles`（假 `caches`/`localStorage`/`fetch`：首次下载、续用、校验失败、删除、到期、版本切换、进度字节）；`bergamot-client` 与 `paddle/adapter`（假 Worker/假 SDK 协议、终止、迟到消息）；`spatial`（9/28 夹具：6 行菜名与价格重建、倾斜、空输入）。
- Playwright 生产构建（`tests/e2e/`，沿用 375px）：`dish-translation.spec.ts`（开关前无 `/models/` 请求；词表项即时显示；下载面板 → 真实 bergamot 模型翻译 → 断言 0 个外部请求；改名后旧译文消失；关闭开关隐藏；首页 Offline data 删除后 `caches.keys()` 不含 `cm-models-translate-enzh`，再次打开需重新下载；下载中取消恢复可操作）；`precise-ocr.spec.ts`（校正页选 Precise → 真实 PaddleOCR 识别 `clear-diner.png` 得到 3 行正确菜品与税/总额；Line Thai 夹具 6 行金额正确；取消下载；失败回退）。
- 质量记录：`scripts/translation-quality.mjs` 用 Playwright 在生产构建上把 `.private/.../cases.json` 的 50 条与新写的 20 条留出语料（`tests/fixtures/translations/en-zh-holdout.json`）跑过组合流水线，输出 `docs/validation/v3-translation-quality.md`（逐条结果、provider、与可接受译法的精确匹配率）；确定性断言：否定/数量/数字保留的用例必须全部通过。
- 常规：`npm run lint`、`npm test`、`npm run build`、`tsc --noEmit`、`E2E_PRODUCTION=1 npm run test:e2e`。

## 7. 风险与应对

| 风险 | 应对 |
| --- | --- |
| PaddleOCR 初始化耗时波动（9/28 见 6 s 与 152 s） | 实施第一项先复测 10 次并记录；超过 120 秒预算按失败处理并提示换标准引擎；波动不收敛则在 UI 标注 "experimental" |
| bergamot 在 iOS Safari 未验证 | 能力探测 + 失败降级为词表/规则；文档明确"桌面验证，真机待测" |
| Vercel CLI 上传 100 MB 限制 | `public/models` 在构建阶段生成，不随源文件上传；本轮不部署 |
| 第三方 CDN 变更导致 prepare 失败 | sha256 固定 + 本地缓存目录；失败即构建失败，不静默跳过 |
| 模型质量仍不达 90% | 词表与规则覆盖高频项；译文标为机器参考；质量记录如实披露 |

## 8. 许可与署名

- Firefox Translations 模型与 bergamot-translator：MPL-2.0；随 bundle 附 `MPL-2.0.txt` 与来源说明（Mozilla `translations-models`、`mozilla/translations`），`vendor/bergamot/VENDOR.md` 记录胶水文件来源与版本。
- PaddleOCR 模型与 `@paddleocr/paddleocr-js`：Apache-2.0；onnxruntime-web：MIT；随 bundle 附 LICENSE。
- README 增加 "Local models" 小节：功能、下载大小、存储位置、如何删除、许可。
