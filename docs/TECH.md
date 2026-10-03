# 电子书阅读器 · 技术方案

版本：v0.1 草案　|　日期：2026-10-03　|　对应产品文档：[PRODUCT.md](../PRODUCT.md)

## 1. 选型结论

| 层面 | 选择 | 理由 |
| --- | --- | --- |
| 应用形态 | 浏览器本地打开的单页应用（不打包桌面壳） | 产品的唯一目标是"读完第一本书"；Electron 的核心优势（常驻文件句柄）是产品文档第 8 节主动放弃的代价，不值得为它付构建与 100MB+ 运行时的税。迁移路径见第 9 节。 |
| 语言 | 原生 JavaScript（ES Modules） | 浏览器与 `node --test` 可以加载同一份文件，零构建；逻辑规模小，类型收益有限。后续若模块膨胀，可无痛切 TS + Vite。 |
| 框架 | 不用 React/Vue | 视图状态只有"当前章 + 当前屏"，没有复杂状态树；按章渲染靠直接操作 DOM 即可。 |
| 编码解码 | 浏览器/Node 原生 `TextDecoder`（`utf-8`、`gb18030`） | 满足产品"不引第三方库"的约束；`gb18030` 是 GBK 的超集，一份解码器覆盖两种请求。 |
| 持久化 | `localStorage` | 只存一个进度对象和几个排版设置，够用；IndexedDB 留给 v0.2 书架。 |
| 测试 | `node --test` + 固定样张 fixtures | 覆盖三个纯函数；浏览器交互按产品文档约定手工验收，不引 Playwright。 |

## 2. 目录结构

```
/
  index.html          # 唯一页面：阅读器骨架
  styles.css          # 主题变量 + 排版
  src/
    encoding.js       # 纯函数：字节 → 文本（编码探测）
    chapters.js       # 纯函数：文本 → 章节表
    offset.js         # 纯函数：字符偏移 ↔ (章序号, 章内偏移, 归一化比例)
    app.js            # 唯一有副作用的模块：文件读取、渲染、翻页、进度存取
  tests/
    encoding.test.js
    chapters.test.js
    offset.test.js
    fixtures/         # UTF-8 / UTF-8 BOM / GBK 三种编码样张（提交进仓库）
  docs/
    TECH.md             # 本技术方案（产品设计文档 PRODUCT.md 在仓库根目录）
```

约定：`encoding.js`、`chapters.js`、`offset.js` 不引用任何浏览器 API，import 后即可在 Node 下测试；所有 DOM、File、localStorage 副作用集中在 `app.js`，它不进单测。

## 3. 数据模型

全书唯一权威位置是**字符偏移**（不是像素、不是行号）：

```js
Book      = { name, byteSize, lastModified, text, chapters }
Chapter   = { index, title, start, end }   // [start, end) 为 text 内的字符偏移
Progress  = { bookKey, charOffset }         // 归一化比例 = charOffset / text.length，仅用于展示
Settings  = { fontSize, lineHeight }        // 全局，与具体书无关
bookKey   = `${name}:${byteSize}:${lastModified}`
```

- `Progress` 存 `localStorage["reader:" + bookKey]`，JSON 序列化。
- 章节表整体存在内存里即可；`text` 是解码后的完整字符串（5MB 级文件在桌面浏览器无压力，这是产品"避开虚拟滚动"的前提）。
- 字号/行距/窗口尺寸变化只影响渲染，不回写 `Progress`——这正是"存偏移不存像素"要保住的不变量。

## 4. 三个纯函数

### 4.1 编码探测 `decode(bytes: Uint8Array): string`

按产品文档的顺序，逐级失败降级：

1. 读前 3 字节 BOM：`EF BB BF` → 按 UTF-8 解码并跳过 BOM。
2. 无 BOM → `new TextDecoder('utf-8', { fatal: true }).decode(bytes)`；抛 `TypeError` 视为失败。
3. 失败 → `new TextDecoder('gb18030').decode(bytes)` 兜底（非 fatal，理论上不抛）。

Node 侧 `TextDecoder` 同样内建 `gb18030`（Node ≥ 18），测试环境与浏览器行为一致。

### 4.2 章节识别 `detectChapters(text: string): Chapter[]`

- 逐行扫描，行长度（去首尾空白后）≤ 30 字才参与匹配，收紧误判面。
- 匹配模式（行首锚定）：
  - `第X章 / 节 / 回 / 卷`，X 支持阿拉伯数字与中文数字（零一二…百千万）；
  - 独立成行的：序、序言、前言、楔子、引子、后记、尾声、番外（含"番外一"等变体）。
- 章节 `start` = 标题行起点，`end` = 下一章标题行起点（末章到文末）；标题本身不计入正文渲染。
- 识别结果为 0 章时，退化为单章（整本书一章），保证"能读"底线，对应产品风险第 2 条。

### 4.3 偏移换算 `locate(chapters, charOffset)` 与 `chapterStart(chapters, index)`

