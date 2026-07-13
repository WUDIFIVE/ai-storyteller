import { z } from 'zod';

export const characterCardSchema = z.object({
  name: z.string().min(1),
  role: z.string().default('人物'),
  traits: z.array(z.string()).default([]),
  relation: z.string().optional()
});

export const episodePayloadSchema = z.object({
  title: z.string().min(1),
  recap: z.string().min(1),
  script: z.string().min(1),
  summary: z.string().min(1),
  characters: z.array(characterCardSchema).default([]),
  keyPoints: z.array(z.string()).default([]),
  nextHook: z.string().min(1)
});

export const chunkSummarySchema = z.object({
  summary: z.string().min(1),
  events: z.array(z.string()).default([]),
  characters: z.array(characterCardSchema).default([]),
  hardTerms: z.array(z.object({
    term: z.string(),
    explanation: z.string()
  })).default([])
});

export type EpisodePayload = z.infer<typeof episodePayloadSchema>;
export type ChunkSummary = z.infer<typeof chunkSummarySchema>;

export function extractJsonObject(content: unknown) {
  if (typeof content !== 'string') throw new Error('模型返回内容为空');
  const source = stripJsonNoise(content);
  const candidates = collectObjectCandidates(source);
  const errors: string[] = [];
  for (const candidate of candidates) {
    for (const repaired of repairCandidates(candidate)) {
      try {
        return JSON.parse(repaired);
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }
  }
  throw new Error(`模型输出不是可解析 JSON 对象：${errors.slice(-3).join(' | ') || 'no object candidate'}`);
}

function stripJsonNoise(input: string) {
  const trimmed = input.trim()
    .replace(/^\uFEFF/, '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1]?.trim();
  return fenced || trimmed;
}

function collectObjectCandidates(source: string) {
  const candidates: string[] = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === '{') {
      if (depth === 0) start = i;
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
      if (depth === 0 && start >= 0) candidates.push(source.slice(start, i + 1));
    }
  }
  if (!candidates.length) {
    const startIdx = source.indexOf('{');
    const endIdx = source.lastIndexOf('}');
    if (startIdx >= 0 && endIdx > startIdx) candidates.push(source.slice(startIdx, endIdx + 1));
  }
  return candidates.sort((a, b) => b.length - a.length);
}

function repairCandidates(jsonLike: string) {
  const normalized = jsonLike
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/,\s*([}\]])/g, '$1')
    .replace(/([}\]])\s*(["{\[])/g, '$1,$2')
    .trim();
  return [jsonLike, normalized];
}
