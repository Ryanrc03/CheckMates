# CheckMates UI 视觉对齐设计

日期：2026-10-11。状态：**设计已由用户逐段确认（2026-10-11），下一步写实施计划。** 基线 `main@9d4a0a9`，功能分支 `feat/ui-visual-alignment`（实施时创建）。依据：[MVP 设计 §3 视觉方向](../../design.md)；2026-10-11 用生产构建（`next start`）在 375×812 和 1280×800 下走完五个步骤的截图与测量。

用户确认的决定：

1. **对齐基准**：沿用 MVP 已确认的「周末小餐馆」方向（奶油底、番茄橙、手帐纸张感），统一全站，不换风格。
2. **改动边界**：样式 + 页内结构微调。不改步骤流程、业务逻辑、金额计算、OCR/翻译和持久化 schema；现有按钮和输入框的可访问名称、e2e 依赖的类名保持不变。
3. **实现方式**：token 先行。顺序是统一 token → CSS 分层 → 基础组件 → 逐页调整。
4. **主按钮**：全站统一使用首页 CTA 现有的 3px 实体阴影。
5. **交付**：一个功能分支、一个 PR，按页提交；不部署。

## 1. 现状（2026-10-11 走查）

### 1.1 根因：未分层的 CSS 覆盖了组件

`src/app/globals.css` 第 131 行以后约 150 行手写 CSS 不在任何 `@layer` 里。Tailwind v4 的 utilities 位于 `@layer utilities`，而未分层的规则不论选择器强弱都优先，所以 shadcn `Button`/`Input` 的 cva 类名大多失效：

- `button, input, textarea { font: inherit; }` 覆盖了 `text-sm font-medium`，按钮字号随父元素变化：底栏 12px，照片区 11px，"Add item" 16px。
- `[data-slot=button] { padding-inline: 16px; border-radius: 12px; font-weight: 600 }` 覆盖所有 size 的内边距和圆角，`size="sm"` 形同虚设。
- `[data-slot=input] { background: #fffdf8; font-size: 16px }` 覆盖 Input 自身的背景和字号。
- 焦点时同时出现全局 `:focus-visible` 的 3px 绿色 outline 和 cva 的 `ring-3 ring-ring/50` 灰色光圈。

结果是每个场景都要再写一层覆盖（`.bottom-actions [data-slot=button]`、`.photo-review [data-slot=button]`、`.header-actions .reset-bill`……），一致性只能靠手工维持。

### 1.2 数值失控

| 维度 | 现状（第 131 行以后） |
| --- | --- |
| 颜色 | 86 个不同的硬编码值；shadcn 的 `secondary`/`muted`/`accent`/`ring`/`chart-*` 仍是默认冷灰 |
| 字号 | 13 种：10/11/12/13/14/15/16/18/24/25px、`.95rem`、两个 `clamp()`；px 与 rem 混用 |
| 圆角 | 11 种：4/6/8/9/11/12/14/16/18/20px 和 50% |
| 间距 | 28 种 padding 值、40 种 margin 值 |
| 对比度 | 次要文字多处低于 WCAG AA 的 4.5:1：页脚 `#9b8b74` 为 3.1:1，"Only what you want to add now" 的 `#897d68` 为 3.8:1，步骤条标签 `#7b7265` 为 4.4:1。表单边框 `#d5ccbd` 对卡片底只有 1.6:1（控件边界要求 3:1） |
| 小字 | 小票页上 10–11px 的可见文字：步骤条标签、眉标、来源徽标、`THE RECEIPT`/`USD`、"Only what you want to add now"、菜品 label |

### 1.3 可见问题清单

| # | 页面 | 问题 | 证据 |
| --- | --- | --- | --- |
| P1 | 小票 | 金额没有对齐到同一条右边缘：375px 宽时菜品价格框右缘在 304px，税/小费框和小计、合计在 338px，差 34px（>480px 时差 42px） | 375×812 测量 |
| P2 | 小票 | 菜品名和价格输入框位于 `<label>` 内，继承了 label 的 `#796e5c` 和字重 600，看起来像 placeholder；同一张卡片里的税/小费框是 `#302b25`、字重 400 | computed style |
| P3 | 全局 | 首页和结果页的标题居中，其余步骤左对齐 | 截图 |
| P4 | 桌面 | 1280px 宽时 header 宽 1024px，品牌左缘在 151px；内容列宽 540px，左缘在 363px | 1280×800 测量 |
| P5 | 朋友 | 名字显示两次（粗体名字 + 改名输入框）；头像用序号，首页插画却用首字母；只有 4 种颜色且按 id 哈希分配，3 个人就撞色（Alex 和 Christopher 都是 mint） | 截图 |
| P6 | 全局 | 主按钮有两套：首页 "Take a photo" 是 label 模拟的 50px 按钮、带 3px 阴影，其余主按钮是 44px 扁平按钮；前进箭头有时是 Lucide 图标，有时是文字 `→` | 代码和截图 |
| P7 | 全局 | 15 处 `.notice` 都是同一种黄色，信息、警告、错误看起来没有区别 | 代码 |
| P8 | 照片调整 | 没有步骤条；主操作不在底栏；10 个按钮和控件平铺 | 代码 |
| P9 | 分配 | "Everyone" 是孤立居中的 ghost 按钮；`select` 和数字输入各自一套样式；比例/数量模式下长名字让输入框上下错位；这里的表单 label 是 14px，小票页是 10px | 截图 |
| P10 | 首页 | 没有底栏的页面也预留了 100px 底部空白；"Offline data" 看起来像一个居中的大按钮 | 截图 |
| P11 | 小票 | 删除按钮只有 28–34px 宽，低于 MVP 设计要求的 44px 触控目标 | 代码 |

## 2. 目标与非目标

目标：

1. **单一 token 来源**：`globals.css` 中 `:root` 以外不出现颜色字面量；字号、圆角、间距、阴影都来自 token 阶梯。
2. **组件一致**：按钮、输入、提示框、标签、折叠区、步骤标题、底栏在所有页面使用同一套外观和行为。
3. **修完 §1.3 的 P1–P11。**
4. **无障碍底线**：正文和次要文字对比度 ≥4.5:1，表单控件边界 ≥3:1，可见文字 ≥12px，触控目标 ≥44px，全站只有一种焦点样式，颜色从来不是唯一的信息。

