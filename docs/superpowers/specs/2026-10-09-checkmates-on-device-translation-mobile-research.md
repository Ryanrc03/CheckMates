# CheckMates：手机端本地翻译（Transformers.js / 小模型）调研与实测报告

日期：2026-10-09（实验目录建于 2026-10-08）。状态：**调研与桌面实测完成，未接入应用，未在真机验证。** 本文供 review，作为 V3 "一键中文菜名" 的选型、体积预算与试点排期依据。2026-10-09 用户决定：按 Firefox Translations（Bergamot）方案开发，并同期新增 PaddleOCR 精细识别模式；设计另见同日设计文档。

> 回答三个问题：① 前端用 Transformers.js 或小模型在手机网页里做英→简中翻译怎么做；② 在一台 iPhone 17 上会占多少空间；③ 关闭页面后能否清除。所有耗时、内存数字来自 i7-12700 桌面 Chromium 145，**不是手机数字**；手机侧结论来自 WebKit / Apple 一手资料，须在真机复核。上一轮结论见 [2026-09-28 本地推理调研](2026-09-28-checkmates-local-inference-research.md)。

## 0. 结论摘要

1. **技术上可行，但没有一个"又小又准"的现成模型。** Transformers.js 4.3.1 跑 ONNX 翻译模型、bergamot-translator 跑 Marian 模型的链路都已在桌面跑通；iOS 26 Safari 自带 WASM SIMD，WebGPU 已默认开启。质量上：Mozilla Firefox Translations 的 en→zh 模型（约 52 MB，MPL-2.0）在 50 条小票短语上正确 17 条、可接受 5 条、严重错译 3 条，是所有候选中最好的，但模型单独使用仍不达标；`opus-mt-en-zh`（119.5 MB）正确 7 条；0.5B 级小 LLM 正确 8–10 条且严重错译 6–13 条，还会编造食材；Gemma 3 270M 一条也没翻对。
2. **空间：按方案 52–146 MB，用户看得见、我们删得掉。** Transformers.js + opus-mt q8 在 Cache API 实测占 146.4 MB（模型 119.5 MB + 4.x 新增一并缓存的 26.9 MB ORT 运行时）；Firefox Translations 方案 51.9 MB 模型 + 5.0 MB WASM（传输时 gzip 约 38 MB）。iOS 单站点配额上限是磁盘的 60%，不会触发额度弹窗；用户可在 设置 › App › Safari › 高级 › 网站数据 中看到并删除。
3. **关闭页面不会自动清除，也不能把"关页即清"当承诺。** 模型默认进 Cache API，关标签页后仍在；iOS Safari 划掉标签页或杀掉 Safari 时 `pagehide`/`visibilitychange` 不触发（WebKit 明确 "by design"）。桌面 Chromium 实测：`pagehide` 里的 `caches.delete()` 在关闭标签页时能完成，但关闭整个浏览器时不触发；可靠做法是 **不持久化**（关页即释放，但每次重下）或 **持久化 + 显式"删除离线翻译数据"按钮 + 下次打开时按过期时间清理**。Safari 自身还会在"7 个 Safari 使用日内无交互"后清掉脚本可写存储；添加到主屏幕的网页应用除外。
4. **上线建议：V3 试点走"词表/规则优先 + Firefox Translations 兜底"，模型文件同源自托管并带 manifest，试点前必须在真实 iPhone 17 上跑一遍第 9 节清单；不把 opus-mt 或任何小 LLM 放进手机网页。**

## 1. 背景与范围

- 产品：CheckMates（Next.js 16.3.6，Vercel 部署，手机优先）。翻译对象是 OCR 后确认页里的菜品名与修饰语（英文短语，单条 ≤120 字符，每单 ≤50 条），用户点击后触发；原文保留，译文仅作展示，不进入金额计算（见 [V2 设计 §6](2026-09-27-checkmates-v2-design.md)、[翻译计划](../plans/2026-09-27-checkmates-v2-translation.md)）。
- 目标设备：iPhone 17（iOS 26，Safari）为主，Android Chrome 为辅。
- 上一轮（2026-09-28）只测了 `Xenova/opus-mt-en-zh` q8 + Transformers.js 3.8.1，结论是质量不达标、手机未测、体积未精确测量。本轮重点：精确体积与缓存占用、清除机制、更多候选的质量与时延、iOS 约束。

## 2. 方法

### 2.1 统一语料

50 条英文小票短语（`.private/translation-probe-20261008/cases.json`），每条附可接受译法列表与说明，覆盖 13 类：普通菜名、菜系专名（Pad Thai、Pho Tai、Banh Mi）、小票缩写（Chkn Fr Rice、Lg Fries、Sm Coke）、否定修饰（w/o Onion、No Peanuts、No Cilantro）、数量（Fried Tofu (12)、2x Egg Roll）、全大写、小票非菜品行（Service Charge 18%）、中餐英文名回译（Kung Pao Chicken、Mapo Tofu）等。其中 14 条沿用上一轮语料。语料是人工编写的合成样本，不是真实小票抽样。

评分规则（两名独立的 LLM 评审，各自打分，不是母语人工评审）：**correct**（等价于可接受译法）、**acceptable**（中文读者能可靠理解，措辞略生硬，如"牛奶茶"；若可接受列表含英文原名，保留原名也算）、**wrong**（错菜、无意义音译、乱码、未译）、**critical**（否定/数量/数字丢失或反转、编造食材，可能导致点错单）。所有评分针对**逐条调用**的输出。

### 2.2 测量工具链

