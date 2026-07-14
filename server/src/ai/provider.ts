import dotenv from 'dotenv';
import { nanoid } from 'nanoid';
import { Audience, Chapter, CharacterCard, StoryEpisode, StoryStyle } from '../types.js';

dotenv.config({ override: process.env.AI_DOTENV_OVERRIDE === 'true' });

type ProviderInput = {
  bookId: string;
  bookTitle: string;
  sourceLanguage?: string;
  targetLanguage?: string;
  glossary?: Record<string, string>;
  chapter: Chapter;
  audience: Audience;
  style: StoryStyle;
  previous: string;
};

type GenerationStats = {
  startedAt: number;
  provider: string;
  model: string | null;
  chunkSummaryMode: string;
  usedChunkSummaries: boolean;
  chunkFallbacks: number;
};

const providerKind = String(process.env.AI_PROVIDER || 'local').toLowerCase();
const baseUrl = String(process.env.AI_BASE_URL || '').replace(/\/$/, '');
const model = String(process.env.AI_MODEL || '');
const apiKey = String(process.env.AI_API_KEY || '');
const temperature = Number(process.env.AI_TEMPERATURE || 0.55);
const maxTokens = Number(process.env.AI_MAX_TOKENS || 2600);
const chunkSummaryMode = String(process.env.AI_CHUNK_SUMMARY_MODE || 'off').toLowerCase();
const noThink = ['1', 'true', 'yes', 'on'].includes(String(process.env.AI_NO_THINK || 'true').toLowerCase());
const consistencyRetries = Number(process.env.AI_CONSISTENCY_RETRIES || 1);

function hasRemoteProvider() {
  return providerKind === 'openai-compatible' && Boolean(baseUrl && model && apiKey);
}

export function getProviderStatus() {
  const remoteReady = hasRemoteProvider();
  return {
    activeProvider: remoteReady ? 'openai-compatible' : 'local',
    configuredProvider: providerKind,
    baseUrlConfigured: Boolean(baseUrl),
    modelConfigured: Boolean(model),
    apiKeyConfigured: Boolean(apiKey),
    model: model || null,
    chunkSize: 0,
    chunkOverlap: 0,
    maxRetries: 0,
    chunkSummaryMode,
    noThink,
    consistencyRetries,
    outputMode: 'script-only',
    fallbackReason: remoteReady
      ? null
      : providerKind !== 'openai-compatible'
        ? `provider is "${providerKind || 'empty'}", expected "openai-compatible"`
        : !baseUrl
          ? 'base url is empty'
          : !model
            ? 'model is empty'
            : !apiKey
              ? 'api key is empty'
              : null
  };
}

export async function generateEpisode(input: ProviderInput): Promise<StoryEpisode> {
  const stats: GenerationStats = {
    startedAt: Date.now(),
    provider: hasRemoteProvider() ? 'openai-compatible' : 'local',
    model: hasRemoteProvider() ? model : null,
    chunkSummaryMode,
    usedChunkSummaries: false,
    chunkFallbacks: 0
  };

  if (!hasRemoteProvider()) return buildEpisodeFromScript(input, localScript(input), stats);

  let lastError: unknown = null;
  for (let attempt = 0; attempt <= consistencyRetries; attempt += 1) {
    try {
      const script = await generateRemoteScript(input, attempt);
      const episode = buildEpisodeFromScript(input, script, stats);
      validateEpisodeConsistency(input, episode);
      return episode;
    } catch (error) {
      lastError = error;
      if (attempt < consistencyRetries) {
        console.warn('script generation retry:', error instanceof Error ? error.message : String(error));
      }
    }
  }

  console.warn('remote generation fallback to local:', lastError instanceof Error ? lastError.message : String(lastError));
  const fallback = buildEpisodeFromScript(input, localScript(input), { ...stats, provider: `${stats.provider}:fallback-local` });
  return fallback;
}

async function generateRemoteScript(input: ProviderInput, attempt: number) {
  const prompt = buildScriptPrompt(input, attempt);
  const content = await chatText(prompt, maxTokens);
  const script = cleanModelText(content);
  if (script.length < 80) throw new Error(`script too short: ${script.length}`);
  assertNoCrossBookContent(input, script);
  return script;
}