非目标：

- 不做暗色模式（同时删除未使用的 `.dark` token），不引入 web font，不换视觉方向。
- 不改步骤流程、文案（新增控件的标签除外）、业务逻辑、金额计算、OCR、翻译和持久化 schema。把符号 `→`、`↗`、`✓` 换成 `aria-hidden` 的图标不算文案改动。
- 不做像素快照测试；不清理未使用的 shadcn 组件（`card`/`badge`/`progress`/`separator` 保持原样）。
- 不部署；部署另行决定。

## 3. 设计 token

### 3.1 颜色

| Token | 值 | 用途 | 对比度 |
| --- | --- | --- | --- |
| `--background` | `#faf7ef` | 页面奶油底 | — |
| `--surface` | `#fffdf7` | 纸张卡片、输入框、开关底 | — |
| `--surface-sunken` | `#f3eee3` | 图片底、徽标、步骤点、原文 `pre`、预览凹槽、info 提示 | — |
| `--foreground` | `#302b25` | 正文、标题、金额 | 13.1:1（奶油底） |
| `--muted-foreground` | `#655b4d` | 次要文字、label、说明、图例 | 所有底色（含 6 种朋友色）≥5.0:1 |
| `--primary` | `#b9432a` | 主按钮填充、当前步骤、复选框 accent | 主按钮文字 5.2:1 |
| `--primary-foreground` | `#fffaf0` | 主按钮文字 | — |
| `--primary-strong` | `#9a3822` | 品牌色文字（眉标、ghost 按钮、链接、合计金额）和实体阴影 | 所有底色 ≥5.3:1 |
| `--success` | `#3e654e` | 成功文字和图标；同时是 `--ring` | 6.2:1 |
| `--success-soft` / `--success-border` | `#dce8d8` / `#b8d9c5` | success 提示 | 文字 5.2:1 |
| `--warning-soft` / `--warning-border` / `--warning-strong` | `#fff4d5` / `#e7d49b` / `#7a5a0c` | warning 提示的底、边和图标 | 图标 5.8:1 |
| `--destructive` | `#a52620` | 错误文字、无效边框 | 7.1:1 |
| `--destructive-soft` / `--destructive-border` | `#fbeae6` / `#e3b0a5` | error 提示 | 文字 6.2:1 |
| `--border` | `#e5dfd3` | 卡片边、分隔线（装饰性） | — |
| `--rule` | `#d5c9b5` | 小票虚线、步骤条连线、预览虚线 | — |
| `--input` | `#968b78` | 输入框、下拉框、outline 按钮的边框 | 3.3:1（surface） |
| `--chart-1` / `--chart-2` / `--chart-3` | `#426c59` / `#c36b44` / `#8372a6` | 构成条：菜品 / 税 / 小费 | — |

shadcn 语义名映射：

- `--card`、`--popover` → `var(--surface)`。
- `--secondary`、`--muted`、`--accent` → `var(--surface-sunken)`。
- 各 `*-foreground` → `var(--foreground)`，`--muted-foreground` 除外。
- `--ring` → `var(--success)`。
- 删除 `--chart-4/5`、`--sidebar-*` 和整个 `.dark` 块（都未使用）。保留 `@custom-variant dark`，以免影响 shadcn 组件里的 `dark:` 类。

规则：在朋友色底上的控件边框用 `--muted-foreground`，因为 `--input` 在朋友色上只有 2.5:1。

### 3.2 朋友色

| 序号 | 名称 | 浅色（卡片底） | 深色（头像、颜色点、插画贴纸） |
| --- | --- | --- | --- |
| 1 | mint | `#d5e7d9` | `#b8d9c5` |
| 2 | peach | `#f3dccc` | `#edb897` |
| 3 | lilac | `#e5ddf1` | `#dac7eb` |
| 4 | lemon | `#f3e9bb` | `#edc864` |
| 5 | sky（新增） | `#d9e6ef` | `#b7cfe1` |
| 6 | rose（新增） | `#f3dbe1` | `#e6b7c3` |

分配规则：

- `personColor(index)` 按 `bill.people` 的序号返回 `person-${index % 6 + 1}`。每个类设置 `--person-color` 和 `--person-color-strong`。
- 前 6 人保证不撞色。删除一个人后，排在其后的人颜色前移；用户已接受这一点，因为名字始终可见。
- 头像显示 `personInitial(name)`：去掉首尾空白后按 code point 取第一个字符并大写，空名返回 `?`。
- `--foreground` 在全部 12 种朋友色上的对比度都 ≥7.9:1。

### 3.3 字体与字号

字体：

- `--font-sans`：Arial, Helvetica, sans-serif。用于正文和控件。
- `--font-display`：Georgia, "Times New Roman", serif。用于 h1 和首页大标题。
- `--font-receipt`："Courier New", monospace。用于小票标题和首页插画。
- 删除指向未加载字体的 `--font-mono: var(--font-geist-mono)`。

| 名称 | 字号 / 行高 | 字重 | 用途 |
| --- | --- | --- | --- |
| display | `clamp(40px, 10vw, 54px)` / 1.05 | 700 serif | 首页大标题 |
| title | `clamp(32px, 8vw, 40px)` / 1.12 | 700 serif | 各步骤 h1 |
| amount | 26px / 1.1 | 700，等宽数字 | 每人应付金额 |
| brand | 24px / 1.2 | 800 | 品牌字标（唯一的专用字号） |
| heading（Tailwind `text-lg`） | 18px / 1.3 | 700 | h2、结果卡人名 |
| body（`text-base`） | 16px / 1.5 | 400；卡片标题和提示框标题 700 | 正文、输入文字、CTA 按钮 |
| body-sm（`text-sm`） | 14px / 1.45 | 400；按钮和 h3 为 700 | 次要正文、合计行、步骤副标题、按钮 |
| caption（`text-xs`） | 12px / 1.4 | 400；label 为 700 | label、说明、fine print、图例、步骤条标签、徽标 |
| overline | 12px / 1.4，字距 0.14em，大写 | 700 | 眉标 |

