import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Baby, BookOpen, CheckCircle2, Headphones, Loader2, Network, Pause, Play, RefreshCw, Sparkles, TerminalSquare, Users } from 'lucide-react';
import './styles.css';

type Book = { id: string; title: string; author: string; description: string };
type Chapter = { id: string; index: number; title: string; excerpt?: string; text?: string };
type Character = { name: string; role: string; traits: string[]; relation?: string };
type Episode = { title: string; recap: string; script: string; summary: string; nextHook: string; keyPoints: string[]; characters: Character[]; cached?: boolean; meta?: { provider: string; model?: string | null; durationMs?: number } };
type Audience = 'adult' | 'child';
type StoryStyle = 'modern' | 'pingshu' | 'drama' | 'bedtime';
type Progress = { bookId: string; chapterId: string; audience: Audience; style: StoryStyle; seconds: number; updatedAt: string } | null;
type ProviderStatus = { activeProvider: string; configuredProvider: string; model: string | null; chunkSummaryMode?: string; noThink?: boolean; outputMode?: string; fallbackReason?: string | null };
type Job = { id: string; bookId: string; limit: number; audience: Audience; style: StoryStyle; refresh: boolean; status: 'queued' | 'running' | 'done' | 'failed'; total: number; completed: number; skipped: number; failed: number; current?: string; logs: string[]; createdAt: string; updatedAt: string; error?: string };
type CharacterGraph = { nodes: { id: string; name: string; appearances: number; chapters: string[]; roles: string[]; traits: string[] }[]; links: { source: string; target: string; weight: number; chapters: string[] }[]; generatedAt: string };

const API = '/api';
const styleLabels: Record<StoryStyle, string> = { modern: '现代白话', pingshu: '评书说书', drama: '电视剧解说', bedtime: '睡前故事' };

