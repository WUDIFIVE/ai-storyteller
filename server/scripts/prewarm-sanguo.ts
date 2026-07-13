import dotenv from 'dotenv';
import { getBook } from '../src/content/books.js';
import { generateEpisode, getProviderStatus } from '../src/ai/provider.js';
import { getEpisode, previousSummaries, saveEpisode } from '../src/store/episodes.js';
import { Audience, StoryStyle } from '../src/types.js';
dotenv.config({ override: process.env.AI_DOTENV_OVERRIDE === 'true' });

const limit = Number(process.argv[2] || 12);
const audience = (process.argv[3] || 'adult') as Audience;
const style = (process.argv[4] || 'pingshu') as StoryStyle;
const refresh = process.argv.includes('--refresh');

const book = await getBook('sanguo');
const chapters = book.chapters.slice(0, Math.min(limit, book.chapters.length));

console.log(`prewarm book=${book.id} chapters=${chapters.length} audience=${audience} style=${style} refresh=${refresh}`);
console.log('provider status=', JSON.stringify(getProviderStatus()));

for (const chapter of chapters) {
  const existing = !refresh && await getEpisode(book.id, chapter.id, audience, style);
  if (existing) {
    console.log(`skip ${chapter.id}`);
    continue;
  }
  const previous = await previousSummaries(book.id, chapter.index, audience, style);
  const started = Date.now();
  const ep = await generateEpisode({
    bookId: book.id,
    bookTitle: book.title,
    chapter,
    audience,
    style,
    previous
  });
  await saveEpisode(ep);
  console.log(`done ${chapter.id} ${Date.now() - started}ms -> ${ep.title}`);
}