- `harness/`（Transformers.js 路线）：Node 静态服务器 + Hugging Face 缓存代理（同源 `/hf/...`，精确 Content-Length，`Cache-Control: no-store` 以排除 HTTP 缓存，COOP/COEP 头以启用 `performance.measureUserAgentSpecificMemory()`）；Playwright 1.58.2 驱动完整版 headless Chromium 145；固定流程：冷加载 → 逐条翻译 → 整批翻译 → 热重载（统计网络请求数）→ `caches.delete()` 后重载 → 关闭缓存模式。渲染进程内存用 CDP 取 pid 后读 Windows WorkingSet64。
- `bergamot/`（Firefox Translations 路线）：同样的服务器与流程，运行时分别用 npm 包 `@browsermt/bergamot-translator` 0.4.9（2022）和 Firefox 自带的 bergamot-translator v0.6.0 wasm（2025，Mozilla Remote Settings 分发）+ mozilla-central 的胶水代码。
- Transformers.js **4.3.1**（2026-10-06 发布；上一轮为 3.8.1），内置 onnxruntime-web 1.31.0-dev.20260914（注意是 dev 构建）；WASM 单线程为基准（对应 iOS Safari 不设 COOP/COEP 的默认情况），另测 4 线程与 WebGPU（本机 NVIDIA Ampere）。
- 桌面 ≠ 手机：本机单核性能与 A19 同量级但不相同，WASM 引擎（V8 vs JavaScriptCore）、GPU（NVIDIA vs Apple GPU）、内存策略均不同。"冷加载"时间是回环网络下的解析/初始化时间，**不含真实下载时间**；下载时间请用字节数除以目标带宽估算。多个实验曾并行运行，耗时数字受 CPU 争用影响，只能当量级看（第 7 节）。

## 3. 实测结果

### 3.1 下载体积与缓存占用

| 方案 | 首次需下载 | 其中模型文件 | 其中运行时 | Cache API 实测占用 | 来源 |
| --- | --- | --- | --- | --- | --- |
| bergamot WASM + Firefox Translations `enzh` base-memory v2.2 | **57.2 MB**（传输 gzip 约 39.6 MB） | 51,934,991 B（model.enzh.intgemm.alphas.bin 43.85 MB + 两个 .spm 1.58 MB + lex 6.51 MB） | 5,065,551 B（Firefox v0.6.0 wasm 4.96 MB + 胶水 JS）或 5,271,959 B（npm 0.4.9） | **51,937,228 B**（由应用自建的 Cache API 层；运行时本身不持久化任何东西） | `results/firefox-translations-enzh*.json` |
| Transformers.js 4.3.1 + `Xenova/opus-mt-en-zh` q8（WASM） | **146.4 MB** + 0.6 MB 库 JS | 119,495,576 B（encoder 52.9 MB、decoder 60.2 MB、tokenizer.json 6.4 MB、3 个配置） | 26,914,834 B（`ort-wasm-simd-threaded.asyncify.wasm` 26.86 MB + .mjs） | **146,415,150 B**（模型 + 运行时都进 `transformers-cache`） | `results/opus-mt-en-zh-q8.json` |
| 同上，改用 3.x 时代的"纯 WASM"运行时（`ort-wasm-simd-threaded.wasm`） | 129.5 MB | 同上（tokenizer.json 压缩后 2.1 MB） | 14,289,219 B | 129,538,887 B；4.3.1 能加载，10 条逐条时延与 asyncify 版无差别 | `results/opus-mt-en-zh-q8-langtoken-wasmplain.json` |
| Transformers.js + `onnx-community/Qwen3-0.6B-ONNX` q4f16 | 605.8 MB | 578,918,281 B（单个 569.8 MB 的 onnx + tokenizer 9.1 MB） | 26.9 MB | 605,840,384 B（仅 3 次运行中的 1 次写入成功，其余两次单文件 `cache.put()` 静默失败，只存了 36 MB） | `results/qwen3-0.6b-q4f16*.json` |
| Transformers.js + `onnx-community/Qwen2.5-0.5B-Instruct` q4f16 | 517.0 MB | 490,044,024 B | 26.9 MB | 516,966,400 B（持久化 profile） | `results/qwen2.5-0.5b-instruct-q4f16.json` |
| Transformers.js + `onnx-community/gemma-3-270m-it-ONNX` q4f16 | 307.6 MB | 293,284,073 B（含 20.3 MB tokenizer） | 14.3 MB（asyncify 运行时缺少该 q4 导出所需的 CPU 算子，WASM 路径只能用纯 WASM 构建） | 307,581,696 B | `results/gemma-3-270m-it-q4f16.json` |

要点：

- Transformers.js 4.x 默认运行时换成 26.9 MB 的 asyncify 版 WASM（同时支持 WASM 与 WebGPU），比 3.x 的 14.3 MB 版大 12.6 MB；新选项 `env.useWasmCache`（默认开）把这份 WASM 也写进 Cache API，所以"模型 113 MiB"在手机上的真实落盘是 **146 MB**。4.3.0 起 iOS 26+ 的 Safari 会拿到这份 asyncify 构建；它在桌面上的渲染进程内存比纯 WASM 构建高约 200 MB（827 vs 631 MB）。
- 4.x 的 `pipeline()` 会先对每个文件发 `Range: bytes=0-0` 探测请求（用于进度总量），自托管服务器必须正确回 206；Vercel 静态文件实测支持 206，但 Range 请求走源站而不是边缘缓存（R4）。
- Chromium 的 Cache API 对单个条目有实际上限：128/256/384 MB 的缓冲写入成功，512 MB 与 600 MB 失败（"Unexpected internal error"），600 MB 以流式写入成功但耗时 21 秒（`results/cache-put-check.json`）；临时上下文更低（约 150–300 MB）。Transformers.js 把每个文件存成一个条目，所以 >400 MB 的单文件模型在 Chromium 上不可靠；Safari 的上限未测。
- `q4f16` 并不比 `q8` 小：opus-mt 的 q4f16 为 152.7 MiB（65k 词表的 embedding 占大头）。opus 的 `langtoken` 变体报告 115.2 MB 只是因为补丁 tokenizer.json 是压缩格式（2.1 MB vs 原版 6.4 MB），模型没有变小；交付时压缩 tokenizer.json 即可省这 4.3 MB。

### 3.2 冷/热启动、清除验证、关缓存模式（桌面 Chromium）

opus-mt q8（`results/opus-mt-en-zh-q8.json`）：

| 阶段 | 结果 |
| --- | --- |
| 冷加载（文件已在本机代理，回环网络） | 就绪 1,357 ms；13 个请求 |
| 热重载（Cache API 命中） | 就绪 1,780 ms；**模型请求数 0** |
| `for (k of caches.keys()) caches.delete(k)` | `caches.keys()` 立即为空；重载后重新拉取 11 个模型文件（114 MB）+ 2 个运行时文件，就绪 3,502 ms |
| 关闭缓存模式（`env.useBrowserCache=false`，新上下文） | 存储占用 0 → 0 字节；13 个文件再次从网络获取 |