function buildScriptPrompt(input: ProviderInput, attempt: number) {
  const audienceRule = input.audience === 'child'
    ? '目标听众是 6-12 岁儿童：语言温暖、简单、清楚，弱化血腥恐怖和成人化表达，多讲友情、勇气、责任、智慧。'
    : '目标听众是现代成年人：可以严肃呈现战争、权谋、残酷、人性复杂度，但不要猎奇、色情化或写成 18 禁。';
  const styleRule: Record<StoryStyle, string> = {
    modern: '现代白话讲书：清楚、耐听，像朋友把复杂故事讲明白。',
    pingshu: '评书说书：开合有势，节奏鲜明，适合朗读，有悬念但不夸张。',
    drama: '电视剧解说：有镜头感、冲突感、人物动机和连续剧追更感。',
    bedtime: '睡前故事：舒缓、温和、情绪稳定，避免强刺激。'
  };
  const retry = attempt > 0 ? `\n重要纠偏：上一次输出跑偏。请严格只讲当前给定的《${input.bookTitle}》章节，不要输出其他书内容。` : '';
  const text = input.chapter.text.slice(0, 12000);
  return `你是一位 AI 说书先生。你的任务只有一个：把给定章节改写成适合 TTS 朗读的中文讲书正文。\n\n不要输出 JSON。不要输出标题。不要输出字段名。不要 Markdown。只输出正文段落。\n\n书名：《${input.bookTitle}》\n章节：第${input.chapter.index}回《${input.chapter.title}》\n\n${audienceRule}\n讲述风格：${styleRule[input.style]}\n\n前情摘要：\n${input.previous || '暂无，这是开篇。'}\n\n硬性要求：\n1. 只根据下面的当前章节原文讲述，不编造关键情节。\n2. 严禁串书：只能讲当前书名、当前章节和下方原文，不要混入其他书的人物或事件。\n3. 正文要有前情承接、主要情节、人物动机和本回收束。\n4. 成人版 900-1800 字，儿童版 700-1400 字。\n5. 段落自然分隔，方便朗读。${retry}\n\n当前章节原文：\n${text}`;
}

async function chatText(prompt: string, tokens: number) {
  const system = [
    '你是 AI 说书先生。严格根据用户提供的书名、章节和原文生成。',
    '输出纯中文正文，不要 JSON，不要 Markdown，不要解释，不要思考过程。',
    noThink ? '不要使用 <think>；直接给最终正文。/no_think' : ''
  ].filter(Boolean).join('\n');
  const userPrompt = noThink ? `/no_think\n${prompt}` : prompt;
  const body: Record<string, unknown> = {
    model,
    temperature,
    max_tokens: tokens,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: userPrompt }
    ]
  };
  if (noThink) {
    body.enable_thinking = false;
    body.thinking = { type: 'disabled' };
  }

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`AI provider error ${res.status}: ${text.slice(0, 500)}`);
  }
  const data = await res.json() as any;
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new Error('AI provider returned empty content');
  return content;
}

function buildEpisodeFromScript(input: ProviderInput, script: string, stats: GenerationStats): StoryEpisode {
  const characters = extractCharacters(input, script);
  const title = `第${input.chapter.index}回｜${input.chapter.title}`;
  const recap = buildRecap(input);
  const summary = buildSummary(input, script, characters);
  const keyPoints = buildKeyPoints(input, characters);
  const nextHook = buildNextHook(input, characters);
  return {
    id: nanoid(),
    bookId: input.bookId,
    chapterId: input.chapter.id,
    audience: input.audience,
    style: input.style,
    title,
    recap,
    script,
    summary,
    characters,
    keyPoints,
    nextHook,
    createdAt: new Date().toISOString(),
    meta: {
      provider: stats.provider,
      model: stats.model,
      durationMs: Date.now() - stats.startedAt,
      chunkSummaryMode: stats.chunkSummaryMode,
      usedChunkSummaries: stats.usedChunkSummaries,
      chunkFallbacks: stats.chunkFallbacks
    }
  };
}

function buildRecap(input: ProviderInput) {
  if (input.previous) {
    const last = input.previous.split('\n').filter(Boolean).slice(-2).join('；');
    return `前情提要：${last.slice(0, 160)}`;
  }
  const openers: Record<string, string> = {
    sanguo: `这是《${input.bookTitle}》的开篇，故事从东汉末年的动荡局势讲起。`,
    honglou: `这是《${input.bookTitle}》的开篇，故事从真假、梦幻与家族命运的伏笔讲起。`,
    'pride-prejudice': `这是《${input.bookTitle}》的开篇，故事从班纳特一家与一位新邻居的消息讲起。`,
    'sherlock-return': `这是《${input.bookTitle}》的开篇，本案从一个看似不可能的事件和华生的视角展开。`,
    gulliver: `这是《${input.bookTitle}》的开篇，故事从格列佛的经历与远行的起点讲起。`
  };
  return openers[input.bookId] || `这是《${input.bookTitle}》的开篇，故事从本章的主要人物和核心处境讲起。`;
}