- `locate`：二分查找得 `(章序号, 章内偏移, 全书归一化比例)`，供进度显示（第 37 章 / 共 120 章）与恢复校验。
- `clamp`：偏移超出 `text.length`（文件被改动后 key 未命中之外的边角）时收敛到安全值。
- 章末翻页的"自动接下一章"由 `offset.js` 给出下一合法起点，渲染动作在 `app.js`。

## 5. 渲染与翻页

- **渲染单位是章**：当前章切成段落 `<p>`，每个 `<p>` 带 `data-start="字符偏移"`。切章时整段替换容器内容，天然避开虚拟滚动。
- **翻页 = 视口高度的滚动**（空格 / 右方向键 / 右侧热区 / 上滑）：滚动后取视口顶部段落 `anchor + 段内按比例估算` 得到新 `charOffset`，写回内存；`localStorage` 在每次章切换与页面 `visibilitychange/pagehide` 时落盘，避免每屏一次写盘。
- **位置恢复 = 反向操作**：载入书后由 `charOffset` 找 `locate` → 渲染该章 → 找到 `data-start <= charOffset` 的最后一个 `<p>`，把它滚动到视口顶部。字号档位切换后重走一遍"反向恢复"，即验收项"字号切换后位置仍能还原"。
- 段内精确位置 v0.1 用"段落起点 + 视口估算"即可（段落级恢复体感已足够）；若一周自用中发现长段落内跳位刺眼，再在 M3 记录为 v0.2 候选（用 Range 逐字符测量）。
- 触屏滑动与左右热区只是同一 `turn(delta)` 函数的不同事件绑定。

## 6. 主题变量层

`styles.css` 根部只定义六个变量，v0.1 填一套明色：

```css
:root {
  --bg: #faf8f4;        /* 页面底色（米白） */
  --fg: #2b2b2b;        /* 正文（深灰） */
  --muted: #8a8578;     /* 次要文字：进度、章节数 */
  --accent: #a0522d;    /* 高亮：当前章标题、热区反馈 */
  --panel: #f2efe8;     /* 目录抽屉 / 设置条 */
  --border: #ddd6c9;    /* 分隔线 */
}
```

排版三件套走独立变量或 data 属性：`--font-size`（小/中/大三档）、`--line-height`（1.6/1.9 两档）、正文最大宽度（`max-width: 42em` 级别）。加暗色主题时只需新增一组 `:root[data-theme]` 赋值，不动任何 JS。

## 7. 测试方案

| 对象 | 用例要点 |
| --- | --- |
| `encoding.js` | 三种编码样张各一（UTF-8、UTF-8 BOM、GBK），断言解码文本一致；乱码字节不抛异常走 gb18030 兜底；空文件返回空串。 |
| `chapters.js` | 覆盖：中文数字章节、阿拉伯数字章节、序/楔子/后记/尾声/番外；>30 字的疑似标题行不误判；正文中"他说：第一章节很重要"式干扰不切分；0 命中退化为单章。 |
| `offset.js` | 章边界（start=0、恰在下一章首字符）、越界收敛、归一化比例单调性；随机偏移往返测试（`chapterStart` → `locate` 一致）。 |

- fixtures 为提交进仓库的二进制样张（GBK 样张用一次性脚本生成后入库，不在 CI/测试里重复生成）。
- 运行：`node --test tests/`。每个里程碑合入前必须全绿（AGENTS.md 第 2 条）。
- 浏览器侧手工验收清单按产品文档第 4 节表格逐条勾：5MB 文件、连续 50 屏、刷新恢复、字号切换恢复。

## 8. 里程碑对应

1. **M0**：`index.html` + `styles.css`（六变量就位）+ `app.js` 渲染固定文本；`tests/` 目录与 `node --test` 跑通空用例。
2. **M1**：`encoding.js` / `chapters.js` / `offset.js` 三模块 + 各自测试 + fixtures；`app.js` 串起打开（选择/拖拽）、按章渲染、翻页、位置恢复。
3. **M2**：排版档位切换（触发位置还原回归）、目录抽屉与跳章、进度文案；补齐手工验收记录。
4. **M3**：自用一周，痛点回写产品文档，据此定 v0.2 范围。

每个里程碑一个 commit；纯函数模块做到"实现 commit 与测试 commit"同 PR 粒度内完成。

## 9. 桌面壳迁移路径（暂不执行）

v0.1 保持纯前端是刻意的。以下信号出现时再评估 Electron / Tauri：

- 确认通勤阅读场景 → 需要更稳的手势与免"重新选文件"的冷启动；
- v0.2 做书架 → 需要持久文件句柄（浏览器侧可先试 File System Access API + IndexedDB 存 handle，覆盖不了再上桌面壳）；
- 出现几十 MB 级文件 → 需要 Node 流式分块读取。

迁移成本受控的原因：三个核心函数与数据模型本来就是运行时无关的纯 JS，届时原样搬进主进程或共享包，只有 `app.js` 的 I/O 层需要换实现。

## 10. 开放问题

- 第一本试读书的编码与大小（决定 4.1 是否要加宽松回退、5 节是否要按屏预渲染下一章尾部）。
- 段落级恢复的精度是否够用，留到 M3 用真实体感回答。