- **Tailwind 命名约束**：字号和圆角沿用 Tailwind 默认名（`text-xs/sm/base/lg`，`rounded-md/lg/full`），只在 `@theme` 里改取值。`cn` 是 tailwind-merge 兼容的合并器，会把不认识的 `text-*` 当成颜色类，在合并时误删。
- **金额**：所有金额（输入和展示）一律 `font-variant-numeric: tabular-nums`，并且右对齐。

### 3.4 间距、布局、圆角、阴影、焦点、动效、图标

- **间距**：以 4px 为基数，CSS 中统一写 `--spacing(n)`。可用值为 4、8、12、16、20、24、32、40、48。
  - 页边距 `--gutter` 20px。
  - 卡片内边距：≤480px 时 16px，其余 20px。
  - 卡片之间 16px。
  - 步骤标题块与内容之间 24px。
- **布局**：`--content-width` 540px。header、步骤内容和底栏三者共用这一列。
  - `main`：`width: min(100% - 2 * var(--gutter), var(--content-width))`，居中。
  - header 和底栏：外层通栏；内层 `max-width: calc(var(--content-width) + 2 * var(--gutter))`，`padding-inline: var(--gutter)`，居中。这样内层内容的左右边缘与 `main` 重合。
- **金额列**：`--money-col` 96px，`--action-col` 44px。
- **圆角**：
  - `--radius-sm` 8px：图片、凹槽。
  - `--radius-md` 12px：按钮、输入、提示框、单选卡片。
  - `--radius-lg` 16px：卡片、面板、朋友行、结果卡。
  - `rounded-full`：标签、徽标、头像、颜色点、开关、进度条。
- **阴影**：
  - `--shadow-card`：两层 4–5% 透明度的暖棕阴影，用于纸张卡片。
  - `--shadow-press`：`0 3px 0 var(--primary-strong)`，用于主按钮。
  - `--shadow-raised`：用于照片角点手柄。
- **焦点**：
  - 所有可聚焦元素使用 `outline: 3px solid var(--ring); outline-offset: 2px`。
  - 删除 cva 里的 `focus-visible:ring-*` 和 `focus-visible:border-ring`。
  - 包着文件 input 的 label 用 `:focus-within` 显示同样的外框。
  - 保留"程序聚焦的 h1 不显示 outline"。
- **动效**：
  - 颜色和背景过渡 150ms ease-out。
  - 主按钮按下时下移 2px，并收起阴影。
  - 保留 `prefers-reduced-motion` 时全局关闭动画。
- **图标**：统一用 Lucide。
  - 16px：行内和按钮内。
  - 20px：CTA 和独立图标。
  - 24px：装饰。

### 3.5 旧值归并

| Token | 归并的旧值 |
| --- | --- |
| `--surface` | `#fffdf7` `#fffdf8` `#fffcf5` `#fffefa`，`select` 的 `white` |
| `--surface-sunken` | `#eee7d7` `#eee8dc` `#eee9de` `#f4efe5` |
| `--background` | `#faf7ef`；底栏 `#faf7eff5` → `color-mix(in oklch, var(--background) 96%, transparent)` |
| `--foreground` | `#263d30`（选中标签文字） |
| `--muted-foreground` | `#564b42` `#696251` `#6a5a3d` `#6f6555` `#716657` `#746959` `#746b5d` `#786951` `#786f60` `#796e5c` `#7a6d59` `#7b7265` `#81715c` `#897d68` `#907662` `#9b8b74` |
| `--primary` | `#ad4028` `#b9432a` `#c54b30`；角点多边形 `#b9432a1a` → `color-mix(in oklch, var(--primary) 10%, transparent)` |
| `--primary-foreground` | `#fff8e8`，`white` |
| `--primary-strong` | `#8b4834` `#8d311e` `#8e3c2a` `#8e4731` `#92513a` `#995237` `#a1442a` `#a53a24` `#a83d27` `#a95536` |
| `--success`（= `--ring`） | `#315f4b` `#386e59` `#3e654e` `#4b6657` `#557355` |
| `--success-soft` | `#dce8d8` |
| `--warning-soft` / `--warning-border` | `#fff4d5` / `#e7d49b` |
| `--destructive` | `#a52620`，以及未分配卡片的边框 `#b84e2f` |
| `--border` | `#e0d7c7` `#e5dbca` `#e6dece` `#e7dfd0` `#e8e0d3` `#eee5d4` |
| `--rule` | `#cbbfa8` `#d5c7b0` `#d7d1c7` `#d9cdb7` `#dbd3c5` |
| `--input` | `#bca77a` `#d5ccbd` `#d9cebc` |
| 朋友色（浅 / 深） | `#d5e7d9` `#f3dccc` `#e5ddf1` `#f3e9bb` / `#b8d9c5` `#edb897` `#dac7eb` `#edc864` |
| `--chart-1/2/3` | `#426c59` / `#c36b44` / `#8372a6` |
| 派生值（写在组件里，基于 token） | 朋友色卡片内分隔线 `#0001` `#0002` `#0003` → `color-mix(in oklch, var(--foreground) 14%, transparent)`；点阵背景 `#bfb5a21f` → `color-mix(in oklch, var(--rule) 45%, transparent)`；构成条底 `#fff9` → `color-mix(in oklch, var(--surface) 60%, transparent)`；插画叠纸投影 `#ddd1b34f` → `color-mix(in oklch, var(--rule) 30%, transparent)` |
| 阴影 | `#4831160a` `#58412805` → `--shadow-card`；`#302b2570` → `--shadow-raised` |

## 4. 组件规范

### 4.1 Button（`components/ui/button.tsx`）

- **基础**：
  - `inline-flex` 居中，`gap-2`，`rounded-md`（12px），`text-sm` 700。
  - 允许换行（去掉 `whitespace-nowrap`，加 `text-balance`），宁可两行也不溢出。
  - 去掉 `focus-visible:ring-*`，改用全局焦点样式。
  - 保留 `disabled:opacity-50 disabled:pointer-events-none`。
  - svg 默认 16px。