function buildSummary(input: ProviderInput, script: string, characters: CharacterCard[]) {
  const names = characters.slice(0, 5).map(c => c.name).join('、');
  const compact = script.replace(/\s+/g, '').slice(0, 180);
  return `第${input.chapter.index}回《${input.chapter.title}》主要围绕${names || '本回人物'}展开：${compact}`;
}

function buildKeyPoints(input: ProviderInput, characters: CharacterCard[]) {
  const points = [`理解「${input.chapter.title}」的核心事件`];
  if (characters.length) points.push(`记住关键人物：${characters.slice(0, 4).map(c => c.name).join('、')}`);
  const adultFocus: Record<string, string> = {
    sanguo: '关注乱世中的权力、立场与人性选择',
    honglou: '关注家族秩序、人物情感与命运伏笔',
    'pride-prejudice': '关注婚姻、阶层、偏见与人物判断',
    'sherlock-return': '关注案件线索、推理转折与人物动机',
    gulliver: '关注旅行见闻背后的讽刺与社会观察'
  };
  points.push(input.audience === 'child' ? '关注人物的勇气、责任与选择' : (adultFocus[input.bookId] || '关注人物动机、关系变化与主题表达'));
  points.push('为下一章/下一回的故事推进建立期待');
  return points;
}

function buildNextHook(input: ProviderInput, characters: CharacterCard[]) {
  const lead = characters[0]?.name ? `${characters[0].name}等人的选择` : '这一回埋下的线索';
  return `下一章，${lead}会继续推动故事向前，新的线索、关系或转折也会逐渐展开。`;
}

function extractCharacters(input: ProviderInput, script: string): CharacterCard[] {
  const source = `${input.chapter.text}\n${script}`;
  const glossaryNames = Object.values(input.glossary || {}).filter(v => /[\u4e00-\u9fa5]/.test(v));
  const candidates = input.bookId === 'sanguo' ? knownSanguoNames() : glossaryNames;
  const names = [...new Set(candidates.filter(n => source.includes(n)))].slice(0, 12);
  return names.map(name => ({
    name,
    role: inferRole(name),
    traits: inferTraits(name),
    relation: '与本章事件相关'
  }));
}

function inferRole(name: string) {
  const roles: Record<string, string> = {
    刘备: '汉室宗亲，故事核心人物之一', 玄德: '刘备的字', 关羽: '刘备结义兄弟之一', 云长: '关羽的字', 张飞: '刘备结义兄弟之一', 翼德: '张飞的字',
    曹操: '乱世枭雄，重要势力代表', 孟德: '曹操的字', 董卓: '权臣与乱局制造者', 吕布: '勇武将领', 袁绍: '诸侯势力代表', 孙坚: '江东势力代表',
    黄巾: '起义势力', 张角: '黄巾起义首领'
  };
  return roles[name] || '本回相关人物';
}

function inferTraits(name: string) {
  const traits: Record<string, string[]> = {
    刘备: ['仁厚', '有志向'], 玄德: ['仁厚', '有志向'], 关羽: ['重义', '勇武'], 云长: ['重义', '勇武'], 张飞: ['豪爽', '勇猛'], 翼德: ['豪爽', '勇猛'],
    曹操: ['果断', '善谋'], 孟德: ['果断', '善谋'], 董卓: ['专横', '残暴'], 吕布: ['勇猛', '反复'], 袁绍: ['有名望', '多疑'], 孙坚: ['果敢', '勇烈']
  };
  return traits[name] || ['推动情节'];
}

