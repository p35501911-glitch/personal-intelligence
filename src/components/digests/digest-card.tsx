'use client';

import React from 'react';
import type { TopicDigest } from '@/server/news/digests/types';
import type { PersonalizedStoryItem } from '@/server/news/relevance';
import {
  Sparkles,
  Layers,
  Lightbulb,
  AlertTriangle,
  Calendar,
  ExternalLink,
  ShieldAlert,
} from 'lucide-react';

interface DigestCardProps {
  digest: TopicDigest;
  onOpenStory?: (story: PersonalizedStoryItem) => void;
}

function formatDateRange(startIso: string, endIso: string): string {
  try {
    const s = new Date(startIso);
    const e = new Date(endIso);
    const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
    return `${s.toLocaleDateString(undefined, options)} – ${e.toLocaleDateString(undefined, options)}`;
  } catch {
    return `${startIso.slice(0, 10)} to ${endIso.slice(0, 10)}`;
  }
}

export function DigestCard({ digest, onOpenStory }: DigestCardProps) {
  const isFallback = digest.model === 'deterministic-fallback' || digest.model === 'none';

  // Helper to find a story from digest.stories by storyId
  const findStory = (storyId: string): PersonalizedStoryItem | null => {
    if (!digest.stories) return null;
    const match = digest.stories.find((ds) => ds.storyId === storyId);
    return match?.story || null;
  };

  return (
    <div className="space-y-8">
      {/* Header Banner */}
      <div className="rounded-3xl bg-gradient-to-b from-slate-900 via-slate-900/90 to-slate-950 border border-slate-800 p-6 sm:p-8 shadow-2xl relative overflow-hidden">
        {/* Ambient background glow */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />

        <div className="relative z-10 space-y-4">
          {/* Metadata badges row */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs">
            <span className="px-3 py-1 rounded-full font-bold uppercase tracking-wider bg-indigo-500/15 border border-indigo-500/30 text-indigo-300">
              {digest.periodType === 'daily' ? 'Daily Intelligence Brief' : 'Weekly Intelligence Brief'}
            </span>

            <span className="flex items-center space-x-1.5 px-3 py-1 rounded-full bg-slate-800/80 border border-slate-700 text-slate-300">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span>{formatDateRange(digest.periodStart, digest.periodEnd)}</span>
            </span>

            <span className="px-3 py-1 rounded-full bg-slate-800/80 border border-slate-700 text-slate-300">
              {digest.storyCount} stories analyzed • {digest.importantStoryCount} high priority
            </span>

            {/* Model Badge */}
            {isFallback ? (
              <span className="flex items-center space-x-1 px-3 py-1 rounded-full bg-amber-950/40 border border-amber-500/30 text-amber-300 font-medium">
                <ShieldAlert className="w-3 h-3 text-amber-400" />
                <span>Deterministic Fallback</span>
              </span>
            ) : (
              <span className="flex items-center space-x-1 px-3 py-1 rounded-full bg-gradient-to-r from-indigo-950/80 to-purple-950/80 border border-indigo-500/40 text-indigo-300 font-medium shadow-sm">
                <Sparkles className="w-3 h-3 text-indigo-400 animate-pulse" />
                <span>{digest.model || 'Gemini Flash-Lite'}</span>
              </span>
            )}
          </div>

          {/* Title */}
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight leading-tight">
            {digest.title}
          </h1>

          {/* Executive Summary Card */}
          <div className="rounded-2xl bg-slate-950/70 border border-indigo-500/20 p-5 sm:p-6 backdrop-blur-sm">
            <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-indigo-400 mb-2">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Strategic Executive Summary</span>
            </div>
            <p className="text-sm sm:text-base text-slate-200 leading-relaxed font-normal">
              {digest.executiveSummary}
            </p>
          </div>
        </div>
      </div>

      {/* Key Developments */}
      {digest.keyDevelopments.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Layers className="w-4 h-4 text-indigo-400" />
              <h2 className="text-sm sm:text-base font-bold text-white uppercase tracking-wider">
                Key Developments ({digest.keyDevelopments.length})
              </h2>
            </div>
            <span className="text-xs text-slate-500">Ranked by strategic impact</span>
          </div>

          <div className="space-y-3">
            {digest.keyDevelopments.map((dev, idx) => {
              const matchedStory = findStory(dev.storyId);
              return (
                <div
                  key={`${dev.storyId}-${idx}`}
                  className="p-4 sm:p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 hover:border-slate-700 transition-all space-y-2.5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start space-x-3">
                      <span className="flex-shrink-0 w-6 h-6 rounded-lg bg-indigo-950/80 border border-indigo-500/30 text-indigo-400 text-xs font-bold flex items-center justify-center mt-0.5">
                        {idx + 1}
                      </span>
                      <h3 className="text-sm sm:text-base font-bold text-white leading-snug">
                        {dev.headline}
                      </h3>
                    </div>

                    {matchedStory && onOpenStory && (
                      <button
                        type="button"
                        onClick={() => onOpenStory(matchedStory)}
                        className="shrink-0 text-xs font-medium text-indigo-400 hover:text-indigo-300 flex items-center space-x-1 bg-slate-800/60 hover:bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-700/60 transition-colors"
                        title="Inspect full intelligence details"
                      >
                        <span>Inspect</span>
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    )}
                  </div>

                  <p className="text-xs sm:text-sm text-slate-300 leading-relaxed pl-9">
                    {dev.explanation}
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Category Highlights */}
      {digest.categoryHighlights.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-sm sm:text-base font-bold text-white uppercase tracking-wider flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-indigo-400" />
            <span>Category Highlights</span>
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {digest.categoryHighlights.map((cat, idx) => (
              <div
                key={`${cat.categoryName}-${idx}`}
                className="p-5 rounded-2xl bg-slate-900/50 border border-slate-800/70 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="px-2.5 py-0.5 text-xs font-bold rounded-md bg-slate-800 text-indigo-300 border border-slate-700">
                    {cat.categoryName}
                  </span>
                  <span className="text-[11px] text-slate-500">
                    {cat.storyIds.length} {cat.storyIds.length === 1 ? 'story' : 'stories'}
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                  {cat.summary}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Opportunities and Risks Side-by-Side */}
      {(digest.opportunities.length > 0 || digest.risks.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
          {/* Opportunities */}
          {digest.opportunities.length > 0 && (
            <div className="rounded-2xl bg-emerald-950/20 border border-emerald-500/20 p-5 space-y-3">
              <div className="flex items-center space-x-2 text-emerald-400 font-bold text-xs uppercase tracking-wider">
                <Lightbulb className="w-4 h-4" />
                <span>Identified Opportunities</span>
              </div>
              <ul className="space-y-2">
                {digest.opportunities.map((opp, i) => (
                  <li key={i} className="text-xs sm:text-sm text-slate-300 flex items-start space-x-2">
                    <span className="text-emerald-400 mt-1">•</span>
                    <span>{opp}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Risks */}
          {digest.risks.length > 0 && (
            <div className="rounded-2xl bg-rose-950/20 border border-rose-500/20 p-5 space-y-3">
              <div className="flex items-center space-x-2 text-rose-400 font-bold text-xs uppercase tracking-wider">
                <AlertTriangle className="w-4 h-4" />
                <span>Strategic Risks & Uncertainties</span>
              </div>
              <ul className="space-y-2">
                {digest.risks.map((risk, i) => (
                  <li key={i} className="text-xs sm:text-sm text-slate-300 flex items-start space-x-2">
                    <span className="text-rose-400 mt-1">▲</span>
                    <span>{risk}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