function useVoices() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    const load = () => setVoices(window.speechSynthesis?.getVoices?.() || []);
    load();
    window.speechSynthesis?.addEventListener('voiceschanged', load);
    return () => window.speechSynthesis?.removeEventListener('voiceschanged', load);
  }, []);
  return voices;
}

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function App() {
  const [books, setBooks] = useState<Book[]>([]);
  const [bookId, setBookId] = useState('sanguo');
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [chapterId, setChapterId] = useState('sanguo-001');
  const [audience, setAudience] = useState<Audience>('adult');
  const [style, setStyle] = useState<StoryStyle>('pingshu');
  const [episode, setEpisode] = useState<Episode | null>(null);
  const [progress, setProgress] = useState<Progress>(null);
  const [provider, setProvider] = useState<ProviderStatus | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [activeJob, setActiveJob] = useState<Job | null>(null);
  const [prewarmLimit, setPrewarmLimit] = useState(12);
  const [loading, setLoading] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voiceName, setVoiceName] = useState('');
  const [speechRate, setSpeechRate] = useState(0.95);
  const [speechPitch, setSpeechPitch] = useState(1);
  const [readerFontSize, setReaderFontSize] = useState(18);
  const [readerLineHeight, setReaderLineHeight] = useState(1.9);
  const [activeParagraph, setActiveParagraph] = useState(-1);
  const paragraphRefs = useRef<Array<HTMLParagraphElement | null>>([]);
  const [graph, setGraph] = useState<CharacterGraph | null>(null);
  const [graphStatus, setGraphStatus] = useState('');
  const [graphBusy, setGraphBusy] = useState(false);
  const [prewarmStatus, setPrewarmStatus] = useState('');
  const [prewarmBusy, setPrewarmBusy] = useState(false);
  const [episodeStatus, setEpisodeStatus] = useState('');
  const voices = useVoices();

  const cnVoices = useMemo(() => voices.filter(v => /zh|Chinese|Mandarin|普通话|中文/i.test(`${v.lang} ${v.name}`)), [voices]);
  const selectedChapter = chapters.find(c => c.id === chapterId);
  const currentBook = books.find(b => b.id === bookId);
  const nextChapter = selectedChapter ? chapters.find(c => c.index === selectedChapter.index + 1) : undefined;
  const jobPercent = activeJob ? Math.round(((activeJob.completed + activeJob.skipped + activeJob.failed) / Math.max(activeJob.total, 1)) * 100) : 0;

  useEffect(() => {
    jsonFetch<Book[]>(`${API}/books`).then(setBooks);
    refreshHealth();
    refreshJobs();
  }, []);

  useEffect(() => {
    if (!bookId) return;
    jsonFetch<Chapter[]>(`${API}/books/${bookId}/chapters`).then(cs => {
      setChapters(cs);
      if (!cs.find(c => c.id === chapterId)) setChapterId(cs[0]?.id || '');
    });
    jsonFetch<Progress>(`${API}/progress/${bookId}?userId=local`).then(p => {
      setProgress(p);
      if (p?.chapterId) {
        setChapterId(p.chapterId);
        setAudience(p.audience);
        setStyle(p.style);
      }
    }).catch(() => null);
  }, [bookId]);

  useEffect(() => {
    if (!activeJob || !['queued', 'running'].includes(activeJob.status)) return;
    const timer = window.setInterval(async () => {
      try {
        const next = await jsonFetch<Job>(`${API}/jobs/${activeJob.id}`);
        setActiveJob(next);
        setPrewarmStatus(`预热${next.status === 'done' ? '完成' : next.status === 'failed' ? '失败' : '进行中'}：完成 ${next.completed}，跳过 ${next.skipped}，失败 ${next.failed} / ${next.total}`);
        refreshJobs();
      } catch (error) {
        setPrewarmStatus(`预热状态刷新失败：${error instanceof Error ? error.message : String(error)}`);
      }
    }, 1200);
    return () => window.clearInterval(timer);
  }, [activeJob?.id, activeJob?.status]);

  async function refreshHealth() {
    const health = await jsonFetch<{ provider: ProviderStatus }>(`${API}/health`);
    setProvider(health.provider);
  }

  async function refreshJobs() {
    const list = await jsonFetch<Job[]>(`${API}/jobs`).catch(() => []);
    setJobs(list);
  }


  async function loadCachedEpisodeForCurrent() {
    if (!bookId || !chapterId) return;
    setEpisodeStatus('正在检查本章缓存…');
    try {
      const ep = await jsonFetch<Episode>(`${API}/books/${bookId}/chapters/${chapterId}/episode?audience=${audience}&style=${style}`);
      setEpisode(ep);
      setEpisodeStatus('已加载本章缓存');
    } catch {
      setEpisode(null);
      setEpisodeStatus('本章尚未生成');
    }
  }


  useEffect(() => {
    stopSpeak();
    loadCachedEpisodeForCurrent();
  }, [bookId, chapterId, audience, style]);

  async function saveProgress(seconds = 0) {
    if (!chapterId) return;
    const p = await jsonFetch<Progress>(`${API}/progress/${bookId}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId: 'local', chapterId, audience, style, seconds })
    });
    setProgress(p);
  }


  useEffect(() => {
    if (activeParagraph >= 0) paragraphRefs.current[activeParagraph]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [activeParagraph]);

  async function goNextChapter(autoRead = false) {
    if (!nextChapter) return;
    stopSpeak();
    setChapterId(nextChapter.id);
    setEpisode(null);
    await saveProgress(0);
    if (autoRead) {
      setTimeout(async () => {
        const ep = await jsonFetch<Episode>(`${API}/books/${bookId}/chapters/${nextChapter.id}/episode`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ audience, style, refresh: false })
        });
        setEpisode(ep);
        setTimeout(() => speakEpisode(ep), 300);
      }, 100);
    }
  }

  async function createEpisode(refresh = false) {
    setLoading(true);
    setEpisodeStatus(refresh ? '正在重新生成…' : '正在生成…');
    try {
      const ep = await jsonFetch<Episode>(`${API}/books/${bookId}/chapters/${chapterId}/episode`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ audience, style, refresh })
      });
      setEpisode(ep);
      setEpisodeStatus(ep.cached ? '已加载缓存' : '生成完成');
      await saveProgress(0);
    } catch (error) {
      setEpisodeStatus(`生成失败：${error instanceof Error ? error.message : String(error)}`);
    } finally { setLoading(false); }
  }

  function speechParts(ep: Episode) {
    return [`${ep.title}。${ep.recap}`, ...ep.script.split('\n').map(s => s.trim()).filter(Boolean), `下一集：${ep.nextHook}`];
  }

  function speakEpisode(ep: Episode) {
    if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) {
      alert('当前浏览器不支持内置朗读。你仍然可以直接阅读正文，后续可接入云端朗读引擎。');
      return;
    }
    const parts = speechParts(ep);
    const voice = voices.find(v => v.name === voiceName) || cnVoices[0];
    let index = 0;
    window.speechSynthesis.cancel();
    setSpeaking(true);
    const playNext = () => {
      if (index >= parts.length) {
        setSpeaking(false);
        setActiveParagraph(-1);
        saveProgress(0);
        return;
      }
      setActiveParagraph(index - 1);
      const u = new SpeechSynthesisUtterance(parts[index]);
      if (voice) u.voice = voice;
      u.lang = voice?.lang || 'zh-CN';
      u.rate = style === 'bedtime' ? Math.min(speechRate, 0.9) : speechRate;
      u.pitch = speechPitch;
      u.onend = () => { index += 1; playNext(); };
      u.onerror = () => { index += 1; playNext(); };
      window.speechSynthesis.speak(u);
    };
    playNext();
  }

  function speak() {
    if (!episode || speaking) return stopSpeak();
    speakEpisode(episode);
  }

  function stopSpeak() {
    window.speechSynthesis.cancel();
    setSpeaking(false);
    setActiveParagraph(-1);
  }

  async function loadGraph() {
    setGraphStatus('正在生成图谱…');
    try {
      const data = await jsonFetch<CharacterGraph>(`${API}/books/${bookId}/graph`);
      setGraph(data);
      setGraphStatus(`图谱已更新：${data.nodes.length} 人物，${data.links.length} 关系`);
    } catch (error) {
      setGraphStatus(`图谱加载失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function startPrewarm(refresh = false) {
    setPrewarmStatus(refresh ? '正在创建刷新预热任务…' : '正在创建预热任务…');
    try {
      const job = await jsonFetch<Job>(`${API}/books/${bookId}/prewarm`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ limit: prewarmLimit, audience, style, refresh })
      });
      setActiveJob(job);
      setPrewarmStatus(`预热任务已开始：${job.total} 回`);
      await refreshJobs();
    } catch (error) {
      setPrewarmStatus(`预热失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return <div className="app-shell">
    <header className="hero">
      <div>
        <div className="eyebrow"><Sparkles size={16}/> AI Storytelling Studio</div>
        <h1>AI 说书先生</h1>
        <p>选择书籍和章节，生成讲书稿，然后用合适的音色听下去。成人版保留复杂人性与历史重量，儿童版自动柔化表达。</p>
      </div>
      <div className="status-card" aria-label="模型状态">
        <span className={`dot ${provider?.activeProvider === 'openai-compatible' ? 'ok' : 'warn'}`}/>
        <strong>{provider?.activeProvider === 'openai-compatible' ? '大模型已接入' : '本地生成模式'}</strong>
        <small>{provider?.model || provider?.configuredProvider || 'local fallback'} · {provider?.outputMode || 'script'}</small>
        <button onClick={refreshHealth}>刷新状态</button>
      </div>
    </header>

    <main className="workspace-grid">
      <aside className="panel library-panel">
        <div className="panel-title"><BookOpen size={18}/><span>书库与章节</span></div>
        {books.map(b => <button key={b.id} className={`book-card ${b.id === bookId ? 'selected' : ''}`} onClick={() => { stopSpeak(); setBookId(b.id); setEpisode(null); setGraph(null); setEpisodeStatus(''); }}>
          <strong>{b.title}</strong><small>{b.author}</small><span>{b.description}</span>
        </button>)}
        {progress && <button className="continue-card" onClick={() => { stopSpeak(); setChapterId(progress.chapterId); setAudience(progress.audience); setStyle(progress.style); }}>
          <span>继续听</span><strong>{progress.chapterId}</strong><small>{progress.audience === 'adult' ? '成人' : '儿童'} · {styleLabels[progress.style]}</small>
        </button>}
        <div className="chapter-list" role="listbox" aria-label="章节列表">
          {chapters.map(c => <button key={c.id} className={`chapter-row ${c.id === chapterId ? 'selected' : ''}`} onClick={() => { stopSpeak(); setChapterId(c.id); }}>
            <span>{String(c.index).padStart(3, '0')}</span><strong>{c.title}</strong><small>{c.excerpt}</small>
          </button>)}
        </div>
      </aside>

      <section className="panel reader-panel">
        <div className="episode-topline">
          <div><span className="kicker">{currentBook?.title || '名著'} · 第 {selectedChapter?.index || '-'} 回</span><h2>{selectedChapter?.title || '选择章节'}</h2></div>
          {episode?.cached && <span className="badge">缓存</span>}
        </div>
        {!episode ? <div className="empty-state">
          <Headphones size={44}/><h3>生成一集讲书稿</h3>
          <p>选择章节、受众与风格后，系统会结合前情摘要和当前章节生成适合阅读、也适合一键朗读的说书内容。</p>
          {episodeStatus && <small className="status-line">{episodeStatus}</small>}
          <button className="primary" disabled={loading || !chapterId} onClick={() => createEpisode(false)}>{loading ? <Loader2 className="spin"/> : <Sparkles/>}生成本集</button>
        </div> : <article className="episode">
          <h2>{episode.title}</h2>
          <section className="recap"><strong>前情提要</strong><p>{episode.recap}</p></section>
          <div className="player-bar">
            <button className="primary" onClick={speak}>{speaking ? <Pause/> : <Play/>}{speaking ? '暂停' : '朗读'}</button>
            <select value={voiceName} onChange={e => setVoiceName(e.target.value)} aria-label="选择音色">
              <option value="">自动中文音色</option>
              {cnVoices.map(v => <option key={v.name} value={v.name}>{v.name} · {v.lang}</option>)}
            </select>
          </div>
          <div className="tts-controls">
            <small className="tts-note">朗读发生在你的手机/电脑浏览器里，不依赖 Linux 服务器声卡；你也可以完全当正文阅读。移动端可能需要先点击“朗读”授权。</small>
            <label>语速 <input type="range" min="0.7" max="1.25" step="0.05" value={speechRate} onChange={e => setSpeechRate(Number(e.target.value))}/><span>{speechRate.toFixed(2)}x</span></label>
            <label>音调 <input type="range" min="0.7" max="1.3" step="0.05" value={speechPitch} onChange={e => setSpeechPitch(Number(e.target.value))}/><span>{speechPitch.toFixed(2)}</span></label>
            <label>字号 <input type="range" min="16" max="24" step="1" value={readerFontSize} onChange={e => setReaderFontSize(Number(e.target.value))}/><span>{readerFontSize}px</span></label>
            <label>行距 <input type="range" min="1.6" max="2.3" step="0.1" value={readerLineHeight} onChange={e => setReaderLineHeight(Number(e.target.value))}/><span>{readerLineHeight.toFixed(1)}</span></label>
          </div>
          {episode.meta && <div className="meta-strip">
            <span>{episode.meta.provider}</span><span>{episode.meta.model || 'local'}</span><span>{Math.round((episode.meta.durationMs || 0) / 1000)}s</span><span>chunk: {episode.meta.chunkSummaryMode}</span>{episode.meta.chunkFallbacks ? <span>fallback: {episode.meta.chunkFallbacks}</span> : null}
          </div>
          }
          <div className="script" style={{ fontSize: readerFontSize, lineHeight: readerLineHeight }}>{episode.script.split('\n').filter(Boolean).map((p, i) => <p key={i} ref={el => { paragraphRefs.current[i] = el; }} className={activeParagraph === i ? 'speaking-line' : ''}>{p}</p>)}</div>
          <section className="next-hook"><strong>下一集悬念</strong><p>{episode.nextHook}</p>{nextChapter && <div className="next-actions"><button onClick={() => goNextChapter(false)}>下一回</button><button className="primary" onClick={() => goNextChapter(true)}>下一回并朗读</button></div>}</section>
        </article>}
      </section>

      <aside className="panel studio-panel">
        <div className="panel-title"><TerminalSquare size={18}/><span>生成工作台</span></div>
        <label>受众模式</label>
        <div className="segmented">
          <button className={audience === 'adult' ? 'on' : ''} onClick={() => setAudience('adult')}><Users size={16}/>成人深读</button>
          <button className={audience === 'child' ? 'on' : ''} onClick={() => setAudience('child')}><Baby size={16}/>儿童柔化</button>
        </div>
        <p className="hint">成人版保留战争、权谋与复杂人性；儿童版弱化血腥、恐怖和成人化表达。</p>
        <label>讲述风格</label>
        <select value={style} onChange={e => setStyle(e.target.value as StoryStyle)}>{Object.entries(styleLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <div className="action-row">
          <button className="primary" disabled={loading} onClick={() => createEpisode(false)}>{loading ? <Loader2 className="spin"/> : <Sparkles/>}生成</button>
          <button onClick={() => createEpisode(true)} disabled={loading}><RefreshCw size={16}/>重生成</button>
        </div>
        {episodeStatus && <small className="status-line">{episodeStatus}</small>}

        <div className="divider"/>
        <div className="panel-title compact"><CheckCircle2 size={17}/><span>批量预热</span></div>
        <p className="hint">提前生成前 N 回内容，之后打开章节会直接读取缓存；任务在后端后台运行。</p>
        <label>预热前 N 回</label>
        <input type="number" min={1} max={120} value={prewarmLimit} onChange={e => setPrewarmLimit(Number(e.target.value))}/>
        <div className="action-row"><button disabled={prewarmBusy} onClick={() => startPrewarm(false)}>{prewarmBusy ? <Loader2 className="spin"/> : null}开始预热</button><button disabled={prewarmBusy} onClick={() => startPrewarm(true)}>{prewarmBusy ? <Loader2 className="spin"/> : <RefreshCw size={16}/>}刷新预热</button></div>
        {prewarmStatus && <small className="status-line">{prewarmStatus}</small>}
        {activeJob && <div className="job-card">
          <div className="job-head"><strong>{activeJob.status}</strong><span>{jobPercent}%</span></div>
          <div className="progress-track"><span style={{ width: `${jobPercent}%` }}/></div>
          <small>完成 {activeJob.completed} · 跳过 {activeJob.skipped} · 失败 {activeJob.failed} / {activeJob.total}</small>
          <pre>{activeJob.logs.slice(-8).join('\n')}</pre>
        </div>}
        {jobs.length > 0 && <div className="mini-jobs">{jobs.slice(0, 3).map(j => <button key={j.id} onClick={() => setActiveJob(j)}>{j.status} · {j.audience}/{j.style} · {j.completed + j.skipped}/{j.total}</button>)}</div>}

        <div className="divider"/>
        <div className="panel-title compact"><Network size={17}/><span>人物图谱</span></div>
        <button disabled={graphBusy} onClick={loadGraph}>{graphBusy ? <Loader2 className="spin"/> : <RefreshCw size={16}/>}刷新图谱</button>
        <p className="hint">根据已生成章节的人物卡片生成轻量关系图；生成章节越多，图谱越完整。</p>
        {graphStatus && <small className="status-line">{graphStatus}</small>}
        {graph && <div className="graph-card">
          <small>{graph.nodes.length} 个人物 · {graph.links.length} 条关系</small>
          {graph.nodes.slice(0, 8).map(n => <div className="graph-node" key={n.id}><strong>{n.name}</strong><span>出场 {n.appearances} 回</span><small>{n.roles[0] || n.traits.slice(0,2).join('、')}</small></div>)}
        </div>}
      </aside>
    </main>
  </div>;
}

createRoot(document.getElementById('root')!).render(<App />);