Firefox Translations（`results/firefox-translations-enzh.json`）：冷加载 947 ms（WASM 初始化 32 ms、49.5 MB 回环拉取 827 ms、载入模型 88 ms；首次 `translate()` 另有约 235 ms 一次性预热），热重载 147 ms 且网络请求 0，`caches.delete()` 后重载重新拉取 4 个文件 49.5 MB。

"关页清除"专项（`results/clear-on-close.json`，Transformers.js + opus-mt，Chromium 145）：

| 场景 | 结果 |
| --- | --- |
| A 关闭标签页，无处理器 | 146,415,150 B 保留 |
| B `pagehide` 里 `caches.delete()`，关闭标签页 | 处理器执行且完成；2 ms 后 `caches.keys()` 为空，新页面读到 0；下次加载重新下载 6 个模型文件 |
| C 全新浏览器上下文 | 读到 0（存储按 profile 隔离） |
| D1 持久化 profile，无处理器，退出浏览器再启动 | 146,418,688 B 保留；重载 0 次网络请求，就绪 1,810 ms |
| D2 持久化 profile，有处理器，**页面打开时退出浏览器** | `pagehide` 没有触发，数据保留 |
| E 下次打开时按过期时间清理 | 35 ms 完成，占用 0，重新下载 |
| F "删除"按钮 | 6 ms 完成，`caches.keys()` 为空；但 `navigator.storage.estimate()` 在同一文档和 3 秒后的新文档里仍报告 146,415,150 B，删除中的文档关闭后才归零 |
| G `env.useBrowserCache=false` | 存储始终 0；同一页面第二次 `pipeline()` 仍重新下载（823 ms vs 首次 1,482 ms），4.3.1 只去重并发中的下载，没有内存级缓存 |

结论：`storage.estimate()` 不能当"已清除"的依据，以 `caches.keys()` 和重新下载计数为准；关闭整个浏览器时 `pagehide` 不可靠，iOS 上更不可靠（第 4.2 节），必须有"下次打开时清理"兜底；不持久化模式下必须让 Worker 里的 pipeline 实例常驻，否则每次翻译都重下。

### 3.3 内存（桌面 Chromium 渲染进程 WorkingSet，非手机）

| 候选 / 路径 | 加载前 | 加载后峰值 | 稳定后 | 翻译 50 条后 | `dispose()` 后 | `measureUserAgentSpecificMemory` |
| --- | --- | --- | --- | --- | --- | --- |
| Firefox Translations，npm 0.4.9 构建 | 57 MB | 220 MB | 220 MB | 624 MB（首次翻译即跳到 596 MB：Marian 工作区一次性分配，不回收） | 95 MB | 72 MB → 696 MB |
| Firefox Translations，Firefox v0.6.0 构建 | 60 MB | 225 MB | 225 MB | 411 MB（首次翻译后 400 MB） | 100 MB | 76 MB → 336 MB |
| opus-mt q8，WASM 1 线程（asyncify） | 67 MB | 868 MB | 697 MB | 686 MB | 686 MB（未强制 GC） | 400 MB |
| opus-mt q8，WASM 1 线程（纯 WASM 构建） | 66 MB | 631 MB | 631 MB | 631 MB | 631 MB | 387 MB |
| opus-mt q8，WebGPU | 65 MB | 860 MB（另 GPU 进程 235 MB） | 690 MB | 570 MB | 571 MB | 327 MB |
| opus-mt fp16，WebGPU | 65 MB | 1,165 MB（另 GPU 进程 413 MB） | 1,165 MB | 920 MB | 920 MB | 570 MB |
| Qwen2.5-0.5B q4f16，WASM 1/4 线程 | 67 MB | 3,592 / 3,101 MB | — / 2,958 MB | 3,015 / 4,144 MB | 3,015 / 4,117 MB | 2,820 / 2,301 MB |
| Qwen3-0.6B q4f16，WASM 1/4 线程 | 65 MB | 2,959 / 3,601 MB | 2,808 / 3,395 MB | 2,833 / 1,840 MB | 2,833 / 1,843 MB | 2,639 / 2,639 MB |
| Gemma 3 270M q4f16，WASM 1/4 线程 | 65 MB | 958 / 947 MB | 873 / 947 MB | 1,190 / 1,692 MB | 1,191 / 1,639 MB | 411 / 412 MB |

WebGPU 路径下 LLM 的权重在 GPU 进程里（Qwen2.5 WebGPU：渲染进程 258 MB，但 `measureUserAgentSpecificMemory` 报 3,138 MB），两种指标相差 12 倍，没有一个能单独代表"模型内存"。对照 iOS 侧上限（第 4.3 节）：iPhone 的 WebContent 进程"软上限"约 1.5 GB，iPhone 17 Pro 在 iOS 26 的内核日志显示硬上限 2,048 MB；类型化数组总量上限约 1.88 GB。**Firefox Translations 的 0.2–0.4 GB 余量最大，opus-mt q8 的 0.4–0.9 GB 尚可，Qwen 级 2.3–3.6 GB 在 iPhone 上会被直接杀掉。**

### 3.4 时延（桌面，含首次调用预热；多数运行有 CPU 争用，只看量级）