- **variant**：
  - `default`：`--primary` 底、`--primary-foreground` 字、`--shadow-press`。hover 时底色加深（`color-mix` 8% `--foreground`）；按下时下移 2px 并去掉阴影。
  - `outline`：`--surface` 底、1px `--input` 边、`--foreground` 字；hover 时 `--surface-sunken`。
  - `ghost`：透明底、`--primary-strong` 字；hover 时 `--surface-sunken`。
  - `link`：`--primary-strong` 字，下划线 offset 4px。
  - 删除未使用的 `secondary` 和 `destructive`。
- **size**：
  - `default`：`min-h-11`（44px），横向内边距 16px。
  - `lg`：`min-h-13`（52px），横向内边距 20px，字号 `text-base`，svg 20px。
  - `icon`：`size-11`（44×44）。
  - 删除 `xs`/`sm`/`icon-xs`/`icon-sm`/`icon-lg`。"Reset bill" 从 `size="sm"` 改为 `default`。
- **箭头**：前进动作在文字后放 Lucide `ArrowRight`（`aria-hidden`），不再用文字 `→`。可访问名称因此去掉箭头；e2e 用子串匹配，不受影响。
- **页面调整按钮**：只能通过 `variant`/`size` 或带 Tailwind utilities 的 `className`（由 `cn` 合并）。不得再用 `.foo [data-slot=button]` 这类后代选择器；分层以后这类规则本来也会输给 utilities。
- **PhotoInput**（`home/home-step.tsx`）：
  - `<label>` 的类名用 `buttonVariants({ variant, size })`，新增 `variant`（默认 `outline`）和 `size`（默认 `default`）两个 prop；`camera` 入口传 `default` + `lg`。
  - 可访问名称仍来自内部 `input` 的 `aria-label`。
  - 焦点用 `:focus-within` 外框。

### 4.2 表单控件

- **Input**（`components/ui/input.tsx`）：
  - 外观：`min-h-11`，`rounded-md`，1px `--input` 边，`--surface` 底。
  - 文字：`text-base`、`--foreground`、字重 400，显式设置，不再从 label 继承；placeholder 用 `--muted-foreground`。
  - `aria-invalid` 时边框改为 2px `--destructive`。
  - 去掉 `md:text-sm`（保持 16px，避免 iOS 聚焦时缩放）和所有 ring 类。
- **金额输入**：使用处传 `className="text-right tabular-nums"`，并给单元格加类 `money`（供 §7.1 测量）。
- **下拉框**：
  - 原生 `select` 设 `appearance: none`，外观与 Input 一致。
  - 结构为 `<span className="select-wrap"><select/><ChevronDown aria-hidden/></span>`，图标 `pointer-events: none`。
  - 手机上仍弹出原生选择器。
- **数字输入**（照片角度）：改用 `Input`，宽 88px，后缀 "degrees" 用 caption。
- **复选框**：原生，20px，`accent-color: var(--primary)`。
- **开关**（"Show Chinese names"，已经是 `role="switch"`）：
  - 原生 checkbox 设 `appearance: none`，画成 44×24 的胶囊和滑块。
  - 选中时为 `--primary` 底；整行 label 都可点击。
- **单选卡片**（识别引擎）：
  - 每个选项是带边框的 `label`：`rounded-md`，1px `--input` 边，内含标题（`text-sm` 700）和说明（caption）。
  - 选中状态由 React 的 `engine` 加类 `selected`，显示 2px `--foreground` 边，不依赖 `:has()`。
  - 原生 radio 保持可见。

### 4.3 字段（label + 说明 + 错误）

- **label**：caption 700，`--muted-foreground`，`display: block`，与控件间距 6px。卡片内的分组小标题（"Adjust"、"Recognition engine"）使用同一样式。
- **说明**：caption 400，`--muted-foreground`。
- **错误**：caption，`--destructive`，位于控件下方 6px；保留现有的 `id`/`aria-describedby` 关联。
- **适用范围**：小票编辑、加朋友、比例/数量输入、照片角度、差额原因。

### 4.4 纸张卡片 `.paper`

- **默认**：`--surface` 底，1px `--border`，`rounded-lg`（16px），`--shadow-card`，内边距 16/20px，卡片之间 16px。
- **小票卡片**：多一行 `--font-receipt` 标题（`THE RECEIPT` / `USD`，12px）和 `--rule` 虚线。
- **朋友色卡片**（朋友行、结果卡）：`--person-color` 底，无边框，卡片内分隔线用 §3.5 的派生色。

### 4.5 提示框 `components/ui/notice.tsx`（新增）

- **接口**：`<Notice tone="info" | "warning" | "error" | "success" title? role? className?>{children}</Notice>`，渲染为 `<div className="notice" data-tone={tone} role={role}>`。
- **图标**：左侧 16px Lucide 图标，按 tone 依次为 `Info`、`TriangleAlert`、`CircleAlert`、`Check`，`aria-hidden`。
- **排版**：正文 `text-sm`，标题 `text-base` 700；`rounded-md`，内边距 12px 14px。

| tone | 底 / 边 / 图标 |
| --- | --- |
| info | `--surface-sunken` / `--border` / `--muted-foreground` |
| warning | `--warning-soft` / `--warning-border` / `--warning-strong` |
| error | `--destructive-soft` / `--destructive-border` / `--destructive` |
| success | `--success-soft` / `--success-border` / `--success` |

现有 15 处的归类（`role` 一律保持原样）：

