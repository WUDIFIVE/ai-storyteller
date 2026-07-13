import fs from 'node:fs/promises';
import path from 'node:path';
import { Audience, StoryStyle } from '../types.js';

const dir = path.resolve('server/data/progress');
const file = path.join(dir, 'local.json');

export interface ProgressRecord {
  userId: string;
  bookId: string;
  chapterId: string;
  audience: Audience;
  style: StoryStyle;
  seconds: number;
  updatedAt: string;
}

async function readAll(): Promise<Record<string, ProgressRecord>> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf-8'));
  } catch {
    return {};
  }
}

function key(userId: string, bookId: string) {
  return `${userId}__${bookId}`;
}

export async function getProgress(userId: string, bookId: string) {
  const all = await readAll();
  return all[key(userId, bookId)] || null;
}

export async function saveProgress(record: Omit<ProgressRecord, 'updatedAt'>) {
  await fs.mkdir(dir, { recursive: true });
  const all = await readAll();
  const saved: ProgressRecord = { ...record, updatedAt: new Date().toISOString() };
  all[key(record.userId, record.bookId)] = saved;
  await fs.writeFile(file, JSON.stringify(all, null, 2));
  return saved;
}