function localScript(input: ProviderInput) {
  const gentle = input.audience === 'child';
  const styleLead: Record<StoryStyle, string> = {
    modern: '今天我们用现代人的话，来听懂这一回。',
    pingshu: `列位，书接上文，《${input.bookTitle}》这一章的故事继续展开。`,
    drama: `如果把这一章拍成电视剧，镜头会先落在人物所处的环境与关系上。`,
    bedtime: '今晚，我们慢慢讲一个发生在很久以前的故事。'
  };
  const raw = input.chapter.text.replace(/\s+/g, '');
  const slices = raw.match(/.{1,100}/g)?.slice(0, 8) || [raw.slice(0, 300)];
  return [
    styleLead[input.style],
    input.previous ? `先简单回顾一下：${input.previous.split('\n').slice(-2).join('；')}` : buildRecap(input),
    gentle ? '小朋友可以把它想象成：我们要认识一群人物，看看他们如何面对自己的问题。' : '这一章真正重要的，不只是发生了什么，也包括人物为什么这样选择。',
    ...slices.map((s, i) => `第${i + 1}幕：${s}。这里可以看出，故事正在把时代背景、人物选择和未来冲突一点点铺开。`),
    gentle ? '这一集我们先记住：每个人的选择，都会把故事带向不同的方向。' : `所以这一章像是《${input.bookTitle}》的一个关键入口：人物关系、情节线索和主题意味都开始向前推进。`
  ].join('\n\n');
}

function cleanModelText(content: string) {
  return content
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/^```(?:text|markdown)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .replace(/^正文[:：]\s*/i, '')
    .trim();
}

function validateEpisodeConsistency(input: ProviderInput, episode: StoryEpisode) {
  if (input.bookId !== 'sanguo') return;
  const text = [episode.title, episode.recap, episode.script, episode.summary, episode.nextHook, episode.keyPoints.join(' '), episode.characters.map(c => c.name).join(' ')].join('\n');
  assertNoCrossBookContent(input, text);
  const anchors = chapterAnchors(input);
  if (anchors.length && !anchors.some(a => text.includes(a))) {
    throw new Error(`输出缺少当前章节锚点：${anchors.slice(0, 8).join('、')}`);
  }
}

function assertNoCrossBookContent(input: ProviderInput, text: string) {
  const forbiddenByBook: Record<string, string[]> = {
    sanguo: ['孙悟空', '悟空', '唐僧', '猪八戒', '沙僧', '天宫', '蟠桃', '玉皇', '玉皇大帝', '观音', '如来', '取经', '林黛玉', '贾宝玉', '武松', '宋江'],
    honglou: ['孙悟空', '唐僧', '猪八戒', '天宫', '蟠桃', '刘备', '关羽', '张飞', '曹操', '福尔摩斯', '达西先生'],
    'pride-prejudice': ['孙悟空', '唐僧', '刘备', '关羽', '张飞', '曹操', '贾宝玉', '林黛玉', '福尔摩斯', '格列佛'],
    'sherlock-return': ['孙悟空', '唐僧', '刘备', '关羽', '张飞', '曹操', '贾宝玉', '林黛玉', '达西先生', '格列佛'],
    gulliver: ['孙悟空', '唐僧', '刘备', '关羽', '张飞', '曹操', '贾宝玉', '林黛玉', '达西先生', '福尔摩斯']
  };
  const forbidden = forbiddenByBook[input.bookId] || [];
  const hit = forbidden.find(word => text.includes(word));
  if (hit) throw new Error(`输出疑似串书，包含禁词「${hit}」`);
}

function chapterAnchors(input: ProviderInput) {
  const names = knownSanguoNames().filter(n => input.chapter.text.includes(n));
  return [...new Set([...names, ...tokenizeTitle(input.chapter.title)])].slice(0, 16);
}

function tokenizeTitle(title: string) {
  const cleaned = title.replace(/[，。、“”‘’：:；;！!？?（）()\s]/g, ' ');
  const chunks = cleaned.split(/\s+/).filter(Boolean);
  const tokens = new Set<string>();
  for (const chunk of chunks) {
    if (chunk.length <= 4) tokens.add(chunk);
    for (let i = 0; i <= chunk.length - 2; i += 2) tokens.add(chunk.slice(i, Math.min(i + 4, chunk.length)));
  }
  return [...tokens].filter(t => t.length >= 2).slice(0, 12);
}

function knownSanguoNames() {
  return ['刘备', '玄德', '关羽', '云长', '张飞', '翼德', '曹操', '孟德', '孙权', '孙坚', '孙策', '诸葛亮', '孔明', '董卓', '袁绍', '袁术', '吕布', '赵云', '司马懿', '陶谦', '孔融', '马腾', '何进', '王允', '貂蝉', '李傕', '郭汜', '公孙瓒', '黄巾', '张角'];
}