| 位置 | 内容 | tone |
| --- | --- | --- |
| `bill-wizard.tsx` | `storageError`（status） | warning |
| `bill-wizard.tsx` | store 的 `error`（alert） | error |
| `bill-wizard.tsx` | 识别 `error`，非首页（alert） | error |
| `home/home-step.tsx` | 识别失败（alert） | error |
| `home/home-step.tsx` | 刷新后照片丢失的说明 | info |
| `home/offline-data.tsx` | 状态不可用 | warning |
| `receipt/photo-adjustment.tsx` | `analysisStatus`（status） | info |
| `receipt/photo-adjustment.tsx` | 图片或分析错误（alert） | error |
| `receipt/receipt-step.tsx` | Unassigned discounts | warning |
| `receipt/receipt-step.tsx` | Before we split | warning |
| `receipt/receipt-step.tsx` | 表单错误（alert） | error |
| `split/split-step.tsx` | 未分配或待应用（alert） | error |
| `result/result-step.tsx` | 复制失败兜底（含 textarea） | info |
| `translation/translation-controls.tsx` | 模型下载确认 | info |
| `translation/translation-controls.tsx` | 翻译错误（alert） | error |

另外，结果页的 "Copied!" 改用 success tone：`role="status"` 容器常驻，复制成功时才在里面渲染 Notice，保证读屏软件能播报。

### 4.6 朋友标签（分配页）

- **实现**：原生 `button` 加 `.chip` 类，带 `aria-pressed`，不走 Button 的 cva，避免与 Button 的 utilities 冲突。
- **外观**：`rounded-full`，最小高度 44px，内边距 14px，`text-sm` 700。长名字允许换行（`overflow-wrap: anywhere`），高度随内容增长。
- **未选中**：`--surface` 底，1px `--input` 边，左侧 10px 颜色点（`--person-color-strong`）。
- **选中**：`--person-color` 底，2px `--foreground` 边，左侧 Lucide `Check` 16px，替换原来的文字 "✓ "。
- **"Everyone"**：作为同一行的最后一个标签。1px 虚线 `--input` 边，`--primary-strong` 字，左侧 Lucide `Users` 图标；可访问名称仍是 "Everyone"。

### 4.7 头像与徽标

- **头像**：32px 圆，`--person-color-strong` 底，内容为 `personInitial(name)`，13px 700，`--foreground`，`aria-hidden`。用于朋友行和结果卡。
- **徽标** `.source-badge`：`rounded-full`，高 28px，`--surface-sunken` 底，caption 700，`--muted-foreground`。文字不变（e2e 精确匹配）。

### 4.8 步骤标题与步骤条

- **标题块**：
  - 顺序：眉标（overline，`--primary-strong`）→ h1（title）→ 副标题（`text-sm`，`--muted-foreground`）。
  - 全部左对齐。首页 hero 是唯一居中的页面。
- **步骤条**：
  - 圆点 28px。已完成和当前步骤：`--primary` 底、`--primary-foreground` 字。未到的步骤：`--surface-sunken` 底、`--muted-foreground` 字。
  - 标签用 caption；当前步骤的标签 700，`--primary-strong`。
  - 连线 1px `--rule`。
  - 照片调整页也显示步骤条，当前为第 1 步。

### 4.9 底部操作栏 `.bottom-actions`

- **结构**：固定在底部。外层通栏，带 `color-mix(--background 96%)` 底、12px blur 和 1px `--border` 上边；内层按 §3.4 的布局规则与内容列对齐。
- **间距**：上下内边距 12px，底部另加安全区。
- **按钮**：左边是次要按钮（outline，宽度随内容），右边是主按钮（default，`flex: 1`）。按钮使用 Button 自身的尺寸，删除 `.bottom-actions [data-slot=button]` 覆盖；文字放不下时折成两行（见 §4.1）。
- **范围**：所有步骤一致，包括照片调整页；首页没有底栏。

### 4.10 折叠区（`details` / `summary`）

- **样式**：统一用 `.disclosure` 类。summary 最小高度 44px，`text-sm` 700，右侧 Lucide `ChevronDown` 16px，`[open]` 时旋转 180°，并去掉浏览器默认的三角。
- **适用范围**："Offline data"、"Original recognized text"、"Alternative recognized text"、"Tax and total recognition evidence"、"Receipt evidence for …"，以及结果卡的 "View breakdown"。
- **文字**：summary 文字都不变（e2e 用文字定位）。

### 4.11 金额列

- **规则**：凡是"名称—金额"结构，金额都右对齐到同一条边。
  - 带操作列的卡片（小票编辑）用 `grid-template-columns: minmax(0, 1fr) var(--money-col) var(--action-col)`。没有操作的行（小计、税、小费、合计、原票金额）也保留空的操作列。
  - 没有操作列的卡片（分配卡标题、份额预览、结果合计、个人明细）用 `minmax(0, 1fr) auto`，金额贴卡片内边距右缘。
- **测量钩子**：每个金额单元格（输入或文字）都带 `money` 类，供 §7.1 测量。

## 5. 各页调整

### 5.0 外壳（`bill-wizard.tsx`、`globals.css`）

- **header**：
  - 外层通栏，保留下边框；内层按 §3.4 的布局规则与内容列对齐（修 P4）。
  - "Reset bill" 用 `outline` `default`（44px）。"A fair share of a good time." 改为 caption，`--muted-foreground`，≤480px 时继续隐藏。
- **步骤条**：照片调整页也渲染，`<nav aria-label="Bill progress">` 结构不变。
- **`main` 底部留白**：只有存在底栏时才预留，由 `bill-wizard.tsx` 根据"照片调整中，或步骤不是 home"加类 `has-bottom-bar`（修 P10）。
- **页脚**：caption，`--muted-foreground`（原来只有 3.1:1）。
- **品牌标志**：保留旋转方块，颜色改用 `--primary` / `--primary-foreground`。
- **点阵背景**：改用 §3.5 的派生色。

### 5.1 首页

- **hero**：保持居中，大标题用 display。
- **CTA**：
  - "Take a photo"：PhotoInput，`default` + `lg`。
  - "Upload a receipt"：PhotoInput，`outline` + `lg`。
  - "Retry recognition" 和 "Enter items manually"：`outline` + `lg`。
  - "Try a sample bill"：`ghost` + `ArrowRight`。
- **识别中的状态卡**：`.paper` 加进度条（轨道 `--surface-sunken`，填充 `--primary`，高 8px，`rounded-full`），再加 "Cancel recognition"（outline）。原生 `progress` 保留，只换样式。
- **说明文字**：隐私说明、fine print、how-it-works 升到 12px；how-it-works 的序号用 `--primary-strong`。
- **插画**：
  - 贴纸改用朋友色深色。
  - 纸张投影改用 §3.5 的派生色。
  - 宽度 245px → 260px、内边距 20px，让 12px 的 "A little yours. A little mine." 保持一行。
