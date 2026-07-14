# AI 说书先生

AI 说书先生是一个开源的经典阅读与一键朗读 Web App。它的目标不是做一个问答助手，也不是做一个音频下载站，而是把难读、长篇、语言门槛较高的经典文本，转化成现代人和孩子都更容易进入的“讲述版阅读内容”。

用户可以选择书籍和章节，生成一篇适合阅读、也适合浏览器朗读的讲书稿：想自己看就自己看，想偷懒就点一下“朗读”，让手机或电脑浏览器读给你听。

> 当前定位：阅读内容优先，一键朗读辅助。

## Screenshots

后续可以把产品截图放在：

```text
docs/images/
```

建议预留：

```text
docs/images/home.png
docs/images/reader.png
docs/images/graph.png
docs/images/mobile.png
```

## 为什么做这个项目

很多经典作品很重要，但现代读者很难稳定读下去：

- 古典名著有文言、半文言、古白话，门槛高；
- 外国名著原文或译名不统一，进入成本高；
- 长篇小说人物多、关系复杂，容易忘；
- 短视频时代注意力碎片化，完整阅读越来越难；
- 儿童也适合接触经典，但需要更温和、更清楚的讲法。

AI 说书先生试图做一件事：

```text
把经典作品讲清楚、讲好听、讲得能继续读下去。
```

## 核心思路

一开始我们尝试让模型直接输出完整 JSON，但实践后发现不稳定：模型容易输出坏 JSON、串书、耗时长。现在项目采用更稳的工程分工：

```text
模型只负责最有价值的部分：生成讲书正文。
程序负责结构化：标题、前情提要、摘要、人物、重点、下一章悬念。
规则负责安全与一致性：防串书、固定译名、章节缓存、人物图谱。
浏览器负责朗读：声音在用户自己的手机/电脑里播放。
```

也就是说，模型不是万能后端，而是“讲述稿生成器”。能用规则稳定完成的事情，不交给模型。

## 当前内置书籍

仓库已包含原文和结构化章节数据：

| 书籍 | ID | 语言 | 说明 |
| --- | --- | --- | --- |
| 三国演义 | `sanguo` | 中文 | 章回体历史演义，适合评书风格和人物图谱 |
| 红楼梦 | `honglou` | 中文 | 人物关系复杂，适合细腻讲述和图谱 |
| 傲慢与偏见 | `pride-prejudice` | 英文原文 -> 中文讲述 | 使用固定译名表 |
| 福尔摩斯归来记 | `sherlock-return` | 英文原文 -> 中文讲述 | 13 个故事，适合悬疑讲述 |
| 格列佛游记 | `gulliver` | 英文原文 -> 中文讲述 | 旅行与讽刺故事 |

英文原文不会被覆盖翻译。项目保留英文 source，通过固定译名表约束模型生成中文讲述。

## 核心功能

### 1. 书籍与章节

- 书架展示多本书；
- 按章节阅读；
- 记录继续听/继续读位置；
- 支持中文章回体和英文 Project Gutenberg 类文本导入。

### 2. AI 讲书稿生成

- 成人深读：保留复杂人性、时代背景、战争/权谋/情感层次；
- 儿童柔化：弱化血腥、恐怖、成人化表达，强调友情、勇气、责任、智慧；
- 支持风格：现代白话、评书说书、电视剧解说、睡前故事；
- 模型只输出正文，结构由程序组装，降低坏 JSON 风险。

### 3. 阅读体验

- 正文阅读优先；
- 字号调节；
- 行距调节；
- 当前朗读段落高亮；
- 自动滚动到当前朗读段落；
- 下一回 / 下一回并朗读。

### 4. 一键朗读

- 使用浏览器 Web Speech API；
- 声音在用户手机/电脑浏览器中播放，不依赖 Linux 服务器声卡；
- 支持音色、语速、音调；
- 移动端通常需要用户点击后才能播放。

### 5. 固定译名表

英文书通过 `server/data/glossaries/*.json` 固定人名、地名和作品专名，例如：

- Elizabeth Bennet -> 伊丽莎白·班纳特
- Mr. Darcy -> 达西先生
- Sherlock Holmes -> 夏洛克·福尔摩斯
- Baker Street -> 贝克街
- Lemuel Gulliver -> 莱缪尔·格列佛

这样能避免同一本书里译名飘忽不定。

### 6. 轻量人物图谱

人物图谱不是重型图数据库，而是从已生成章节中汇总出的 JSON 图：

