# AI 说书先生开发路线

## 当前阶段：MVP 产品闭环

已完成：

- 《三国演义》120 章导入，原始文件保留 `server/data/raw/三国演义.txt`
- 结构化数据输出 `server/data/books/sanguo.json`
- 成人 / 儿童模式
- 现代白话 / 评书 / 电视剧解说 / 睡前故事四种风格
- 讲书稿生成接口
- 生成结果落盘缓存
- 最近章节摘要链：生成当前章节时读取前几回已生成摘要
- 本地用户进度：记录继续听的章节、受众和风格
- 浏览器中文 TTS 播放
- 边听边问入口

## 关键接口

### 生成讲书稿

`POST /api/books/:bookId/chapters/:chapterId/episode`

请求：

```json
{
  "audience": "adult",
  "style": "pingshu",
  "refresh": false
}
```

返回结构：`StoryEpisode`

```ts
interface StoryEpisode {
  id: string;
  bookId: string;
  chapterId: string;
  audience: 'adult' | 'child';
  style: 'modern' | 'pingshu' | 'drama' | 'bedtime';
  title: string;
  recap: string;
  script: string;
  summary: string;
  characters: CharacterCard[];
  keyPoints: string[];
  nextHook: string;
  createdAt: string;
}
```

### 用户进度

`GET /api/progress/:bookId?userId=local`

`POST /api/progress/:bookId`

```json
{
  "userId": "local",
  "chapterId": "sanguo-001",
  "audience": "adult",
  "style": "pingshu",
  "seconds": 0
}
```

## 下一阶段建议

### 1. 接入真实 LLM Provider

替换位置：

```text
server/src/ai/provider.ts
```

建议保留当前 `generateEpisode(input)` 函数签名，内部切换不同模型提供方。

### 2. 章节摘要链升级

当前只读取已经生成过的前几回摘要。下一步可以增加独立的章节分析任务：

- chapter_summary
- character_mentions
- relationship_delta
- important_events
- difficult_terms

这样即使用户直接生成第 50 回，也可以提前批处理 1-49 回摘要。

### 3. TTS Provider 抽象

当前前端使用浏览器 Web Speech。后续建议新增：

```text
server/src/tts/provider.ts
```

可支持：

- browser: 前端本地播放
- local: Fish Speech / GPT-SoVITS
- cloud: Azure / 火山 / 其他服务

### 4. 语音提问

新增 ASR：

- 前端录音
- 后端转文字
- 调用问答接口

### 5. 内容安全和儿童模式

儿童模式需要增加规则：

- 弱化血腥细节
- 简化复杂政治斗争
- 避免成人化表达
- 强调勇气、友情、责任、智慧
