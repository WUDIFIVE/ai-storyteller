import fs from 'node:fs/promises';
import path from 'node:path';

const args = new Map<string, string>();
for (const item of process.argv.slice(2)) {
  const m = item.match(/^--([^=]+)=(.*)$/);
  if (m) args.set(m[1], m[2]);
}

const id = args.get('id');
const title = args.get('title');
const author = args.get('author') || '佚名';
const raw = args.get('raw');
const description = args.get('description') || '由本地全文导入生成。';
const sourceLanguage = args.get('source-language') || args.get('lang') || 'zh';
const targetLanguage = args.get('target-language') || 'zh-CN';
const glossaryPath = args.get('glossary');

if (!id || !title || !raw) {
  throw new Error('用法：npm run ingest:book -- --id=xiyou --title=西游记 --author=吴承恩 --raw=server/data/raw/西游记.txt [--source-language=en] [--glossary=server/data/glossaries/xiyou.json]');
}

function normalize(text: string) {
  return text
    .replace(/\r/g, '')
    .replace(/^\*\*\* START OF[\s\S]*?\*\*\*\s*/i, '')
    .replace(/\*\*\* END OF[\s\S]*$/i, '')
    .replace(/[\t ]+/g, ' ')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
}

const cnNum: Record<string, number> = { 零:0, 〇:0, 一:1, 二:2, 两:2, 三:3, 四:4, 五:5, 六:6, 七:7, 八:8, 九:9, 十:10, 百:100 };
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
    if (rest) total += cnNum[rest] ?? 0;
  } else if (s) total += cnNum[s] ?? 0;
  return total || 1;
}

function romanToInt(input: string) {
  if (/^\d+$/.test(input)) return Number(input);
  const map: Record<string, number> = { I:1, V:5, X:10, L:50, C:100, D:500, M:1000 };
  let total = 0, prev = 0;
  for (const ch of input.toUpperCase().split('').reverse()) {
    const val = map[ch] || 0;
    if (val < prev) total -= val; else total += val;
    prev = Math.max(prev, val);
  }
  return total || 1;
}


function sanitizeTitle(rawTitle: string, fallback: string) {
  const cleaned = rawTitle
    .replace(/^\[?Illustration:?\]?$/i, '')
    .replace(/^\[|\]$/g, '')
    .replace(/^[:：\-—.\s]+|[:：\-—.\s]+$/g, '')
    .trim();
  if (!cleaned || /^[\].\-—:：\s]+$/.test(cleaned)) return fallback;
  return cleaned;
}


function localizeChapterTitle(chapterTitle: string, terms: Record<string, string>) {
  if (!terms || !Object.keys(terms).length) return chapterTitle;
  const normalized = new Map(Object.entries(terms).map(([k, v]) => [k.toLowerCase(), v]));
  const lookup = (key: string) => terms[key] || normalized.get(key.toLowerCase());
  const direct = lookup(chapterTitle) || lookup(chapterTitle.replace(/^The Adventure of\s+/i, 'The '));
  if (direct) return direct;
  const adventure = chapterTitle.match(/^The Adventure of\s+(.+)$/i)?.[1]?.trim();
  if (adventure) {
    return lookup(`The ${adventure}`) || lookup(adventure) || chapterTitle;
  }
  return chapterTitle;
}

function byChineseChapterMarkers(text: string) {
  const re = /^\s*第[ \t]*([一二三四五六七八九十百零〇两\d]+)[ \t]*[回章节卷][ \t]+([^\n]*)/gm;
  const matches = [...text.matchAll(re)];
  if (matches.length < 2) return null;
  return matches.map((m, i) => {
    const start = m.index || 0;
    const end = i + 1 < matches.length ? (matches[i + 1].index || text.length) : text.length;
    const index = parseCnNumber(m[1]);
    const chapterTitle = sanitizeTitle(m[2] || '', `${title} 第${index}章`);
    const body = text.slice(start + m[0].length, end).trim();
    return { id: `${id}-${String(index).padStart(3, '0')}`, index, title: chapterTitle, text: body };
  }).sort((a, b) => a.index - b.index);
}

function byEnglishChapterMarkers(text: string) {
  const patterns = [
    /^\s*CHAPTER[ \t]+([IVXLCDM\d]+)\.?[ \t]*([^\n]*)/gmi,
    /^\s*Chapter[ \t]+([IVXLCDM\d]+)\.?[ \t]*([^\n]*)/gm,
    /^\s*THE ADVENTURE OF[ \t]+([^\n]+)/gm,
    /^\s*PART[ \t]+([IVXLCDM\d]+)\.?[ \t]*([^\n]*)/gmi
  ];
  let best: RegExpMatchArray[] = [];
  let bestKind = '';
  for (const re of patterns) {
    const matches = [...text.matchAll(re)];
    if (matches.length > best.length) {
      best = matches;
      bestKind = re.source;
    }
  }
  if (best.length < 2) return null;
  const seen = new Set<number>();
  return best.map((m, i) => {
    const start = m.index || 0;
    const end = i + 1 < best.length ? (best[i + 1].index || text.length) : text.length;
    let index: number;
    let chapterTitle: string;
    if (/THE ADVENTURE/i.test(m[0])) {
      index = i + 1;
      chapterTitle = sanitizeTitle(`The Adventure of ${String(m[1] || '').trim()}`, `${title} Story ${index}`);
    } else {
      index = romanToInt(String(m[1] || i + 1));
      chapterTitle = sanitizeTitle(String(m[2] || ''), `${title} Chapter ${index}`);
    }
    while (seen.has(index)) index += 1000;
    seen.add(index);
    const body = text.slice(start + m[0].length, end).trim();
    return { id: `${id}-${String(i + 1).padStart(3, '0')}`, index: i + 1, title: chapterTitle, text: body };
  });
}

function byParagraphChunks(text: string, size = sourceLanguage.startsWith('en') ? 7200 : 5200) {
  const parts: string[] = [];
  let buf = '';
  for (const para of text.split(/\n\s*\n/)) {
    if ((buf + '\n\n' + para).length > size && buf.trim()) {
      parts.push(buf.trim());
      buf = para;
    } else {
      buf = buf ? `${buf}\n\n${para}` : para;
    }
  }
  if (buf.trim()) parts.push(buf.trim());
  return parts.map((body, i) => ({ id: `${id}-${String(i + 1).padStart(3, '0')}`, index: i + 1, title: `${title} · 第 ${i + 1} 节`, text: body }));
}

const glossaryTerms: Record<string, string> = glossaryPath ? JSON.parse(await fs.readFile(path.resolve(glossaryPath), 'utf-8')).terms || {} : {};
const text = normalize(await fs.readFile(path.resolve(raw), 'utf-8'));
const chapters = (byChineseChapterMarkers(text) || byEnglishChapterMarkers(text) || byParagraphChunks(text)).map(ch => ({ ...ch, title: localizeChapterTitle(ch.title, glossaryTerms) }));
if (!chapters.length) throw new Error('未能切分章节');

const book = {
  id,
  title,
  author,
  description,
  sourceLanguage,
  targetLanguage,
  glossary: glossaryPath ? path.relative('server/data/books', glossaryPath).replaceAll('\\\\', '/') : undefined,
  chapters
};
const out = path.resolve(`server/data/books/${id}.json`);
await fs.mkdir(path.dirname(out), { recursive: true });
await fs.writeFile(out, JSON.stringify(book, null, 2));
console.log(`Imported ${chapters.length} chapters (${sourceLanguage} -> ${targetLanguage}) -> ${out}`);