```ts
{
  nodes: [
    { id: '刘备', appearances: 5, chapters: ['sanguo-001'] }
  ],
  links: [
    { source: '刘备', target: '关羽', weight: 3 }
  ]
}
```

它用于辅助阅读：谁出现过、和谁经常同章出现、在哪些章节出现。

### 7. 批量预热

可以提前生成前 N 章内容，之后打开章节会直接读取缓存。

- 支持按当前书预热；
- 有任务状态和日志；
- 某一章失败不会中断全部任务。

## 技术栈

- Frontend: React + Vite + TypeScript
- Backend: Express + TypeScript
- AI Provider: OpenAI-compatible Chat Completions
- TTS: Browser Web Speech API
- Storage: Local JSON files
- Book data: Raw text + structured chapter JSON
- Graph: Lightweight JSON graph generated from episode character cards

## 项目结构

```text
src/
  main.tsx                    # React 单页应用
  styles.css                  # UI 样式

server/
  src/
    index.ts                  # Express API
    ai/provider.ts            # 讲书正文生成与规则组装
    content/books.ts          # 书籍、章节、译名表读取
    store/episodes.ts         # 生成结果缓存
    store/graph.ts            # 轻量人物图谱
    store/progress.ts         # 本地阅读进度
    jobs/prewarm.ts           # 批量预热任务
  scripts/
    ingest-sanguo.ts          # 三国导入脚本
    ingest-book.ts            # 通用书籍导入脚本
  data/
    raw/                      # 原始全文 txt，入仓
    books/                    # 结构化章节 JSON，入仓
    glossaries/               # 固定译名表，入仓
    generated/                # 生成缓存，本地忽略
    progress/                 # 本地进度，本地忽略

docs/images/                  # README 图片预留目录
```

## 快速开始

```bash
npm install
npm run dev
```

打开：

```text
http://localhost:5173/
```

Vite 会把 `/api` 代理到后端 `http://localhost:8787`。

## 配置模型

复制示例配置为本地配置文件，然后填入自己的模型服务信息。真实本地配置文件不会提交到 Git。

```bash
cp .env.example .env
```

推荐配置：

```bash
AI_PROVIDER=openai-compatible
AI_BASE_URL=https://your-openai-compatible-endpoint/v1
AI_MODEL=your-model-name
AI_API_KEY=your-private-key

AI_TEMPERATURE=0.45
AI_MAX_TOKENS=2600
AI_NO_THINK=true
AI_CHUNK_SUMMARY_MODE=off
AI_CONSISTENCY_RETRIES=1
```

如果不配置模型，项目会使用本地规则生成器，方便开源用户先跑通流程。

## 导入更多书籍

### 中文章回体

```bash
npm run ingest:book -- --id=xiyou --title=西游记 --author=吴承恩 --raw=server/data/raw/西游记.txt --source-language=zh
```

### 英文原文，中文讲述

```bash
npm run ingest:book -- --id=pride-prejudice --title=傲慢与偏见 --author="Jane Austen" --raw=server/data/raw/傲慢与偏见.txt --source-language=en --glossary=server/data/glossaries/pride-prejudice.json
```

导入器会尽量识别：

- 第 X 回 / 第 X 章 / 第 X 节 / 第 X 卷
- CHAPTER I
- PART I
- THE ADVENTURE OF ...

如果没有明显章节标记，会按段落长度粗分。

## API 概览

```text
GET  /api/health
GET  /api/books
GET  /api/books/:bookId/chapters
GET  /api/books/:bookId/chapters/:chapterId/episode
POST /api/books/:bookId/chapters/:chapterId/episode
GET  /api/books/:bookId/graph
GET  /api/jobs
GET  /api/jobs/:jobId
POST /api/books/:bookId/prewarm
GET  /api/progress/:bookId
POST /api/progress/:bookId
```

## Git 与数据说明

入仓：

- `server/data/raw/*.txt`
- `server/data/books/*.json`
- `server/data/glossaries/*.json`

不入仓：

- `.env`
- `server/data/generated/*.json`
- `server/data/progress/`
- `dist/`
- `node_modules/`

这样用户 clone 后可以直接看到内置书籍；同时不会带上你的模型密钥、本地生成缓存和阅读进度。

## 路线图

- [ ] 移动端阅读布局继续优化
- [ ] 阅读设置持久化
- [ ] 自动下一章开关
- [ ] 更丰富的固定译名表
- [ ] 图谱关系类型：敌对、亲属、师友、婚恋、阵营
- [ ] 可选云端朗读引擎
- [ ] 更多经典作品

## License

AGPL-3.0-or-later
