# AI 说书先生

一个开源的 AI 名著讲书产品原型：把《三国演义》《西游记》《红楼梦》等经典名著，讲成现代人和孩子都听得懂、听得进去的连续故事。

当前 MVP 聚焦《三国演义》：

- 内置书籍与章节列表
- 支持导入本地无噪声《三国演义》全文
- 按“第 X 回”自动切分章节
- 生成成人版 / 儿童版讲书稿
- 支持现代白话、评书、电视剧解说、睡前故事四种风格
- 每集包含前情提要、正文讲述、本集重点、人物关系、下一集悬念
- 浏览器 Web Speech TTS：优先选择系统中文音色
- 边听边问的问答入口占位
- 无外部模型也能用本地规则生成器跑通完整功能

## 快速开始

```bash
npm install
npm run dev
```

打开 Vite 显示的本地地址即可。

## 导入完整《三国演义》

把你手上的无噪声全文保留原始书名，放到：

```bash
server/data/raw/三国演义.txt
```

然后运行：

```bash
npm run ingest:sanguo
```

脚本会生成：

```bash
server/data/books/sanguo.json
```

原始文件名保留为中文书名，生成的结构化 JSON 仍固定为 `sanguo.json`，方便代码引用与后续追溯。

## 推荐后续接入真实模型

当前仓库为了开源演示和安全，默认使用本地规则生成器。后续建议在 `server/src/ai/provider.ts` 中接入任意 OpenAI-compatible 服务、DeepSeek、通义、智谱或本地模型。

建议 Provider 输入保持：

- 书名
- 当前章节原文
- 当前章节标题
- 前几回摘要
- 目标听众 adult / child
- 讲述风格 modern / pingshu / drama / bedtime

输出保持 `StoryEpisode` 结构即可。

## 为什么先用浏览器 TTS

这个项目是开源、不收费方向。MVP 阶段先使用浏览器内置 Web Speech：

- 零后端音频成本
- 不需要复杂音色授权
- 常见系统有中文普通话音色
- 可以完整验证“讲书稿 + 播放器 + 进度/人物卡”的产品体验

后续可以扩展：

- Edge / Azure Speech
- 火山引擎 TTS
- Fish Speech / GPT-SoVITS 自托管
- ElevenLabs 或其他云端 TTS
- 父母授权音色克隆

## 项目结构

```text
server/
  scripts/ingest-sanguo.ts      # 三国全文导入脚本
  src/content/books.ts          # 书籍与章节读取
  src/ai/prompt.ts              # 讲书提示词
  src/ai/provider.ts            # 生成器接口，默认本地规则版
  src/store/episodes.ts         # 生成结果缓存
  src/index.ts                  # Express API
src/
  main.tsx                      # React 单页应用
  styles.css                    # UI 样式
```

## 路线图

- [ ] 接入真实 LLM Provider
- [ ] 章节级摘要链：生成第 N 回时自动读取前 N-1 回摘要
- [ ] 人物关系图谱持久化
- [ ] 用户播放进度与收藏
- [ ] SRT 字幕与音频时间轴
- [ ] 云端朗读引擎与朗读缓存
- [ ] Whisper / ASR 语音提问
- [ ] 多书籍导入：西游记、红楼梦、水浒传
- [ ] 儿童内容安全策略与家长模式

## License

AGPL-3.0-or-later

## 导入更多书籍

通用导入脚本支持按“第 X 回/章/节/卷”切分；如果没有明显章节标记，会按段落长度粗分。

```bash
npm run ingest:book -- --id=xiyou --title=西游记 --author=吴承恩 --raw=server/data/raw/西游记.txt
npm run ingest:book -- --id=honglou --title=红楼梦 --author=曹雪芹 --raw=server/data/raw/红楼梦.txt
npm run ingest:book -- --id=pride-prejudice --title=傲慢与偏见 --author=Jane\ Austen --raw=server/data/raw/傲慢与偏见.txt
```

推荐下一批书：

- 《西游记》：故事性强，儿童/成人都适合。
- 《红楼梦》：人物关系和情绪层次丰富，适合测试图谱与细腻讲述。
- 《水浒传》：人物群像和章节冲突明显。
- 《小王子》：篇幅短，适合测试儿童/成人双版本。
- 《傲慢与偏见》：适合测试外文小说的现代中文讲述。
- 《福尔摩斯探案集》：适合连续故事和悬念讲述。
- 《鲁滨逊漂流记》：冒险叙事清晰，适合儿童版。
