import fs from 'node:fs/promises';
import path from 'node:path';
import { Book } from '../types.js';

const booksDir = path.resolve('server/data/books');

export async function listBooks(): Promise<Omit<Book, 'chapters'>[]> {
  const files = await fs.readdir(booksDir);
  const books = await Promise.all(files.filter(f => f.endsWith('.json')).map(async f => {
    const book = JSON.parse(await fs.readFile(path.join(booksDir, f), 'utf-8')) as Book;
    return {
      id: book.id,
      title: book.title,
      author: book.author,
      description: book.description,
      sourceLanguage: book.sourceLanguage,
      targetLanguage: book.targetLanguage,
      glossary: book.glossary
    };
  }));
  return books;
}

export async function loadGlossary(book: Book): Promise<Record<string, string>> {
  if (!book.glossary) return {};
  const file = path.resolve('server/data/books', book.glossary);
  try {
    const data = JSON.parse(await fs.readFile(file, 'utf-8')) as { terms?: Record<string, string> };
    return data.terms || {};
  } catch {
    return {};
  }
}

export async function getBook(bookId: string): Promise<Book> {
  const file = path.join(booksDir, `${bookId}.json`);
  return JSON.parse(await fs.readFile(file, 'utf-8')) as Book;
}

export async function listChapters(bookId: string) {
  const book = await getBook(bookId);
  return book.chapters.map(({ text, ...chapter }) => ({ ...chapter, excerpt: text.slice(0, 120) }));
}

export async function getChapter(bookId: string, chapterId: string) {
  const book = await getBook(bookId);
  const chapter = book.chapters.find(c => c.id === chapterId || String(c.index) === chapterId);
  if (!chapter) throw new Error(`Chapter not found: ${chapterId}`);
  return { book, chapter };
}

export function chunkText(text: string, size = 1800, overlap = 160) {
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    chunks.push(text.slice(i, i + size));
    i += size - overlap;
  }
  return chunks;
}
