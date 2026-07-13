import fs from 'node:fs/promises';
import path from 'node:path';
import { Audience, StoryEpisode, StoryStyle } from '../types.js';

const dir = path.resolve('server/data/generated');

function episodePath(bookId: string, chapterId: string, audience: Audience, style: StoryStyle) {
  return path.join(dir, `${bookId}_${chapterId}_${audience}_${style}.json`);
}

export async function getEpisode(bookId: string, chapterId: string, audience: Audience, style: StoryStyle) {
  try {
    return JSON.parse(await fs.readFile(episodePath(bookId, chapterId, audience, style), 'utf-8')) as StoryEpisode;
  } catch {
    return null;
  }
}

export async function saveEpisode(ep: StoryEpisode) {
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(episodePath(ep.bookId, ep.chapterId, ep.audience, ep.style), JSON.stringify(ep, null, 2));
  return ep;
}

export async function previousEpisodes(bookId: string, chapterIndex: number, audience: Audience, style: StoryStyle, limit = 5) {
  const files = await fs.readdir(dir).catch(() => [] as string[]);
  const prefix = `${bookId}_`;
  const episodes: StoryEpisode[] = [];
  for (const f of files) {
    if (!f.startsWith(prefix) || !f.endsWith(`_${audience}_${style}.json`)) continue;
    try {
      episodes.push(JSON.parse(await fs.readFile(path.join(dir, f), 'utf-8')) as StoryEpisode);
    } catch {}
  }
  return episodes
    .filter(e => Number(e.chapterId.split('-').pop()) < chapterIndex)
    .sort((a, b) => Number(a.chapterId.split('-').pop()) - Number(b.chapterId.split('-').pop()))
    .slice(-limit);
}

export async function previousSummaries(bookId: string, chapterIndex: number, audience: Audience, style: StoryStyle, limit = 5) {
  const episodes = await previousEpisodes(bookId, chapterIndex, audience, style, limit);
  return episodes.map(e => `第${Number(e.chapterId.split('-').pop())}回：${e.summary}`).join('\n');
}
