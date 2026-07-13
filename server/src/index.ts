import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import { z } from 'zod';
import { getBook, getChapter, listBooks, listChapters, loadGlossary } from './content/books.js';
import { generateEpisode, getProviderStatus } from './ai/provider.js';
import { getEpisode, previousSummaries, saveEpisode } from './store/episodes.js';
import { getProgress, saveProgress } from './store/progress.js';
import { buildCharacterGraph } from './store/graph.js';
import { getJob, listJobs, startPrewarmJob } from './jobs/prewarm.js';
import { Audience, StoryStyle } from './types.js';
dotenv.config({ override: process.env.AI_DOTENV_OVERRIDE === 'true' });

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

const episodeQuery = z.object({
  audience: z.enum(['adult', 'child']).default('adult'),
  style: z.enum(['modern', 'pingshu', 'drama', 'bedtime']).default('modern'),
  refresh: z.coerce.boolean().default(false)
});
const prewarmBody = z.object({
  limit: z.coerce.number().int().min(1).max(120).default(12),
  audience: z.enum(['adult', 'child']).default('adult'),
  style: z.enum(['modern', 'pingshu', 'drama', 'bedtime']).default('pingshu'),
  refresh: z.coerce.boolean().default(false)
});

app.get('/api/health', (_, res) => res.json({ ok: true, name: 'AI 说书先生', provider: getProviderStatus() }));
app.get('/api/books', async (_, res, next) => { try { res.json(await listBooks()); } catch (e) { next(e); } });
app.get('/api/books/:bookId', async (req, res, next) => { try { const b = await getBook(req.params.bookId); res.json({ ...b, chapters: b.chapters.map(({ text, ...c }) => c) }); } catch (e) { next(e); } });
app.get('/api/books/:bookId/chapters', async (req, res, next) => { try { res.json(await listChapters(req.params.bookId)); } catch (e) { next(e); } });
app.get('/api/books/:bookId/chapters/:chapterId', async (req, res, next) => { try { const { chapter } = await getChapter(req.params.bookId, req.params.chapterId); res.json(chapter); } catch (e) { next(e); } });

app.get('/api/progress/:bookId', async (req, res, next) => {
  try {
    const userId = String(req.query.userId || 'local');
    res.json(await getProgress(userId, req.params.bookId));
  } catch (e) { next(e); }
});

app.post('/api/progress/:bookId', async (req, res, next) => {
  try {
    const body = req.body || {};
    const saved = await saveProgress({
      userId: String(body.userId || 'local'),
      bookId: req.params.bookId,
      chapterId: String(body.chapterId),
      audience: body.audience as Audience,
      style: body.style as StoryStyle,
      seconds: Number(body.seconds || 0)
    });
    res.json(saved);
  } catch (e) { next(e); }
});

app.get('/api/books/:bookId/chapters/:chapterId/episode', async (req, res, next) => {
  try {
    const q = episodeQuery.parse(req.query || {});
    const { book, chapter } = await getChapter(req.params.bookId, req.params.chapterId);
    const cached = await getEpisode(book.id, chapter.id, q.audience as Audience, q.style as StoryStyle);
    if (!cached) return res.status(404).json({ error: 'episode not generated' });
    res.json({ ...cached, cached: true });
  } catch (e) { next(e); }
});

app.post('/api/books/:bookId/chapters/:chapterId/episode', async (req, res, next) => {
  try {
    const q = episodeQuery.parse(req.body || {});
    const { book, chapter } = await getChapter(req.params.bookId, req.params.chapterId);
    const cached = !q.refresh && await getEpisode(book.id, chapter.id, q.audience as Audience, q.style as StoryStyle);
    if (cached) return res.json({ ...cached, cached: true });
    const previous = await previousSummaries(book.id, chapter.index, q.audience as Audience, q.style as StoryStyle);
    const glossary = await loadGlossary(book);
    const ep = await generateEpisode({ bookId: book.id, bookTitle: book.title, sourceLanguage: book.sourceLanguage, targetLanguage: book.targetLanguage, glossary, chapter, audience: q.audience as Audience, style: q.style as StoryStyle, previous });
    await saveEpisode(ep);
    res.json({ ...ep, cached: false });
  } catch (e) { next(e); }
});

app.get('/api/books/:bookId/graph', async (req, res, next) => {
  try { res.json(await buildCharacterGraph(req.params.bookId)); } catch (e) { next(e); }
});

app.get('/api/jobs', (_, res) => res.json(listJobs()));
app.get('/api/jobs/:jobId', (req, res) => {
  const job = getJob(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'job not found' });
  res.json(job);
});
app.post('/api/books/:bookId/prewarm', async (req, res, next) => {
  try {
    const body = prewarmBody.parse(req.body || {});
    const job = await startPrewarmJob({ bookId: req.params.bookId, limit: body.limit, audience: body.audience as Audience, style: body.style as StoryStyle, refresh: body.refresh });
    res.json(job);
  } catch (e) { next(e); }
});


app.use((err: any, _req: any, res: any, _next: any) => res.status(500).json({ error: err?.message || String(err) }));

const port = Number(process.env.PORT || 8787);
app.listen(port, () => console.log(`AI Storyteller API http://localhost:${port}`));