| 候选 / 路径 | 单条 p50 | 单条 p95 | 首次调用 | 50 条整批 | 说明 |
| --- | --- | --- | --- | --- | --- |
| Firefox Translations，npm 0.4.9 | **12.3 ms** | 19.4 ms | 235 ms | 622 ms | `results/firefox-translations-enzh.json` |
| Firefox Translations，Firefox v0.6.0 构建 | 10.6 ms | 16.7 ms | 183 ms | 605 ms | 输出与 npm 构建逐条一致 |
| Firefox Translations，base 变体 | 23.4 ms | 37.4 ms | 620 ms | 1,192 ms | 输出夹空格、缩写原样保留，质量未评 |
| opus-mt q8，WASM 1 线程 | 146 ms | 257 ms | — | 11,491 ms | 语言 token 正确版 |
| opus-mt q8，WASM 4 线程（COOP/COEP） | 111 ms | 196 ms | — | 5,517 ms | 输出与 1 线程逐条一致；是否真的多线程未验证（R2 认为 asyncify 构建不派生 worker） |
| opus-mt q8，WebGPU | 1,254 ms | 2,200 ms | — | 16,160 ms | 约 8 倍慢于 WASM：小模型逐 token 的 GPU 调度开销占主导；两次运行均有争用 |
| opus-mt fp16，WebGPU | 99 ms | 276 ms | 1,046 ms | 3,194 ms | 最快但下载翻倍（225.5 MB），20/50 条输出与 q8 不同，1 条失控输出 |
| Qwen2.5-0.5B q4f16，WASM 1 / 4 线程 | 4,711 / 1,597 ms | 6,195 / 2,682 ms | — | — | 解码 1.4 / 3.9 token/s |
| Qwen2.5-0.5B，WebGPU（q4；q4f16 在 WebGPU 上数值错误） | 253 ms | 412 ms | 2,177 ms | — | 23 token/s |
| Qwen3-0.6B q4f16，WASM 1 / 4 线程 | 7,015 / 3,197 ms | 9,674 / 4,663 ms | — / 28,495 ms | — | 0.9 / 2.4 token/s |
| Qwen3-0.6B，WebGPU | 127 ms | 163 ms | 944 ms | — | 82 token/s |
| Gemma 3 270M，WASM 1 / 4 线程；WebGPU | 5,285 / 2,340 ms；204 ms | 32,235 / 14,691 ms；965 ms | — | WebGPU 33,202 ms | 9/50 条失控到 token 上限 |

### 3.5 翻译质量（50 条，两名独立评审，逐条调用）

| 候选 | correct | acceptable | wrong | critical | 评审备注 |
| --- | --- | --- | --- | --- | --- |
| **Firefox Translations enzh base-memory** | 17 / 17 | 5 / 5 | 25 / 25 | 3 / 3 | 可用率 44%。常规西式菜名、饮品、修饰语、带数字的行都对（`奶茶`、`芝士汉堡`、`炸薯条`、`凯撒沙拉`、`青咖喱鸡`、`猪肉饺子`、`春卷(2)`、`服务费 18%`、`没有花生`）；缩写（`Chkn Fr Rice → 赖斯神父`、`Lg Fries → 低低 士`）、音译菜名（`Tom Yum → 汤姆·云汤`、`Kung Pao → 功夫鸡`、`Clam Chowder → 蛤蛤蛤`）和中餐英文名几乎全错。critical：`w/o Onion → 洋葱`（否定丢失）、`No Cilantro → 没有香肠`（编造食材）、`Pork Belly Bao → 猪肚宝宝` |
| opus-mt q8（语言 token 正确，= 9/28 同款输出） | 7 / 7 | 8 / 9 | 33 / 32 | 2 / 2 | 可用率约 30%；critical：`w/o Onion → 洋葱`、`Service Charge 18% → 服务收费`（数字丢失）；有对话式幻觉（`Pho Tai → 何泰,你别这样`）与冒犯性输出（`Pork Dumplings → 猪粪垃圾`、`Iced Latte → 冰脱衣舞`） |
| opus-mt q8（stock tokenizer，4.3.1 默认行为） | 4 / 4 | 5 / 5 | 39 / 39 | 2 / 2 | 解码退化成重复字（`奶奶茶茶`、`电电电电`、`鸡鸡 鸡鸡 鸡鸡`） |
| Qwen3-0.6B q4f16 | 8 / 10 | 7 / 5 | 29 / 29 | 6 / 6 | 格式保持好（数字、括号、否定词），但整道菜被替换或凭空加肉：`Pineapple Fried Rice → 菠萝肉炒饭`、`Veg Spr Roll → 蔬菜肉饼`、`Spicy Tuna Roll → 香煎牛排`、`No Cilantro → 无辣椒酱`；10 条常见菜名原样不译；泄漏控制标记 `/no_ingredient` |
| Qwen2.5-0.5B-Instruct q4f16 | 8 / 8 | 7 / 11 | 23 / 18 | 12 / 13 | "自信地编造另一道菜"：`Pineapple Fried Rice → 红烧土豆片`、`French Fries → 大煮豆腐`、`Add Avocado → 加杏仁`、`Buffalo Wings → 大肠粉`、`Mapo Tofu → 炒鸡蛋豆腐` |
| Gemma 3 270M it q4f16 | 0 / 0 | 5 / 5 | 41 / 42 | 4 / 3 | 41–45 条原样回显英文，4 条输出客套话，仅 3 条含汉字且全是乱码；5 条 acceptable 只是因为允许保留原名 |

表中每格为"评审 1 / 评审 2"。另一个实现层面的发现：把 50 条作为一个数组一次调用（库内部做 padding 批量解码）时，输出与逐条调用不同的条数为 Firefox 11/50、opus-mt 24–44/50、Gemma WebGPU 5/50；WebGPU/fp16 路径的输出与 WASM 也有 3–20 条差异。这些整批和 WebGPU 输出**没有评分**。接入时应逐条或小批量调用，并以逐条结果为准；换路径要重评。

Firefox Translations 的失败集中在两类可以用确定性规则覆盖的地方：小票缩写（展开后再翻）和外来菜名音译（词表直出）；否定词需要规则保护而不是交给模型。这与 9/28 "词表优先 + 受控模型候选" 的建议一致。

### 3.6 Transformers.js 4.3.1 下 Marian 语言前缀被切碎（已确认是 4.x 回归）

opus-mt-en-zh 需要在输入前加目标语言 token `>>cmn_Hans<<`。3.8.1 把 `>>cmn_Hans<< Milk Tea` 编码为 `[5, 51477, 53343, 0]`（语言 token 是单个 id 5）；4.3.1 编码为 9 个碎片 `▁> > cm n _ H ans < <` + `▁Milk ▁Tea`（`tok-compare/RESULT.json`）。原因：4.x 的 `PreTrainedTokenizer._encode_plus` 直接调用 `@huggingface/tokenizers` 0.2.0 的 `encode()`，`MarianTokenizer._encode_text` 里剥离 `>>xx<<` 前缀的覆盖逻辑成了死代码；Unigram 对单个语言 token 的分值是 -100（最低分），永远不会选中。结果：带前缀的输出带引号、`=====` 串和 `mmn_Hans` 碎片；去掉前缀则模型不知道目标是简体中文，输出更差。本轮用一份本地补丁 `tokenizer.json`（把 8 个语言 token 加为 special added tokens，`patches/README-langtoken.md`）后，输出与 9/28 的 3.8.1 结果逐条一致。若走 Transformers.js 路线，必须自带修正后的 tokenizer 文件并写进 manifest，或向上游提交修复。

