import { nanoid } from 'nanoid';
import { getBook } from '../content/books.js';
import { generateEpisode } from '../ai/provider.js';
import { getEpisode, previousSummaries, saveEpisode } from '../store/episodes.js';
import { Audience, StoryStyle } from '../types.js';

export type PrewarmJob = {
  id: string;
  bookId: string;
  limit: number;
  audience: Audience;
  style: StoryStyle;
  refresh: boolean;
  status: 'queued' | 'running' | 'done' | 'failed';
  total: number;
  completed: number;
  skipped: number;
  failed: number;
  current?: string;
  logs: string[];
  error?: string;
  createdAt: string;
  updatedAt: string;
};

const jobs = new Map<string, PrewarmJob>();

function append(job: PrewarmJob, line: string) {
  job.logs.push(`[${new Date().toLocaleTimeString()}] ${line}`);
  job.logs = job.logs.slice(-200);
  job.updatedAt = new Date().toISOString();
}

export function getJob(jobId: string) {
  return jobs.get(jobId) || null;
}

export function listJobs() {
  return [...jobs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 20);
}

export async function startPrewarmJob(input: { bookId: string; limit: number; audience: Audience; style: StoryStyle; refresh: boolean }) {
  const book = await getBook(input.bookId);
  const chapters = book.chapters.slice(0, Math.min(input.limit, book.chapters.length));
  const now = new Date().toISOString();
  const job: PrewarmJob = {
    id: nanoid(),
    bookId: input.bookId,
    limit: input.limit,
    audience: input.audience,
    style: input.style,
    refresh: input.refresh,
    status: 'queued',
    total: chapters.length,
    completed: 0,
    skipped: 0,
    failed: 0,
    logs: [],
    createdAt: now,
    updatedAt: now
  };
  jobs.set(job.id, job);

  void run(job).catch((error) => {
    job.status = 'failed';
    job.error = error?.message || String(error);
    append(job, `job failed: ${job.error}`);
  });

  return job;
}

async function run(job: PrewarmJob) {
  job.status = 'running';
  append(job, `start prewarm ${job.bookId}, limit=${job.limit}, audience=${job.audience}, style=${job.style}, refresh=${job.refresh}`);
  const book = await getBook(job.bookId);
  const chapters = book.chapters.slice(0, Math.min(job.limit, book.chapters.length));

  for (const chapter of chapters) {
    job.current = chapter.id;
    try {
      const existing = !job.refresh && await getEpisode(book.id, chapter.id, job.audience, job.style);
      if (existing) {
        job.skipped += 1;
        append(job, `skip ${chapter.id}`);
        continue;
      }
      const previous = await previousSummaries(book.id, chapter.index, job.audience, job.style);
      const started = Date.now();
      const ep = await generateEpisode({
        bookId: book.id,
        bookTitle: book.title,
        chapter,
        audience: job.audience,
        style: job.style,
        previous
      });
      await saveEpisode(ep);
      job.completed += 1;
      append(job, `done ${chapter.id} ${Date.now() - started}ms -> ${ep.title}`);
    } catch (error: any) {
      job.failed += 1;
      append(job, `fail ${chapter.id}: ${error?.message || String(error)}`);
    }
  }

  job.current = undefined;
  job.status = job.failed > 0 ? 'failed' : 'done';
  append(job, `finished: completed=${job.completed}, skipped=${job.skipped}, failed=${job.failed}`);
}