- **"Offline data"**：放在 how-it-works 分隔线下方，改成左对齐的 `.disclosure`，不再是居中大卡片；"Remove" 用 outline。

### 5.2 照片调整页（`receipt/photo-adjustment.tsx`）

- **顶部**：步骤条（当前第 1 步）+ 标题块。
- **提示**：`analysisStatus` 用 info Notice（`role="status"`），错误用 error Notice（`role="alert"`）。
- **图片区**：
  - 原图和校正后两栏保持不变，≤480px 时上下排。
  - 图片底 `--surface-sunken`，`rounded-sm`。
  - 角点手柄：`--primary` 填充，3px `--surface` 边，`--shadow-raised`，44px。
- **"Adjust" 卡片**：
  - "Rotate 90°"、"Adjust four corners"、"Use original photo"、"Reset adjustments" 四个 outline 按钮，两列网格。
  - 下面一行："Fine tune angle" + Input + "degrees"。
- **"Recognition engine" 卡片**：两个单选卡片，Standard (fast) 和 Precise（first use downloads about 45 MB; stays in this browser）。
- **次要操作**：
  - "Choose another receipt photo"：PhotoInput，outline default，全宽，带 `Upload` 图标。
  - "Enter items manually"：ghost。
- **底栏**：
  - 左："Back"，outline。
  - 右："Use this photo and recognize"，default + `ArrowRight`，`flex: 1`。
  - 按钮文字和 `busy`/`precise` 时的变体保持原样。375px 宽时允许折成两行。

### 5.3 小票页（`receipt/receipt-step.tsx`、`receipt-line-details.tsx`、`translation/translation-controls.tsx`）

- **标题区**：标题块左对齐；来源徽标按 §4.7。
- **照片卡片**：
  - 图片在凹槽里。"Open photo to zoom" 改成 link 样式，末尾的 `↗` 换成 Lucide `ExternalLink` 图标。
  - 按钮两列网格："Adjust or rotate photo" 占满一行，"Recognize again" 和 "Enhanced scan" 并排。
  - "Reattach receipt photo" 用 PhotoInput outline，全宽。
  - 三个识别原文折叠区按 §4.10。
- **"Show Chinese names"**：从整张卡片缩成一行开关（§4.2），下载确认和错误用 Notice；"Machine translation for reference only…" 改为 caption。`.dish-translation` 类保留。
- **小票编辑卡片（修 P1、P2、P11）**：
  - 整张卡片是一个金额列网格（§4.11）：菜品行为名称 Input、价格 Input（`money`）、删除按钮（`icon` ghost，44×44）。
  - "Items subtotal"、"Tax"、"Tip already on receipt"、"Added tip"（附说明 "Only what you want to add now"）、"Edited total"、原票小计/合计/差额，全部把金额放在同一列。
  - label 按 §4.3。
  - "Add item" 用 outline + `border-dashed` + `Plus`，全宽。
  - "Edited total" 一行 18px 700，金额用 `--primary-strong`。
- **逐行明细**（`receipt-line-details.tsx`）：
  - 位于菜品行下方并跨整行，文字 caption、`--muted-foreground`。
  - 两个折扣选择按钮（outline）一行排开，可换行。
  - "Receipt evidence for …" 用 `.disclosure`。
  - "Discount already included" 等文字不变。
- **提示**：Unassigned discounts 和 Before we split 用 warning Notice；复选框行按 §4.2。
- **其他**：差额原因按 §4.3 字段处理；表单错误用 error Notice。

### 5.4 朋友页（`people/people-step.tsx`，修 P5）

- **加朋友表单**：label + Input + "Add"（outline + `Plus` 图标；同一屏只保留底栏一个实体主按钮）；错误按 §4.3。
- **朋友行**：
  - 布局：朋友色卡片，依次是头像（首字母）、名字（`text-base` 700，可换行）、`Rename {name}` 铅笔图标按钮、`Remove {name}` 垃圾桶图标按钮（都是 `icon` ghost，44×44）。
  - 名字只以可见文字出现一次。
- **编辑态**：
  - 点铅笔后，名字位置换成 Input（`aria-label="New name for {name}"`，自动聚焦并全选），铅笔位置换成 `Save name`（Check 图标）。
  - Enter 或点 Save 保存；失焦时保存（沿用现有逻辑：空值恢复原名）；Esc 取消。
  - 退出编辑态后焦点回到铅笔按钮。同一时间只有一行处于编辑态。
- **其他**：空状态和 "N friends at the table" 改为 caption/`text-sm`，`--muted-foreground`。

### 5.5 分配页（`split/split-step.tsx`、`item-allocation-editor.tsx`，修 P9）

- **计数**："N of M items assigned" 改为 caption 700；全部分配完时用 `--success`，否则用 `--muted-foreground`。
- **菜品卡片**：
  - 标题行：名称（`text-base` 700）+ 译名 + 价格（`money`，`tabular-nums`）。
  - "Split method" 一行：label + §4.2 下拉框。
- **均分模式**：朋友标签（§4.6），"Everyone" 在同一行最后；"Choose at least one friend" 为 caption、`--muted-foreground`。
- **未分配**：在用户尝试继续之后，卡片边框改为 2px `--destructive`，提示文字改为 `--destructive`；`role="alert"` 的汇总 Notice 不变。
- **比例/数量模式**：
  - 输入网格两列，`align-items: end`，名字换行时输入框仍按底部对齐。
  - label 按 §4.3。
  - "Apply shares" 用 outline；"Switching to Equal resets…" 为 caption。
- **份额预览**：放进 `--surface-sunken` 凹槽，每行为"名字 · 份数"加右侧金额（`money`）。

### 5.6 结果页（`result/result-step.tsx`、`person-breakdown.tsx`、`share-composition.tsx`）

