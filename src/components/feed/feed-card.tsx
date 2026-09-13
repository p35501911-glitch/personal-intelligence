'use client';

import React from 'react';
import { PersonalizedStoryItem } from '@/server/news/relevance';
import { Clock, Layers, Globe, Sparkles, Bookmark } from 'lucide-react';

interface FeedCardProps {
  story: PersonalizedStoryItem;
  onOpenDetail: (story: PersonalizedStoryItem) => void;
  onToggleSave?: (storyId: string, currentSaved: boolean, e: React.MouseEvent) => void;
}

/**
 * Returns human-readable relative time (e.g., '12 min ago', '3 hours ago', 'Yesterday').
 */
function getRelativeTime(dateString: string): string {
  const published = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - published.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  if (diffHour === 1) return '1 hour ago';
  if (diffHour < 24) return `${diffHour} hours ago`;
  if (diffDay === 1) return 'Yesterday';
  if (diffDay < 7) return `${diffDay} days ago`;
  return published.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * Maps importance levels to distinctive visual badge colors.
 */
function getImportanceBadge(level: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW') {
  switch (level) {
    case 'CRITICAL':
      return {
        label: 'CRITICAL',
        classes: 'bg-rose-500/15 border-rose-500/30 text-rose-400 font-bold',
      };
    case 'HIGH':
      return {
        label: 'HIGH',
        classes: 'bg-amber-500/15 border-amber-500/30 text-amber-400 font-semibold',
      };
    case 'MEDIUM':
      return {
        label: 'MEDIUM',
        classes: 'bg-sky-500/15 border-sky-500/30 text-sky-400 font-medium',
      };
    case 'LOW':
    default:
      return {
        label: 'LOW',
        classes: 'bg-slate-700/30 border-slate-700 text-slate-400 font-normal',
      };
  }
}

export function FeedCard({ story, onOpenDetail, onToggleSave }: FeedCardProps) {
  const importanceBadge = getImportanceBadge(story.importance);
  const relativeTime = getRelativeTime(story.latestPublishedAt);
  const intel = story.intelligence;
  const isImportantAI = intel?.tier === 'important';

  // Extract publisher names preview (up to 3, plus "+N more")
  const sourceNames = story.sources && story.sources.length > 0
    ? story.sources.map((s) => s.name).filter(Boolean)
    : [];
  const primarySources = sourceNames.slice(0, 3);
  const extraSourcesCount = Math.max(0, (story.sourceCount || sourceNames.length) - primarySources.length);

  // Extract primary category tags for the header pill
  const categoryPills = (story.categories || []).slice(0, 2);

  return (
    <article
      onClick={() => onOpenDetail(story)}
      className="group relative flex flex-col justify-between bg-slate-900/70 hover:bg-slate-900 border border-slate-800 hover:border-indigo-500/40 rounded-2xl p-5 transition-all duration-200 cursor-pointer shadow-lg hover:shadow-indigo-500/10 hover:-translate-y-0.5"
    >
      <div>
        {/* Top Meta Bar: Category + Importance Level */}
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <div className="flex items-center space-x-1.5 overflow-hidden">
            {categoryPills.length > 0 ? (
              categoryPills.map((cat) => (
                <span
                  key={cat.categoryId}
                  className="px-2 py-0.5 text-[11px] font-medium rounded-md bg-slate-800/80 border border-slate-700/60 text-slate-300 truncate max-w-[140px]"
                >
                  {cat.categoryName}
                </span>
              ))
            ) : (
              <span className="px-2 py-0.5 text-[11px] font-medium rounded-md bg-slate-800/80 border border-slate-700/60 text-slate-400">
                General
              </span>
            )}
          </div>

          <div className="flex items-center space-x-1.5 shrink-0">
            <span
              className={`px-2 py-0.5 text-[10px] tracking-wide rounded-md border uppercase ${importanceBadge.classes}`}
            >
              {importanceBadge.label}
            </span>

            {onToggleSave && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleSave(story.id, Boolean(story.isSaved), e);
                }}
                className={`p-1 rounded-md border transition-all ${
                  story.isSaved
                    ? 'bg-indigo-950/70 border-indigo-500/40 text-indigo-400 hover:bg-indigo-900/60'
                    : 'bg-slate-800/60 border-slate-700/60 text-slate-400 hover:text-slate-200 hover:border-slate-600'
                }`}
                title={story.isSaved ? "Remove saved story" : "Save story"}
                aria-label={story.isSaved ? "Remove saved story" : "Save story"}
              >
                <Bookmark
                  className={`w-3.5 h-3.5 transition-colors ${
                    story.isSaved ? 'fill-indigo-400 text-indigo-400' : 'text-slate-400'
                  }`}
                />
              </button>
            )}
          </div>
        </div>

        {/* AI Tier Distinction Badge */}
        {intel && (
          <div
            className={`inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium mb-2.5 border transition-all ${
              isImportantAI
                ? 'bg-gradient-to-r from-indigo-950/80 via-purple-950/60 to-slate-900 border-indigo-500/40 text-indigo-300'
                : 'bg-gradient-to-r from-cyan-950/70 via-teal-950/50 to-slate-900 border-cyan-500/30 text-cyan-300'
            }`}
          >
            <Sparkles className={`w-3 h-3 shrink-0 ${isImportantAI ? 'text-indigo-400' : 'text-cyan-400'}`} />
            <span>{isImportantAI ? 'Flash Deep Intelligence' : 'Flash-Lite Brief'}</span>
            <span
              className={`text-[10px] font-mono px-1.5 py-0.2 rounded border ${
                isImportantAI
                  ? 'bg-indigo-900/60 border-indigo-700/40 text-indigo-200'
                  : 'bg-cyan-900/60 border-cyan-700/40 text-cyan-200'
              }`}
            >
              {intel.model}
            </span>
          </div>
        )}

        {/* Story Title */}
        <h2 className="text-base sm:text-lg font-bold text-white group-hover:text-indigo-300 transition-colors line-clamp-2 leading-snug tracking-tight mb-2">
          {story.title || story.canonicalTitle}
        </h2>

        {/* Optional Image */}
        {story.imageUrl && (
          <div className="relative w-full h-40 sm:h-44 rounded-xl overflow-hidden mb-3 bg-slate-800">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={story.imageUrl}
              alt={story.title || 'Story headline image'}
              className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
              loading="lazy"
              onError={(e) => {
                // If image fails to load, gracefully hide it
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
          </div>
        )}

        {/* Optional Summary / Description */}
        {story.summary && (
          <p className="text-xs sm:text-sm text-slate-400 line-clamp-2 leading-relaxed mb-3">
            {story.summary}
          </p>
        )}

        {/* Key Takeaway Snippet for Important Stories */}
        {isImportantAI && intel.keyPoints && intel.keyPoints.length > 0 && (
          <div className="mb-4 p-2.5 rounded-xl bg-indigo-950/25 border border-indigo-500/20 text-xs text-indigo-200/90 leading-relaxed flex items-start space-x-2">
            <span className="text-indigo-400 font-bold shrink-0 mt-0.5">•</span>
            <p className="line-clamp-2">
              <strong className="text-indigo-300 font-semibold">Key Takeaway: </strong>
              {intel.keyPoints[0]}
            </p>
          </div>
        )}
      </div>

      {/* Footer: Publisher Preview & Meta Counts */}
      <div className="pt-3 border-t border-slate-800/80 mt-auto">
        {/* Publisher String */}
        {primarySources.length > 0 && (
          <div className="text-xs font-medium text-slate-400 flex items-center space-x-1.5 mb-2 truncate">
            <Globe className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <span className="truncate">
              {primarySources.join(' · ')}
              {extraSourcesCount > 0 && ` +${extraSourcesCount}`}
            </span>
          </div>
        )}

        {/* Meta Stats Row */}
        <div className="flex items-center justify-between text-[11px] text-slate-500">
          <div className="flex items-center space-x-3">
            <span className="flex items-center space-x-1">
              <Layers className="w-3 h-3 text-slate-400" />
              <span>
                <strong className="text-slate-300">{story.sourceCount}</strong> {story.sourceCount === 1 ? 'source' : 'sources'} · <strong className="text-slate-300">{story.articleCount}</strong> {story.articleCount === 1 ? 'article' : 'articles'}
              </span>
            </span>
          </div>

          <div className="flex items-center space-x-1 text-slate-400">
            <Clock className="w-3 h-3" />
            <span>{relativeTime}</span>
          </div>
        </div>
      </div>
    </article>
  );
}
