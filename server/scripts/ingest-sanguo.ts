import fs from 'node:fs/promises';
import path from 'node:path';

const candidateRawPaths = [
  path.resolve('server/data/raw/三国演义.txt'),
  path.resolve('server/data/raw/sanguo.txt')
];
const outPath = path.resolve('server/data/books/sanguo.json');

const cnNum: Record<string, number> = { 一:1, 二:2, 三:3, 四:4, 五:5, 六:6, 七:7, 八:8, 九:9, 十:10, 百:100 };
function parseCnNumber(s: string) {
  if (/^\d+$/.test(s)) return Number(s);
  let total = 0;
  if (s.includes('百')) {
    const [h, rest] = s.split('百');
    total += (cnNum[h] || 1) * 100;
    s = rest;
  }
  if (s.includes('十')) {
    const [t, rest] = s.split('十');
    total += (t ? cnNum[t] : 1) * 10;
    if (rest) total += cnNum[rest] || 0;
  } else if (s) total += cnNum[s] || 0;
  return total;
}

function normalize(text: string) {
  return text.replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

async function firstExisting(paths: string[]) {
  for (const p of paths) {
    try {
      await fs.access(p);
      return p;
    } catch {
      // try next candidate
    }
  }
  throw new Error(`未找到原始全文。请放到以下任一位置：${paths.join(' 或 ')}`);
}

const rawPath = await firstExisting(candidateRawPaths);
const text = normalize(await fs.readFile(rawPath, 'utf-8'));
const re = /^\s*第\s*([一二三四五六七八九十百零〇两\d]+)\s*[回章]\s+([^\n]+)/gm;
const matches = [...text.matchAll(re)];
if (matches.length < 10) throw new Error(`章节识别过少：${matches.length}。请确认文本包含“第X回 标题”或“第X章 标题”。`);
const chapters = matches.map((m, i) => {
  const start = m.index || 0;
  const end = i + 1 < matches.length ? (matches[i + 1].index || text.length) : text.length;
  const index = parseCnNumber(m[1]);
  const title = m[2].trim();
  const body = text.slice(start + m[0].length, end).trim();
  return { id: `sanguo-${String(index).padStart(3, '0')}`, index, title, text: body };
}).sort((a, b) => a.index - b.index);

const book = {
  id: 'sanguo',
  title: '三国演义',
  author: '罗贯中',
  description: '中国古典长篇章回体历史演义小说。当前版本由本地无噪声全文导入生成。',
  chapters
};
await fs.writeFile(outPath, JSON.stringify(book, null, 2));
console.log(`Imported ${chapters.length} chapters from ${rawPath} -> ${outPath}`);