- **标题块**：左对齐（修 P3）。原来居中的圆形图标缩到 24px，放在眉标左侧。
- **个人卡片**：
  - 头部：头像 + 名字（heading）+ "View breakdown" 和 `ChevronDown`（展开时旋转），右侧金额用 amount。
  - 构成条：轨道使用 §3.5 的派生色，图例为 caption，圆点 8px。
  - `data-testid="share-{name}"`、`.person-result`、`.share-composition`、`.breakdown-fee` 保留。
- **明细**：
  - "Item by item" 为 h3（`text-sm` 700）。
  - 每行"名称 + 金额"，说明行为 caption、`--muted-foreground`；分隔线用派生色。
  - "Total for {name}" 为 `text-sm` 700。
- **合计卡片**：
  - 用金额列网格：Items subtotal、Tax、Tip、Bill total（18px 700，金额 `--primary-strong`）。
  - "Allocation difference" 为 caption、`--success`；fine print 为 caption。
  - `data-testid="bill-total"` 保留。
- **其他**："Copied!" 用 success Notice（§4.5）；复制兜底用 info Notice；"Start a new bill" 用 ghost，左对齐。

## 6. 实现架构

### 6.1 `globals.css` 结构

```text
@import "tailwindcss"; @import "tw-animate-css"; @import "shadcn/tailwind.css";
@custom-variant dark (&:is(.dark *));
@theme inline { 颜色、字体、text-xs/sm/base/lg 取值与行高、radius-sm/md/lg、shadow 名称 → var(--*) }
:root { 全部 token 字面量（颜色、朋友色、阴影、尺寸） }
@layer base { body/h1–h3/p 默认、按钮 cursor、唯一焦点样式、h1 程序聚焦、reduced motion }
@layer components {
  /* shell */ /* home */ /* photo adjustment */ /* receipt */ /* people */ /* split */ /* result */
  /* shared: paper, notice, chip, disclosure, select-wrap, switch, choice-card, money grid, bottom-actions, step-heading, step-progress */
}
```

- 不再有任何未分层的规则；媒体查询写在对应 layer 里面。
- `@layer components` 里的规则只能引用 `var(--*)`、`--spacing()` 和由 token 派生的 `color-mix()`，并且不得选中 `[data-slot=…]`。

### 6.2 文件改动

| 文件 | 改动 |
| --- | --- |
| `src/app/globals.css` | 按 §6.1 重写 |
| `src/app/globals.test.ts`（新增） | CSS 守卫（§7.2） |
| `src/components/ui/button.tsx` | 按 §4.1 重写 cva，继续导出 `buttonVariants` |
| `src/components/ui/input.tsx` | 按 §4.2 重写类名 |
| `src/components/ui/notice.tsx`（新增） | §4.5 |
| `src/components/people/person-style.ts`（新增）及 `person-style.test.ts` | `personColor(index)`、`personInitial(name)`。纯 TS，不含 JSX |
| `src/components/bill-wizard.tsx` | 照片调整页也渲染步骤条；`has-bottom-bar`；3 处 Notice；Reset bill 的 size |
| `src/components/home/home-step.tsx` | PhotoInput 新增 variant/size；CTA；Notice；进度条 |
| `src/components/home/offline-data.tsx` | disclosure；Notice |
| `src/components/receipt/photo-adjustment.tsx` | 分组、单选卡片、底栏、Notice、角度 Input |
| `src/components/receipt/receipt-step.tsx` | 金额列网格、照片区按钮网格、Notice、字段、`money` |
| `src/components/receipt/receipt-line-details.tsx` | caption、按钮行、disclosure |
| `src/components/translation/translation-controls.tsx` | 开关行、Notice |
| `src/components/people/people-step.tsx` | 朋友行（头像、编辑态、图标按钮）；Add 改 outline；不再导出 `personColor` |
| `src/components/split/split-step.tsx` | 卡片标题行、计数样式、未分配状态、Notice |
| `src/components/split/item-allocation-editor.tsx` | chip、Everyone、select-wrap、输入对齐、预览凹槽；从 `person-style` 引入 `personColor` |
| `src/components/result/result-step.tsx` | 标题块、头像、chevron、合计网格、success Notice；从 `person-style` 引入 |
| `src/components/result/person-breakdown.tsx` | caption、金额列、分隔线 |
| `src/components/result/share-composition.tsx` | 仅 token 化，类名不变 |
| `tests/e2e/visual-alignment.spec.ts`（新增） | §7.1 |
| `src/ARCHITECTURE.md` | 目录表补 `ui/notice.tsx`、`people/person-style.ts`；新增 "Styling" 一节（§6.3） |
| `docs/validation/<完成当天日期>-ui-visual-alignment.md`（新增） | 改前改后测量记录（§7.4） |

### 6.3 写入 `ARCHITECTURE.md` 的样式规则

1. token 只在 `globals.css` 的 `:root` 中定义，其他地方不写颜色字面量；新增颜色就新增 token。
2. 字号只用阶梯值：Tailwind 的 `text-xs/sm/base/lg`，加上 display/title/amount/brand 四个专用值。可见文字不小于 12px。
3. 层级顺序：`@layer base` 元素默认 → `@layer components` 语义类 → Tailwind utilities。不写未分层的 CSS。
4. shadcn primitives（`components/ui/*`）用 cva utilities 管自己的外观。页面只通过 `variant`/`size`/`className` 调整它们，不用后代选择器覆盖。
5. 全站只有一种焦点样式，在 `@layer base` 中；组件里不写 ring。
6. 触控目标不小于 44px；朋友颜色由 `personColor(index)` 决定，名字始终可见。
7. `.item-editor`、`.dish-translation`、`.share-composition`、`.breakdown-fee`、`.person-result` 是 e2e 钩子，改名时必须同步改测试。

### 6.4 e2e 兼容性约束

以下内容必须保持不变：

