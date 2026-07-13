export type Audience = 'adult' | 'child';
export type StoryStyle = 'modern' | 'pingshu' | 'drama' | 'bedtime';

export interface Chapter {
  id: string;
  index: number;
  title: string;
  text: string;
}

export interface Book {
  id: string;
  title: string;
  author: string;
  description: string;
  sourceLanguage?: string;
  targetLanguage?: string;
  glossary?: string;
  chapters: Chapter[];
}

export interface CharacterCard {
  name: string;
  role: string;
  traits: string[];
  relation?: string;
}

export interface StoryEpisode {
  id: string;
  bookId: string;
  chapterId: string;
  audience: Audience;
  style: StoryStyle;
  title: string;
  recap: string;
  script: string;
  summary: string;
  characters: CharacterCard[];
  keyPoints: string[];
  nextHook: string;
  createdAt: string;
  meta?: {
    provider: string;
    model?: string | null;
    durationMs?: number;
    chunkSummaryMode?: string;
    usedChunkSummaries?: boolean;
    chunkFallbacks?: number;
  };
}