## 4. iPhone 17 / iOS 26 Safari 的约束（调研，含一手来源）

设备与系统：iPhone 17 为 A19，256/512 GB，RAM 8 GB（Apple 不公布，第三方数据）；Pro/Air 12 GB。出厂 iOS 26.0，当前 iOS 26.7.1 / iOS 27.0.1（2026-09-28）。iOS 26 起 UA 字符串冻结为 `Version/26.0`，无法用 UA 区分小版本。

### 4.1 存储：配额、驱逐、可见性

| 项目 | 结论 | 来源 |
| --- | --- | --- |
| 单站点配额 | Safari 17+：每个 origin 最多磁盘的 60%（WKWebView 内 15%），超出抛 `QuotaExceededError`，**不再弹窗**；覆盖 Cache API / IndexedDB / OPFS / localStorage，不含 HTTP 缓存 | [WebKit 存储策略](https://webkit.org/blog/14403/updates-to-storage-policy/) |
| 驱逐 | 磁盘压力或总配额超限时按 origin 整体 LRU 驱逐（最近交互或存储操作计时）；持久化模式或有活动页面的 origin 除外；默认全部 best-effort | 同上 |
| 7 天规则（ITP） | "7 个 Safari 使用日内无用户交互（点击/触摸/键盘，滚动不算）"后删除所有脚本可写存储（列明 IndexedDB、localStorage、Service Worker 注册与缓存；Cache API 未单列但属于同类，视为覆盖）；添加到主屏幕的网页应用其首方域名被跳过 | [WebKit Tracking Prevention](https://webkit.org/tracking-prevention/)、[2020 公告](https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/) |
| `navigator.storage.persist()` | Safari 不弹窗，按启发式（如已加到主屏幕）授予；有多个 bug 报告它在 Safari 17+ 恒为 false。不要依赖它 | [bug 271401](https://bugs.webkit.org/show_bug.cgi?id=271401) |
| 用户可见与删除 | 设置 › App › Safari › 高级 › 网站数据（按站点列出大小，可单独删除）；"清除历史记录与网站数据" 会清除 WebKit `WebsiteDataType` 枚举中的 DOMCache（Cache API）、IndexedDB、HTTP 缓存等（Apple 文档未逐项列出，推断自 WebKit 源码） | [Apple HT201265](https://support.apple.com/en-us/HT201265)、WebKit `WebsiteDataType.h` |
| HTTP 缓存能否代替 | WebKit NetworkCache 无单条大小上限，但总容量按剩余磁盘分级（≥16 GB 剩余时 1 GB，最低 100 MB），全站点共享、概率式收缩；Safari 11+ 支持 `Cache-Control: immutable`。结论：HTTP 缓存只能当"顺手命中"，不能当模型存储 | WebKit `NetworkCache.cpp`、`CacheModel.cpp` |

### 4.2 "关闭页面后清除"为什么不可靠

- 从标签页切换器划掉页面、从 App 切换器杀掉 Safari：`pagehide` / `visibilitychange` / `beforeunload` / `unload` **都不触发**；WebKit 工程师答复"by design"（[bug 199854](https://bugs.webkit.org/show_bug.cgi?id=199854)，2026-01 仍 NEW）。只打开标签页切换器也不触发 `visibilitychange`（bug 205942）。
- 页面退到后台后 JS 只能再跑约 7–8 秒就被冻结（Apple 工程师："very intentional"）。异步的 `caches.delete()` 可能做不完。
- 桌面 Chromium 的专项实验（3.2 节）也表明关闭整个浏览器时 `pagehide` 不触发。因此只有两种可靠做法：(a) 根本不写持久存储；(b) 在**前台、下次打开时**根据记录的时间戳/版本号清理，并提供显式删除按钮。

### 4.3 内存与运行时

| 项目 | 结论 | 来源 |
| --- | --- | --- |
| 单标签页内存上限 | iPhone 上 WebContent 软上限约 1.5 GB（无内存压力时可短暂超过）；iPhone 17 Pro（12 GB）在 iOS 26.3–26.4.1 的内核日志为 `ActiveHard 2048 MB (fatal)`；8 GB 的 iPhone 17 / Air 没有公开数字 | [bug 277848](https://bugs.webkit.org/show_bug.cgi?id=277848)、[开发者论坛 823061](https://developer.apple.com/forums/thread/823061) |
| 类型化数组总量 | Gigacage 约 1.88 GB 上限，2026-09 仍在（bug 324370） | WebKit bugzilla |
| WASM 内存 | wasm32 最多 4 GB（Safari 15.2+）；Memory64 Safari 27.x 仍不支持。2024 年前 iOS 的 WASM 内存在重载后常只剩 300–500 MB（Gigacage 碎片），2024-04 修复 | caniuse、bug 269937/272232 |
| 多线程 | SharedArrayBuffer 需页面带 `COOP: same-origin` + `COEP: require-corp`（Safari 15.2+）；有重载后 OOM 的报告；ORT 在非隔离页面强制单线程。bergamot 构建是单线程、非共享内存，不需要 COOP/COEP，但需要 WASM SIMD（iOS 锁定模式会关闭 SIMD，需探测） | WebKit 15.2 公告、emscripten #19374、bergamot 构建说明 |
| 已知 iOS 问题 | Transformers.js #953/#1242/#1241（iOS 加载中 OOM、页面重启循环）、#1298（Cache API 配额错误）；PR #1250 让 Safari<26 用非 asyncify 构建；4.3.0 起 iOS 26+ 用 WebGPU + asyncify 构建；Safari 26.4 beta 曾因 `ReadableStream` 异步迭代缺失导致所有 Transformers.js 任务失败（需 polyfill，正式版状态待查） | GitHub issues；[PR #1700](https://github.com/huggingface/transformers.js/pull/1700) |
| WebGPU | Safari 26.0 起 iOS 默认开启，WebKit 点名 Transformers.js 可用；`shader-f16` "所有 Apple 设备支持"但需显式请求；iPhone 的 `maxBufferSize` 第三方数据冲突（1 GB vs 256 MB），须真机读取 `adapter.limits` | [WebKit Safari 26.0](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/)、WWDC25 session 236 |
| 内置翻译 API | Safari/WebKit 无 Translator API（标准立场 #339 无回应）；Chrome 的 Translator API 仅桌面（Android 不支持，Worker 内不可用）；Firefox 明确反对。**手机网页没有任何免下载的系统翻译接口** | caniuse、[Chrome 文档](https://developer.chrome.com/docs/ai/translator-api) |
| 下载 | 低数据模式网页无法探测（无 `saveData`）；后台/锁屏后页面 fetch 是否继续无文档，应假设会中断；Transformers.js 没有断点续传，WebKit 对 Range 的缓存按精确 Range 匹配。建议自行分块下载并逐块写入 Cache API | Apple 102433、`NetworkCache.cpp` |

### 4.4 推荐的下载 / 保留 / 清除模式

1. 只在用户点击"翻译为中文"后下载，先显示精确大小（来自 manifest）和"锁屏可能中断"的提示；分块（8–16 MB）Range 下载，每块 `cache.put()`，中断可续。
2. 模型文件放独立缓存名（如 `cm-translate-v<模型版本>`），同时在 localStorage 记 `{modelVersion, bytes, installedAt, lastUsedAt}`。
3. 每次启动与 `visibilitychange→visible` 时在前台检查：过期（建议 14 天；Safari 的 7 天规则对普通网页本来就更严）或版本不匹配 → 先 `caches.delete()` 再加载。不要在 `pagehide` 里做清理。
4. 设置页提供 "已下载翻译模型：57 MB — 删除" 行，大小由 Cache API 条目累加（`navigator.storage.estimate()` 含其它数据且删除后不及时刷新），并提示 iOS 也可在 网站数据 中删除。
5. 把缓存当作随时可能消失的东西：命中失败就回到下载提示，不报错。
6. 模型跑在 Web Worker 里；账单关闭即释放，不让空闲标签页占着 1.5–2 GB 预算。

## 5. 候选模型全景（体积来自 HF / GitHub / Mozilla API 的精确字节数）

| 候选 | 参数 | 浏览器运行时 | 下载（MiB） | 许可 | 公开 EN→ZH 质量 | 本轮实测 / 评价 |
| --- | --- | --- | --- | --- | --- | --- |
| Mozilla Firefox Translations `enzh` base-memory v2.2 | 43.5M | bergamot-translator WASM（CPU，SIMD，单线程） | 49.53（gzip 36.0）+ wasm 4.7–5.0 | MPL-2.0 | Flores-test COMET **0.863** / BLEU 38.8（Mozilla 评测，同一评测中 Google 0.895、OPUS 0.824、NLLB 0.818；模型自带 metadata 记的是 flores-dev 0.8595 / 37.9） | 17 正确 / 5 可接受 / 3 critical；12 ms/条；内存 0.2–0.7 GB。无官方 npm（最后 `@browsermt/bergamot-translator` 0.4.9 为 2022 年；Firefox 自带 v0.6.0 构建只经 Remote Settings 分发）；GitHub LFS 模型对象已下线（410），只能从 Mozilla Remote Settings CDN 取；iOS 可运行为间接证据（Firefox iOS 146 内置、WebKit SIMD bug 已修） |
| Helsinki-NLP / Xenova `opus-mt-en-zh` q8 | 77M | Transformers.js | 113.96 | Apache-2.0 | Flores COMET 0.824 / BLEU 32.2 | 7 正确 / 2 critical；146 ms/条；需补丁 tokenizer。HF 上没有更大的 tc-big EN→ZH ONNX，需自行用 Optimum 转换（预计 250–300 MiB，Tatoeba 仅 +3 BLEU） |
| `Qwen3-0.6B` q4f16 | 0.6B | Transformers.js / WebLLM | 552（WebLLM 331） | Apache-2.0 | 无 MT 指标 | 8–10 正确 / 6 critical；WASM 单线程 7 s/条，内存 2.8–3.6 GB；570 MB 单文件在 Chromium Cache API 里写入不稳定 |
| `Qwen2.5-0.5B-Instruct` q4f16 | 0.49B | Transformers.js / WebLLM | 467（WebLLM 272） | Apache-2.0 | 无 | 8 正确 / 12–13 critical（编造菜品）；4.7 s/条；内存 3.0–3.6 GB |
| `gemma-3-270m-it` q4f16 | 268M | Transformers.js / MediaPipe | 280 | Gemma Terms | 无 | 0 正确；多数原样回显英文 |
| NiuTrans `LMT-60-0.6B` | 0.75B | 无 ONNX 导出（需 Optimum） | 预计约 552 | Apache-2.0 | 中英为中心的 MT 微调（ACL 2026） | 未测；0.6B 级里最值得导出验证的 MT 专用模型，但体积与内存问题同 Qwen3 |
| LiquidAI `LFM2.5-350M` | 350M | Transformers.js | 246 | LFM Open License | 无中文 MT 变体 | 未测 |
| Tencent `HY-MT1.5-1.8B` ONNX q4f16 | 1.8B | Transformers.js（需 WebGPU） | 1,178 | 腾讯社区许可（不适用于欧盟/英国/韩国） | 论文称约为 Gemini 3 Pro 的 90% | 质量天花板参考；体积超出手机网页 |
| Tencent `Hy-MT2-1.8B` | 2.04B | 无浏览器导出 | GGUF 1,081 / 1.25-bit 440 | Apache-2.0 | 论文称超过商业 API | 2026 年质量/体积最好的开源 MT，等社区 ONNX 导出 |
| NLLB-200-distilled-600M | 615M | Transformers.js | 870 | **CC-BY-NC-4.0** | COMET 0.818 | 非商用，排除 |
| M2M100-418M / MADLAD-400-3B / TranslateGemma-4B | — | — | 610 / 3,059 / 2,609 | 各异 | — | 体积排除 |

平台接口：Chrome Translator API 仅桌面（Chrome 138+，Android 明确不支持）；Safari、Firefox 无；Edge 148 桌面有。手机网页没有免下载方案。

## 6. 托管、带宽与许可

- **Vercel**：`/public` 没有文档化的单文件上限（CLI 上传源文件 Hobby 100 MB / Pro 1 GB，构建产物另算）；`/public` 默认 `Cache-Control: public, max-age=0, must-revalidate`（线上 `/ocr/*` 已验证），可用 `next.config.ts` 的 `headers()` 改为 `immutable` 并加 CORS/COEP 头；Range 请求返回 206 但走源站；>10 MB 静态文件是否进边缘缓存未验证（线上最大只测过 2.87 MB）。流量：Hobby 每月 100 GB（仅限非商业）≈ 1,900 次 57 MB 冷下载或 885 次 146 MB 冷下载；Pro 含 1 TB，但 Flat Rate CDN 条款明确排除"大文件分发占带宽主体"的用法，是真实风险。
- **替代托管**：Hugging Face 直链有 CORS、支持 Range、可按 commit 固定版本，匿名每 5 分钟 3,000 次/IP，无 `Timing-Allow-Origin`；Cloudflare R2 出站免费、10 GB 存储免费，1 万用户/月几乎 0 成本；GitHub Releases **无 CORS**，不可用；jsDelivr 单文件 20 MB 上限；Mozilla 的模型 CDN 没有对第三方站点的使用承诺，不能当生产源。建议：Vercel 同源自托管（经 prepare 脚本从固定 URL 下载并校验 SHA-256，像 OCR 资产一样生成 manifest），流量超预算再切 R2。
- **许可**：Firefox Translations 模型与 bergamot 运行时 MPL-2.0（文件级 copyleft，附许可与来源链接即可，应用本身可自有协议）；opus-mt Apache-2.0（量化转换需注明修改）；Qwen3 / Qwen2.5-0.5B Apache-2.0；Gemma 3 需随附 Gemma Terms 与禁用条款（Gemma 4 已改 Apache-2.0）；NLLB 非商用。

## 7. 数据可信度与局限（完整性审查结论）

1. **全部是桌面数字。** 没有任何 iPhone 17 / iOS 26 / Android Chrome 的测量：加载成功率、下载时间、单条时延、峰值内存与 1.5–2 GB 上限的关系、Cache API 写入 44–57 MB 文件、设置里显示的大小、ITP 清除、锁屏中断、WebGPU 限制，全部待真机。
2. **耗时受争用影响。** 多路实验并行，相同配置的冷加载相差可达 3 倍（1,374 vs 5,831 ms），opus WebGPU 的"8 倍慢"没有无争用的对照；首次调用比中位数慢 7–27 倍且不计入 p95；整批调用的耗时不可用。4 线程的提速是否真是多线程效果未验证。
3. **质量评分的边界。** 评审是 LLM 而非母语人工；语料是合成的 50 条；评分只针对逐条调用；整批与 WebGPU/fp16 路径的输出未评；"词表 + 规则 + 模型"的组合流水线从未评过，而它才是拟上线的形态。
4. **存储数字的边界。** `storage.estimate()` 在删除后不及时刷新（第 3.2 节 F）；`results/opus-mt-en-zh-q8.json` 里 `afterCachesDelete` 仍是旧值，以 `caches.keys()` 与重新下载计数为准；代理强制 `no-store`，HTTP 缓存是否双份未观察；Chromium 对 ≥512 MB 单条目写入失败且不确定；Safari 的行为未测。
5. **工程细节。** Transformers.js 4.3.1 内置的是 ORT 1.31.0-dev 构建；Marian 语言前缀在 4.x 需补丁；asyncify 构建缺少 Gemma q4 导出的 CPU 算子；opus `langtoken` 的 115.2 MB 只是 tokenizer 压缩的序列化差异。bergamot 路线没有维护中的 npm 包，模型与运行时只能从 Mozilla CDN 固定 sha256 自取。

## 8. 结论与建议

1. **不要把通用小 LLM 放进手机网页做翻译。** 下载 300–600 MB、单线程 WASM 每句 5–7 秒、内存 2.3–3.6 GB 三项任一都足以否决；WebGPU 能把时延压到 0.1–0.3 秒，但解决不了下载体积、Cache API 单条目上限和编造食材的问题。
2. **opus-mt-en-zh 维持"不达标"结论**，且在 Transformers.js 4.3.1 下还要额外修 tokenizer。它在每个维度都被 Firefox Translations 压过。
3. **Firefox Translations enzh（base-memory）是唯一值得进入 V3 试点的本地模型**：57 MB、12 ms/条、内存 0.2–0.4 GB（用 Firefox v0.6.0 构建）、44% 单模型可用率、MPL-2.0。但 3 条 critical 中有 2 条是否定/食材类，所以否定与数量必须走规则，缩写展开与高频菜名词表必须先于模型。
4. **词表优先**依然是最大的质量杠杆（Pad Thai、No/w/o/Extra、Lg/Sm、Combo 等高频 token），任何模型都只处理词表未命中的部分；输出标为"机器参考译文"。
5. 空间与清除的产品承诺可以这样写："首次使用需下载约 57 MB，可随时在设置中删除；14 天不用自动清理。"不要承诺"关闭页面即清除"。

## 9. 下一步：V3 试点上线前清单

1. **真机验证（iPhone 17 / iOS 26.x Safari，Android Chrome 各一台）**：冷下载时间（Wi-Fi 与蜂窝）、锁屏中断是否可续、`caches` 与 设置 › 网站数据 显示的大小、热启动时间、50 条时延 P95（含首次调用）、连续翻译 5 轮是否被杀（Safari 崩溃/重载）、WASM SIMD 可用性（锁定模式）、添加到主屏幕后 7 天规则是否不同。门槛：能加载、不崩、单句 P95 低于 1 秒；过不了只发布词表版本。
2. **词表 + 规则层**：高频菜名/饮品/修饰语词表、缩写展开（Chkn/Ndl/Lg/Sm/w/o）、否定与数量保护；用"词表 → 规则 → 模型"的组合在这 50 条加 20 条留出集上重新评分，目标可用 ≥90%、critical 为 0。
3. **模型交付**：固定 Mozilla Remote Settings 的 enzh v2.2 模型（sha256 `4e5accc1…`）与 Firefox 自带 bergamot v0.6.0 wasm（sha256 `a3a89d9a…`），prepare 脚本下载 + 校验 + 写 manifest（含许可），复制到 `public/`；Cache API 按版本号命名，14 天过期在下次打开时清理，设置页加"删除离线翻译数据"按钮，分块下载可续传。
4. **接入方式**（遵循已有翻译计划的 provider 合同）：Web Worker 内单例引擎；OCR 忙时排队，账单关闭即释放；逐条调用；原文始终可见；修改 Next.js 代码前按 AGENTS.md 读 `node_modules/next/dist/docs/`（本轮已查 headers / public-folder / turbopack 文档：`headers()` 可为 `/public` 路径设 `Cache-Control`，Turbopack 支持 `new Worker(new URL(...))`）。
5. **质量门槛沿用 V2 设计**：留出集语义可用 ≥90%，否定/数量/编造食材错误为 0，否则只发布词表版本。
6. **带宽预算**：按预期月活估算冷下载次数，超过 Hobby 100 GB 或接近 Vercel 文件分发条款时切换到 R2。
7. 完成真机记录后再写性能承诺与 README 限制说明，走 Vercel 预览 → review → 发布。

## 10. 实验记录与复现

所有实验在被 Git 忽略的 `.private/translation-probe-20261008/`：

- `cases.json`（50 条语料）、`RESULT-SCHEMA.md`（结果文件格式）。
- `harness/`：Transformers.js 路线的 `server.mjs`、`probe.html`、`run.mjs`、`clear-on-close.mjs`、`README.md`（全部 CLI 参数与注意事项）；`prompts/` 为 LLM 候选的提示模板；`logs/` 为每次运行的输出。
- `bergamot/`：Firefox Translations 路线的服务器、页面、runner、Firefox v0.6.0 构建的 worker 适配（`fx-worker.js`）、`vendor/`（npm 0.4.9 包、GitHub release、Firefox Remote Settings wasm 与 mozilla-central 胶水源码）、`models/`（base-memory 与 base 两套模型文件，已校验 sha256）、`meta/`（Remote Settings 记录、评测分数、许可）。
- `results/`：每个候选一份 `<slug>.json` + `<slug>.server-log.json`；`clear-on-close.json`、`cache-put-check.json`、`webgpu-check.json`、`r3-model-survey.json`；带 `.run1-contended` 后缀的是有争用的首次运行。
- `tok-compare/RESULT.json`：3.8.1 与 4.3.1 的分词对照。
- `research/`：四路调研的原始 JSON（iOS 约束、Transformers.js 4.3.1 与 Next.js 文档、模型全景、托管/原生/云端）。
- `model-cache/`：代理下载的模型文件（含 `langtoken` 本地伪 revision）；`patches/README-langtoken.md`。

复现（在实验目录）：

```powershell
node harness/run.mjs --model Xenova/opus-mt-en-zh --dtype q8 --device wasm --threads 1 --port 3301 --task translation --slug opus-mt-en-zh-q8-langtoken --revision langtoken --src-prefix ">>cmn_Hans<< " --channel chromium
node bergamot/run.mjs --variant base-memory --runtime firefox --channel chromium --slug firefox-translations-enzh-fxwasm
node harness/clear-on-close.mjs
```

依赖：`@huggingface/transformers@4.3.1`（内置 onnxruntime-web 1.31.0-dev.20260914）、`@browsermt/bergamot-translator@0.4.9`、Firefox bergamot-translator v0.6.0（Remote Settings `translations-wasm`，sha256 `a3a89d9ad0a4ed8f27bf3e403701b23f5709816f6376438503f2fa5b0182c2dc`）、Playwright 1.58.2 / Chromium 145.0.7632.6、Node 24.12。模型版本：`Xenova/opus-mt-en-zh@046f55aec303cdee3e0318604406d4df20f1e8ea`、`onnx-community/Qwen3-0.6B-ONNX@1e0a4a196ecabdf9a879664110574563d3f372d3`、Mozilla `translations-models` en→zh-Hans v2.2（base-memory，sha256 `4e5accc1…`，2025-09-18）。

## 11. 主要参考

- WebKit：[存储策略更新（2023）](https://webkit.org/blog/14403/updates-to-storage-policy/)、[Tracking Prevention](https://webkit.org/tracking-prevention/)、[Safari 26.0 新特性（WebGPU）](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/)、[Safari 15.2（SAB/COOP/COEP）](https://webkit.org/blog/12140/new-webkit-features-in-safari-15-2/)、bugzilla 199854 / 277848 / 324370 / 271401 / 242780。
- Apple：[iPhone 17 技术规格](https://support.apple.com/en-us/125089)、[WWDC25 session 236（WebGPU / shader-f16）](https://developer.apple.com/videos/play/wwdc2025/236/)、[Translation framework](https://developer.apple.com/documentation/translation/translationsession)。
- Transformers.js：[4.x 发布说明](https://github.com/huggingface/transformers.js/releases)、[PR #1700 Safari 26 WebGPU](https://github.com/huggingface/transformers.js/pull/1700)、[文档](https://huggingface.co/docs/transformers.js)。
- 模型与运行时：[mozilla/firefox-translations-models](https://github.com/mozilla/firefox-translations-models)（含 `evaluation/` COMET 结果）、[Mozilla Remote Settings 翻译模型记录](https://firefox.settings.services.mozilla.com/v1/buckets/main/collections/translations-models/records)、[Remote Settings wasm 记录](https://firefox.settings.services.mozilla.com/v1/buckets/main/collections/translations-wasm/records)、[browsermt/bergamot-translator](https://github.com/browsermt/bergamot-translator)、[Xenova/opus-mt-en-zh](https://huggingface.co/Xenova/opus-mt-en-zh)、[onnx-community/Qwen3-0.6B-ONNX](https://huggingface.co/onnx-community/Qwen3-0.6B-ONNX)、[NiuTrans/LMT-60-0.6B](https://huggingface.co/NiuTrans/LMT-60-0.6B)、[tencent/Hy-MT2-1.8B](https://huggingface.co/tencent/Hy-MT2-1.8B)。
- 平台 API：[Chrome Translator API](https://developer.chrome.com/docs/ai/translator-api)、[WebKit standards-positions #339](https://github.com/WebKit/standards-positions/issues/339)、[caniuse Translator](https://caniuse.com/mdn-api_translator)。
- 托管：[Vercel limits](https://vercel.com/docs/limits)、[Vercel Flat Rate CDN](https://vercel.com/docs/pricing/flat-rate-cdn)、[Cloudflare R2 pricing](https://developers.cloudflare.com/r2/pricing/)、[HF rate limits](https://huggingface.co/docs/hub/rate-limits)。