- **按钮名**："Try a sample bill"、"Retry recognition"、"Cancel recognition"、"Enter items manually"、"Adjust or rotate photo"、"Rotate 90°"（exact）、"Recognize again"、"Enhanced scan"、"Back"（exact）、"Add friends"、"Assign items"、"See the split"、"Everyone"（exact）、"Remove {item}"、"Remove {friend}"（exact）、"Apply shares"、"Copy summary"、"Edit assignments"、"Back to friends"、"Back to receipt"、"Remove translation model"，以及以 "Use this photo and recognize" 开头的确认按钮（标准引擎时 exact）。
- **label 名**："Take a photo"、"Upload a receipt"（exact）、"Reattach receipt photo"、"Choose another receipt photo"、"Friend's name"、"Item N name"、"Price for {item}"、"Summary to copy"，以及开关 "Show Chinese names"（`role="switch"`）。
- **可见文字**：朋友名字（`getByText` exact）、"N of M items assigned"、"Choose at least one friend for every item."、"Sample bill · editable"、"Your photo · review required"、"Offline data"、"Original recognized text"、"translation model · Not downloaded"、"Discount already included"、各种错误提示原文。
- **类名和 testid**：§6.3 第 7 条列出的类名，以及 `data-testid="share-{name}"`、`data-testid="bill-total"`。
- **role 数量**：`role="alert"`/`role="status"` 的数量和触发条件不变（`ocr-flow.spec.ts` 用 `main.getByRole("alert")` 做严格匹配）；`main h1` 仍是每个视图的第一个 h1。

## 7. 测试与验收

### 7.1 几何断言 `tests/e2e/visual-alignment.spec.ts`

用 Chromium 跑，只断言几何和计算样式，不做像素对比。先在 main 上写好并确认失败，改完后再确认通过。

1. **金额列**（375×812，示例账单的小票页）：`.receipt-editor .money` 所有元素的右边缘之差 ≤1px。
2. **桌面对齐**（1280×800，小票页）：`.brand` 左缘、`main` 左缘、底栏第一个按钮左缘三者之差 ≤1px；`Reset bill` 右缘、`main` 右缘、底栏最后一个按钮右缘三者之差也 ≤1px。
3. **最小字号**（375×812，五个步骤各一次）：`main` 内可见、含文字、不在 `[aria-hidden="true"]` 子树中的元素，计算字号 ≥12px。
4. **触控目标**（同上）：`main` 内可见的 `button`、`select`、`summary`、文本类 `input`，以及包着文件 input 的 label，高度都 ≥44px；图标按钮宽度也 ≥44px。
5. **朋友行**（加入 6 个朋友）：每行内名字文字恰好出现一次；非编辑态的行内没有 `input`；6 行的计算背景色两两不同。
6. **无横向溢出**：375px 下五个步骤和照片调整页都满足 `scrollWidth <= innerWidth`。照片调整页使用 `tests/fixtures/receipts/clear-cafe.png`。

### 7.2 CSS 守卫 `src/app/globals.test.ts`（Vitest）

读取 `src/app/globals.css`：

1. 除 `:root { … }` 以外，不出现 `#hex`、`rgb[a](`、`hsl[a](`、`oklch(`、`oklab(`，也不出现颜色关键字 `white`/`black`（允许 `transparent`、`currentColor`）。
2. 不出现小于 12px（或 0.75rem）的 `font-size` 或 `font` 简写。
3. 顶层语句只允许是 `@import`、`@custom-variant`、`@theme`、`:root`、`@layer`。

### 7.3 单元测试与已有检查

- **`person-style.test.ts`**：
  - `personColor(0)` 到 `personColor(5)` 两两不同，`personColor(6) === personColor(0)`。
  - `personInitial("  bea ") === "B"`，`personInitial("张三") === "张"`，`personInitial("") === "?"`。
- **已有检查**：`npm run lint`、`npm test`、`npm run build` 和 `npm run test:e2e`（包括已配置的 WebKit OCR 用例）全部通过。

### 7.4 改前改后记录

开工前在 main 上运行现有 e2e 的多宽度截图（`bill-flow`、`result-explanation`、`weighted-split`、`reset-bill`、`complex-receipts` 的 375/1280 输出），保存在 git 之外；完成后再跑一次。记录写入 `docs/validation/`，包括：

- P1–P11 每一项的改前/改后测量值或截图结论；
- §7.1 的断言结果；
- 颜色、字号、圆角、间距的计数变化。

截图本身不进 git。

## 8. 风险与应对

| 风险 | 应对 |
| --- | --- |
| CSS 分层一次性改变全局的覆盖顺序，多个页面同时变样 | 分层和 token 单独成一个 commit，紧接着跑全量 e2e 并对照截图；问题在进入逐页提交之前修掉 |
| `cn`（tailwind-merge 兼容）误删自定义 utilities | 字号和圆角用 Tailwind 默认名；阴影用任意值写法；朋友标签不走 Button 的 cva |
| 可访问名称或可见文字变化导致 e2e 失败 | §6.4 清单逐项保留；箭头和图标一律 `aria-hidden` |
| 删除朋友后，后面的人颜色前移 | 用户已接受；名字始终可见，颜色不是唯一的信息 |
| 输入框边框加深，观感变"重" | 用户已接受，为了满足 3:1；装饰线保持浅色 |
| 底栏按钮在 375px 下放不下（照片调整页） | Button 允许两行（`text-balance`），e2e 检查无横向溢出 |
| iOS Safari 对 `appearance: none` 的开关和下拉框渲染有差异 | 用 WebKit 项目跑一次 §7.1，并在验证记录里注明 |
| 编辑态改变了改名交互 | 失焦保存的旧行为保留；e2e 未依赖改名输入框；新增的按钮都有可访问名称 |

## 9. 交付

- 从 `main@9d4a0a9` 创建 `feat/ui-visual-alignment`，最后提一个 PR。
- commit 顺序：
  1. 几何断言 e2e（预期失败）
  2. token + 分层 + CSS 守卫
  3. Button/Input/Notice/person-style
  4. 外壳
  5. 首页
  6. 照片调整页
  7. 小票页
  8. 朋友页
  9. 分配页
  10. 结果页
  11. 文档与验证记录
- 每个 commit 后 `npm test` 和相关 e2e 保持通过；第 1 个 commit 中的新断言除外，它们预期失败，按页逐步变绿。
- 不推送生产、不部署；PR 合并后的部署另行决定。
