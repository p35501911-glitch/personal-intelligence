'use client';

import React, { useState, useEffect, useCallback } from 'react';
import type { TopicDigest, DigestPeriodType } from '@/server/news/digests/types';
import type { PersonalizedStoryItem } from '@/server/news/relevance';
import { DigestCard } from './digest-card';
import { DigestStoryList } from './digest-story-list';
import { StoryDetailModal } from '@/components/feed/story-detail-modal';
import {
  Sparkles,
  History,
  RotateCw,
  AlertCircle,
  FileText,
  ChevronRight,
} from 'lucide-react';

interface DigestViewProps {
  onNavigateToTopics?: () => void;
}

export function DigestView({ onNavigateToTopics }: DigestViewProps) {
  const [periodType, setPeriodType] = useState<DigestPeriodType>('daily');
  const [activeDigest, setActiveDigest] = useState<TopicDigest | null>(null);
  const [historyDigests, setHistoryDigests] = useState<TopicDigest[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [detailStory, setDetailStory] = useState<PersonalizedStoryItem | null>(null);

  // Fetch past digests and latest digest for selected period
  const loadDigests = useCallback(async (selectedPeriod: DigestPeriodType) => {
    setIsLoading(true);
    setError(null);

    try {
      // 1. Fetch latest digest
      const latestRes = await fetch(`/api/digests?periodType=${selectedPeriod}&latestOnly=true`);
      if (latestRes.ok) {
        const latestJson = await latestRes.json();
        setActiveDigest(latestJson.digest || null);
      }

      // 2. Fetch history digests
      const listRes = await fetch(`/api/digests?limit=15`);
      if (listRes.ok) {
        const listJson = await listRes.json();
        setHistoryDigests(listJson.digests || []);
      }
    } catch (err) {
      console.warn('Error loading topic digests:', err);
      setError('Unable to load briefings. Please check your network connection.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    let isCancelled = false;

    async function initialFetch() {
      try {
        const latestRes = await fetch(`/api/digests?periodType=${periodType}&latestOnly=true`);
        if (!isCancelled && latestRes.ok) {
          const latestJson = await latestRes.json();
          setActiveDigest(latestJson.digest || null);
        }

        const listRes = await fetch('/api/digests?limit=15');
        if (!isCancelled && listRes.ok) {
          const listJson = await listRes.json();
          setHistoryDigests(listJson.digests || []);
        }
      } catch (err) {
        if (!isCancelled) {
          console.warn('Error on initial digest load:', err);
          setError('Unable to load briefings.');
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }

    initialFetch();

    return () => {
      isCancelled = true;
    };
  }, [periodType]);

  // Handler for period change
  const handlePeriodChange = (newPeriod: DigestPeriodType) => {
    if (newPeriod === periodType) return;
    setPeriodType(newPeriod);
    loadDigests(newPeriod);
  };

  // Handler for generating fresh digest
  const handleGenerate = async (force = false) => {
    setIsGenerating(true);
    setError(null);

    try {
      const res = await fetch('/api/digests/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ periodType, force }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to generate briefing');
      }

      setActiveDigest(json.digest);

      // Refresh history
      const listRes = await fetch('/api/digests?limit=15');
      if (listRes.ok) {
        const listJson = await listRes.json();
        setHistoryDigests(listJson.digests || []);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setIsGenerating(false);
    }
  };

  // Select a past digest from history
  const handleSelectHistoryDigest = async (digestId: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/digests/${digestId}`);
      if (res.ok) {
        const json = await res.json();
        if (json.digest) {
          setActiveDigest(json.digest);
          setPeriodType(json.digest.periodType);
        }
      }
    } catch (err) {
      console.warn('Error fetching historical briefing:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Top Controls Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center space-x-2.5">
            <FileText className="w-6 h-6 text-indigo-400" />
            <span>Executive Intelligence Briefings</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Synthesized strategic intelligence from your personalized topics across 24-hour and 7-day cycles.
          </p>
        </div>

        {/* Period toggle and Generate button */}
        <div className="flex items-center space-x-3">
          {/* Daily / Weekly Selector */}
          <div className="inline-flex rounded-xl bg-slate-900 border border-slate-800 p-1">
            <button
              type="button"
              onClick={() => handlePeriodChange('daily')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                periodType === 'daily'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Daily (24h)
            </button>
            <button
              type="button"
              onClick={() => handlePeriodChange('weekly')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                periodType === 'weekly'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Weekly (7d)
            </button>
          </div>

          {/* Generate Button */}
          <button
            type="button"
            onClick={() => handleGenerate(true)}
            disabled={isGenerating}
            className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white text-xs font-bold shadow-lg shadow-indigo-500/20 disabled:opacity-50 transition-all cursor-pointer"
          >
            {isGenerating ? (
              <>
                <RotateCw className="w-3.5 h-3.5 animate-spin" />
                <span>Synthesizing...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                <span>Generate Briefing</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs sm:text-sm flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => loadDigests(periodType)}
            className="underline hover:text-white font-medium ml-4 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Grid: Briefing + History Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Left 3 Columns: Active Briefing */}
        <div className="lg:col-span-3 space-y-8">
          {isLoading ? (
            <div className="p-12 text-center rounded-3xl bg-slate-900/40 border border-slate-800 animate-pulse space-y-4">
              <div className="w-12 h-12 rounded-full bg-slate-800 mx-auto" />
              <div className="w-48 h-6 bg-slate-800 rounded mx-auto" />
              <div className="w-80 h-4 bg-slate-800/60 rounded mx-auto" />
            </div>
          ) : activeDigest ? (
            <>
              <DigestCard digest={activeDigest} onOpenStory={(s) => setDetailStory(s)} />
              <DigestStoryList stories={activeDigest.stories || []} onOpenStory={(s) => setDetailStory(s)} />
            </>
          ) : (
            /* Empty State */
            <div className="p-12 text-center rounded-3xl bg-slate-900/40 border border-slate-800/80 space-y-5 max-w-lg mx-auto">
              <div className="w-16 h-16 rounded-2xl bg-indigo-950/60 border border-indigo-500/30 flex items-center justify-center mx-auto text-indigo-400 shadow-xl">
                <Sparkles className="w-8 h-8 opacity-70" />
              </div>
              <div className="space-y-2">
                <h2 className="text-lg font-bold text-white">
                  No {periodType === 'daily' ? 'Daily' : 'Weekly'} Briefing Generated Yet
                </h2>
                <p className="text-xs sm:text-sm text-slate-400 leading-relaxed max-w-sm mx-auto">
                  Click below to synthesize a comprehensive executive briefing from stories in your selected topics.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => handleGenerate(false)}
                  disabled={isGenerating}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md cursor-pointer transition-colors"
                >
                  Generate {periodType === 'daily' ? 'Daily (24h)' : 'Weekly (7d)'} Briefing
                </button>
                {onNavigateToTopics && (
                  <button
                    type="button"
                    onClick={onNavigateToTopics}
                    className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 cursor-pointer transition-colors"
                  >
                    Manage Topics
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right 1 Column: Briefing History */}
        <aside className="space-y-4">
          <div className="flex items-center space-x-2 border-b border-slate-800 pb-3">
            <History className="w-4 h-4 text-indigo-400" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Previous Briefings
            </h2>
          </div>

          {historyDigests.length === 0 ? (
            <div className="p-4 rounded-xl bg-slate-900/30 border border-slate-800/60 text-center text-xs text-slate-500">
              No historical briefings recorded.
            </div>
          ) : (
            <div className="space-y-2">
              {historyDigests.map((h) => {
                const isActive = activeDigest?.id === h.id;
                const formattedDate = new Date(h.createdAt).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                });

                return (
                  <button
                    key={h.id}
                    type="button"
                    onClick={() => handleSelectHistoryDigest(h.id)}
                    className={`w-full text-left p-3 rounded-xl border transition-all flex items-center justify-between group cursor-pointer ${
                      isActive
                        ? 'bg-indigo-950/60 border-indigo-500/50 text-white'
                        : 'bg-slate-900/40 border-slate-800/80 hover:bg-slate-900/80 hover:border-slate-700 text-slate-300'
                    }`}
                  >
                    <div className="space-y-0.5 pr-2 truncate">
                      <div className="flex items-center space-x-1.5 text-[10px] font-bold uppercase tracking-wider text-indigo-400">
                        <span>{h.periodType}</span>
                        <span>•</span>
                        <span className="text-slate-400">{formattedDate}</span>
                      </div>
                      <p className="text-xs font-medium text-slate-200 truncate group-hover:text-indigo-300 transition-colors">
                        {h.title}
                      </p>
                    </div>

                    <ChevronRight className={`w-3.5 h-3.5 shrink-0 transition-transform group-hover:translate-x-0.5 ${isActive ? 'text-indigo-400' : 'text-slate-600'}`} />
                  </button>
                );
              })}
            </div>
          )}
        </aside>
      </div>

      {/* Story Detail Modal (Zero live LLM calls, instant precomputed synthesis) */}
      <StoryDetailModal
        story={detailStory}
        isOpen={Boolean(detailStory)}
        onClose={() => setDetailStory(null)}
      />
    </div>
  );
}
