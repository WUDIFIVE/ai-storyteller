import fs from 'node:fs/promises';
import path from 'node:path';
import { StoryEpisode } from '../types.js';

const generatedDir = path.resolve('server/data/generated');

export type CharacterGraph = {
  bookId: string;
  generatedAt: string;
  nodes: Array<{
    id: string;
    name: string;
    appearances: number;
    chapters: string[];
    roles: string[];
    traits: string[];
  }>;
  links: Array<{
    source: string;
    target: string;
    weight: number;
    chapters: string[];
  }>;
};

function uniq<T>(items: T[]) {
  return [...new Set(items.filter(Boolean))];
}

function pairKey(a: string, b: string) {
  return [a, b].sort().join('::');
}

export async function buildCharacterGraph(bookId: string): Promise<CharacterGraph> {
  const files = await fs.readdir(generatedDir).catch(() => [] as string[]);
  const episodes: StoryEpisode[] = [];
  for (const file of files) {
    if (!file.startsWith(`${bookId}_`) || !file.endsWith('.json')) continue;
    try {
      const ep = JSON.parse(await fs.readFile(path.join(generatedDir, file), 'utf-8')) as StoryEpisode;
      if (ep.bookId === bookId) episodes.push(ep);
    } catch {
      // ignore broken generated files
    }
  }

  const nodeMap = new Map<string, { name: string; chapters: string[]; roles: string[]; traits: string[] }>();
  const linkMap = new Map<string, { source: string; target: string; chapters: string[] }>();

  for (const ep of episodes) {
    const names = uniq((ep.characters || []).map(c => c.name?.trim()).filter(Boolean));
    for (const c of ep.characters || []) {
      const name = c.name?.trim();
      if (!name) continue;
      const current = nodeMap.get(name) || { name, chapters: [], roles: [], traits: [] };
      current.chapters.push(ep.chapterId);
      if (c.role) current.roles.push(c.role);
      current.traits.push(...(c.traits || []));
      nodeMap.set(name, current);
    }
    for (let i = 0; i < names.length; i += 1) {
      for (let j = i + 1; j < names.length; j += 1) {
        const key = pairKey(names[i], names[j]);
        const current = linkMap.get(key) || { source: names[i], target: names[j], chapters: [] };
        current.chapters.push(ep.chapterId);
        linkMap.set(key, current);
      }
    }
  }

  const nodes = [...nodeMap.values()].map(n => {
    const chapters = uniq(n.chapters).sort();
    return {
      id: n.name,
      name: n.name,
      appearances: chapters.length,
      chapters,
      roles: uniq(n.roles).slice(0, 5),
      traits: uniq(n.traits).slice(0, 8)
    };
  }).sort((a, b) => b.appearances - a.appearances || a.name.localeCompare(b.name, 'zh-Hans-CN'));

  const links = [...linkMap.values()].map(l => {
    const chapters = uniq(l.chapters).sort();
    return { source: l.source, target: l.target, weight: chapters.length, chapters };
  }).sort((a, b) => b.weight - a.weight);

  return { bookId, generatedAt: new Date().toISOString(), nodes, links };
}
