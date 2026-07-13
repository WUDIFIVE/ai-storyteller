import { Audience, Chapter, StoryStyle } from '../types.js';
import { ChunkSummary } from './schema.js';

export type PromptInput = {
  bookTitle: string;
  chapter: Chapter;
  audience: Audience;
  style: StoryStyle;
  previous: string;
};

export function styleInstruction(style: StoryStyle) {
  const styleRule: Record<StoryStyle, string> = {
    modern: '现代白话讲书：清楚、耐听，像朋友把复杂故事讲明白。',
    pingshu: '评书说书：开合有势，节奏鲜明，适合朗读，有悬念但不夸张。',
    drama: '电视剧解说：有镜头感、冲突感、人物动机和连续剧追更感。',
    bedtime: '睡前故事：舒缓、温和、情绪稳定，避免强刺激。'
  };
  return styleRule[style];
}

export function audienceInstruction(audience: Audience) {
  return audience === 'child'
    ? '目标听众是 6-12 岁儿童。语言温暖、简单、清楚。弱化血腥、恐怖、成人化表达和过深权谋，多讲友情、勇气、责任、智慧。'
    : '目标听众是现代成年人。语言现代、有节奏，解释人物动机、历史背景和关系变化，但不改变原著。';
}

export function buildChunkSummaryPrompt(input: PromptInput & { chunk: string; chunkIndex: number; chunkCount: number }) {
  return `你是中国古典名著章节分析助手。请分析《${input.bookTitle}》第${input.chapter.index}回《${input.chapter.title}》的第 ${input.chunkIndex}/${input.chunkCount} 个片段。

要求：
1. 忠实原文，不编造。
2. 只提取这个片段真实出现或明确涉及的信息。
3. 输出严格 JSON 对象，不要 Markdown，不要代码块。

原文片段：
${input.chunk}

JSON 结构：
{
  "summary": "本片段摘要，80-180 字",
  "events": ["事件 1", "事件 2"],
  "characters": [
    { "name": "人物名", "role": "本片段身份或作用", "traits": ["表现"], "relation": "与事件或其他人物关系" }
  ],
  "hardTerms": [
    { "term": "难词", "explanation": "简明解释" }
  ]
}`;
}

export function buildEpisodePrompt(input: PromptInput & { chunkSummaries?: ChunkSummary[] }) {
  const chunkMemory = input.chunkSummaries?.length
    ? input.chunkSummaries.map((s, i) => `片段${i + 1}摘要：${s.summary}\n事件：${s.events.join('；')}\n人物：${s.characters.map(c => `${c.name}(${c.role})`).join('、')}`).join('\n\n')
    : `当前章节原文：\n${input.chapter.text.slice(0, 9000)}`;

  return `你是一位擅长讲中国古典名著的 AI 说书先生。请把章节改写成适合 TTS 朗读的讲书稿。

核心要求：
1. 忠实原著，不编造关键情节，不改变人物关系和结局。
2. 不逐字翻译全文，要讲成有节奏、有画面、有前后承接的故事。
3. 每段不要太长，句子适合 TTS 朗读。
4. 开头用 2-3 句前情提要，不冗余。
5. 人物关系要清楚，但不要凭空制造关系。
6. 只输出 JSON 对象，不要 Markdown，不要代码块。

${audienceInstruction(input.audience)}
讲述风格：${styleInstruction(input.style)}

书名：${input.bookTitle}
章节：第${input.chapter.index}回 ${input.chapter.title}

前面几回摘要：
${input.previous || '暂无，这是开篇。'}

当前章节分析材料：
${chunkMemory}

请严格输出如下 JSON 结构：
{
  "title": "本集标题，包含章节序号和回目",
  "recap": "前情提要，80-160 字，不冗余",
  "script": "正文讲述稿，适合朗读。成人版 1200-2200 字，儿童版 900-1600 字。用自然段分隔。",
  "summary": "本章摘要，120-220 字，用于后续章节记忆链",
  "characters": [
    { "name": "人物名", "role": "本回中的身份或作用", "traits": ["性格或表现 1", "性格或表现 2"], "relation": "与本回主要事件或其他人物的关系" }
  ],
  "keyPoints": ["本集重点 1", "本集重点 2", "本集重点 3"],
  "nextHook": "下一集悬念，40-100 字"
}`;
}
