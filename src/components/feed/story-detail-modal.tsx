'use client';

import React, { useEffect, useState } from 'react';
import { PersonalizedStoryItem } from '@/server/news/relevance';
import type { StoryDetails } from '@/server/news/stories';
import {
  X,
  ExternalLink,
  Clock,
  Layers,
  Globe,
  Calendar,
  Loader2,
  AlertCircle,
  Sparkles,
  CheckCircle2,
  TrendingUp,
  AlertTriangle,
  Brain,
  Lightbulb,
  Tag,
} from 'lucide-react';

interface StoryDetailModalProps {
  story: PersonalizedStoryItem | null;
  isOpen: boolean;
  onClose: () => void;
}

function formatDetailTime(isoString: string): string {
  try {
    const d = new Date(isoString);
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoString;
  }
}

function getImportanceBadge(level: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW') {
  switch (level) {
    case 'CRITICAL':
      return {
        label: 'CRITICAL IMPORTANCE',
        classes: 'bg-rose-500/15 border-rose-500/30 text-rose-400 font-bold',
      };
    case 'HIGH':
      return {
        label: 'HIGH IMPORTANCE',
        classes: 'bg-amber-500/15 border-amber-500/30 text-amber-400 font-semibold',
      };
    case 'MEDIUM':
      return {
        label: 'MEDIUM IMPORTANCE',
        classes: 'bg-sky-500/15 border-sky-500/30 text-sky-400 font-medium',
      };
    case 'LOW':
    default:
      return {
        label: 'LOW IMPORTANCE',
        classes: 'bg-slate-700/30 border-slate-700 text-slate-400 font-normal',
      };
  }
}

export function StoryDetailModal({ story, isOpen, onClose }: StoryDetailModalProps) {
  const [details, setDetails] = useState<StoryDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  // Fetch story details with attached articles when opened
  useEffect(() => {
    if (!isOpen || !story) return;

    let isMounted = true;
    async function fetchDetails() {
      try {
        const res = await fetch(`/api/stories/${story?.id}`);
        if (!res.ok) {
          throw new Error('Failed to load full coverage articles');
        }
        const data = await res.json();
        if (isMounted) {
          setDetails(data.story);
        }
      } catch (err: unknown) {
        if (isMounted) {
          const msg = err instanceof Error ? err.message : 'Error loading details';
          setError(msg);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    fetchDetails();

    return () => {
      isMounted = false;
    };
  }, [isOpen, story]);

  if (!isOpen || !story) return null;

  const importanceBadge = getImportanceBadge(story.importance);
  const articlesList = details?.articles || [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-sm transition-all animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl max-h-[90vh] flex flex-col bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden text-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Bar */}
        <div className="flex items-start justify-between p-6 border-b border-slate-800 bg-slate-900/80 sticky top-0 z-10">
          <div className="pr-4">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className={`px-2.5 py-0.5 text-xs rounded-md border uppercase tracking-wider ${importanceBadge.classes}`}>
                {importanceBadge.label}
              </span>
              {(story.categories || []).map((cat) => (
                <span
                  key={cat.categoryId}
                  className="px-2.5 py-0.5 text-xs font-medium rounded-md bg-slate-800 border border-slate-700 text-slate-300"
                >
                  {cat.categoryName}
                </span>
              ))}
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight leading-snug">
              {story.title || story.canonicalTitle}
            </h1>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors shrink-0"
            aria-label="Close story detail"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Metadata Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 rounded-xl bg-slate-950/60 border border-slate-800 text-xs text-slate-400">
            <div>
              <div className="text-slate-500 font-medium mb-1 flex items-center space-x-1">
                <Globe className="w-3 h-3 text-slate-400" />
                <span>Sources</span>
              </div>
              <div className="text-slate-200 font-bold text-sm">
                {details?.sourceCount || story.sourceCount} Publishers
              </div>
            </div>

            <div>
              <div className="text-slate-500 font-medium mb-1 flex items-center space-x-1">
                <Layers className="w-3 h-3 text-slate-400" />
                <span>Articles</span>
              </div>
              <div className="text-slate-200 font-bold text-sm">
                {details?.articleCount || story.articleCount} Reports
              </div>
            </div>

            <div>
              <div className="text-slate-500 font-medium mb-1 flex items-center space-x-1">
                <Calendar className="w-3 h-3 text-slate-400" />
                <span>First Reported</span>
              </div>
              <div className="text-slate-200 font-medium">
                {formatDetailTime(story.firstPublishedAt)}
              </div>
            </div>

            <div>
              <div className="text-slate-500 font-medium mb-1 flex items-center space-x-1">
                <Clock className="w-3 h-3 text-slate-400" />
                <span>Latest Update</span>
              </div>
              <div className="text-slate-200 font-medium">
                {formatDetailTime(story.latestPublishedAt)}
              </div>
            </div>
          </div>

          {/* Taxonomy & AI Classification Section */}
          {story.categories && story.categories.length > 0 && (
            <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-bold uppercase tracking-wider text-slate-300 flex items-center space-x-1.5">
                  <Tag className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Taxonomy & AI Classification</span>
                </span>
                <span className="text-[11px] text-slate-500">
                  50-Category Taxonomy
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {story.categories.map((cat) => (
                  <div
                    key={cat.categoryId}
                    className={`px-3 py-1.5 rounded-xl border text-xs flex items-center space-x-2 transition ${
                      cat.isPrimary
                        ? "bg-indigo-950/50 border-indigo-500/40 text-indigo-200"
                        : "bg-slate-900 border-slate-800 text-slate-300"
                    }`}
                  >
                    <span className="font-semibold">{cat.categoryName}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800/80 text-slate-400 border border-slate-700/50">
                      {cat.level === 3 ? "Topic" : cat.level === 2 ? "Subcategory" : "Category"}
                    </span>
                    {cat.confidence ? (
                      <span className="text-[10px] text-indigo-400/80 font-mono">
                        {Math.round(cat.confidence * 100)}%
                      </span>
                    ) : null}
                    {cat.isPrimary && (
                      <span className="text-[10px] text-indigo-300 font-bold uppercase tracking-wider">
                        • Primary
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Optional Summary */}
          {story.summary && (
            <div className="p-4 rounded-xl bg-indigo-950/20 border border-indigo-500/20 text-indigo-200/90 text-sm leading-relaxed">
              <strong className="text-indigo-300 block mb-1">Story Synopsis</strong>
              {story.summary}
            </div>
          )}

          {/* AI Intelligence Analysis Section */}
          {details?.intelligence ? (
            (() => {
              const isImportant = details.intelligence.tier === "important";
              return (
                <div
                  className={`rounded-2xl border p-5 space-y-4 shadow-xl relative overflow-hidden ${
                    isImportant
                      ? "bg-gradient-to-b from-indigo-950/40 via-slate-900/90 to-slate-950/90 border-indigo-500/30"
                      : "bg-gradient-to-b from-cyan-950/30 via-slate-900/90 to-slate-950/90 border-cyan-500/30"
                  }`}
                >
                  {/* Header Badge */}
                  <div
                    className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-3 ${
                      isImportant ? "border-indigo-500/20" : "border-cyan-500/20"
                    }`}
                  >
                    <div className="flex items-center space-x-2.5">
                      <div
                        className={`w-8 h-8 rounded-xl border flex items-center justify-center shadow-inner ${
                          isImportant
                            ? "bg-indigo-600/30 border-indigo-400/40 text-indigo-300"
                            : "bg-cyan-600/30 border-cyan-400/40 text-cyan-300"
                        }`}
                      >
                        <Sparkles className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                          <span>{isImportant ? "Flash Deep Intelligence" : "Flash-Lite Brief"}</span>
                          <span
                            className={`px-2 py-0.5 text-[10px] font-semibold rounded-full border ${
                              isImportant
                                ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/30"
                                : "bg-cyan-500/20 text-cyan-300 border-cyan-500/30"
                            }`}
                          >
                            {details.intelligence.model}
                          </span>
                        </h3>
                      </div>
                    </div>
                    <span className="text-[11px] text-slate-400">
                      Synthesized {formatDetailTime(details.intelligence.generatedAt)}
                    </span>
                  </div>

                  {/* Summary / Executive Summary */}
                  <div>
                    <h4
                      className={`text-xs font-bold uppercase tracking-wider mb-1.5 flex items-center space-x-1.5 ${
                        isImportant ? "text-indigo-300" : "text-cyan-300"
                      }`}
                    >
                      <Brain className={`w-3.5 h-3.5 ${isImportant ? "text-indigo-400" : "text-cyan-400"}`} />
                      <span>{isImportant ? "Executive Summary" : "Summary"}</span>
                    </h4>
                    <p className="text-sm text-slate-200 leading-relaxed bg-slate-950/50 p-3.5 rounded-xl border border-slate-800/80">
                      {details.intelligence.summary}
                    </p>
                  </div>

                  {/* Key Points / Key Takeaways */}
                  {details.intelligence.keyPoints && details.intelligence.keyPoints.length > 0 && (
                    <div>
                      <h4
                        className={`text-xs font-bold uppercase tracking-wider mb-2 flex items-center space-x-1.5 ${
                          isImportant ? "text-indigo-300" : "text-cyan-300"
                        }`}
                      >
                        <CheckCircle2 className={`w-3.5 h-3.5 ${isImportant ? "text-indigo-400" : "text-cyan-400"}`} />
                        <span>{isImportant ? "Key Takeaways" : "Key Points"}</span>
                      </h4>
                      <ul className="space-y-1.5 bg-slate-950/40 p-3.5 rounded-xl border border-slate-800/60">
                        {details.intelligence.keyPoints.map((point, idx) => (
                          <li key={idx} className="text-xs sm:text-sm text-slate-300 flex items-start space-x-2">
                            <span className={`font-bold shrink-0 mt-0.5 ${isImportant ? "text-indigo-400" : "text-cyan-400"}`}>
                              •
                            </span>
                            <span>{point}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Why It Matters (Important tier) */}
                  {isImportant && details.intelligence.whyItMatters && (
                    <div className="p-3.5 rounded-xl bg-indigo-950/30 border border-indigo-500/20">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-300 mb-1 flex items-center space-x-1.5">
                        <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
                        <span>Why It Matters</span>
                      </h4>
                      <p className="text-xs sm:text-sm text-indigo-100/90 leading-relaxed">
                        {details.intelligence.whyItMatters}
                      </p>
                    </div>
                  )}

              {/* Opportunities & Risks 2-column grid */}
              {((details.intelligence.opportunities && details.intelligence.opportunities.length > 0) ||
                (details.intelligence.risks && details.intelligence.risks.length > 0)) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                  {/* Opportunities */}
                  {details.intelligence.opportunities && details.intelligence.opportunities.length > 0 && (
                    <div className="p-3.5 rounded-xl bg-emerald-950/20 border border-emerald-500/20">
                      <h5 className="text-xs font-bold text-emerald-400 mb-2 flex items-center space-x-1.5">
                        <TrendingUp className="w-3.5 h-3.5" />
                        <span>Opportunities</span>
                      </h5>
                      <ul className="space-y-1.5 text-xs text-slate-300">
                        {details.intelligence.opportunities.map((opp, idx) => (
                          <li key={idx} className="flex items-start space-x-1.5">
                            <span className="text-emerald-400 font-bold shrink-0">+</span>
                            <span>{opp}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Risks */}
                  {details.intelligence.risks && details.intelligence.risks.length > 0 && (
                    <div className="p-3.5 rounded-xl bg-rose-950/20 border border-rose-500/20">
                      <h5 className="text-xs font-bold text-rose-400 mb-2 flex items-center space-x-1.5">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>Risks & Considerations</span>
                      </h5>
                      <ul className="space-y-1.5 text-xs text-slate-300">
                        {details.intelligence.risks.map((risk, idx) => (
                          <li key={idx} className="flex items-start space-x-1.5">
                            <span className="text-rose-400 font-bold shrink-0">!</span>
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
        })()
          ) : !isLoading && (
            /* Fallback indicator when intelligence has not completed */
            <div className="p-3.5 rounded-xl bg-slate-950/40 border border-slate-800 text-xs text-slate-500 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Sparkles className="w-3.5 h-3.5 text-slate-600" />
                <span>AI Strategic Synthesis Pending</span>
              </div>
              <span className="text-[11px] text-slate-600">Free Tier Background Processing</span>
            </div>
          )}

          {/* Publisher Coverage Section */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300 flex items-center space-x-2">
                <span>Multi-Publisher Coverage</span>
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-800 text-indigo-400 border border-slate-700">
                  {articlesList.length > 0 ? articlesList.length : story.articleCount}
                </span>
              </h2>
            </div>

            {isLoading && (
              <div className="flex items-center justify-center py-10 text-slate-400 space-x-2">
                <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
                <span className="text-sm">Retrieving publisher reports...</span>
              </div>
            )}

            {error && (
              <div className="p-4 rounded-xl bg-red-950/40 border border-red-500/30 text-red-300 text-xs flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {!isLoading && articlesList.length === 0 && !error && (
              <div className="py-6 text-center text-slate-500 text-sm">
                No individual publisher articles linked yet.
              </div>
            )}

            {!isLoading && articlesList.length > 0 && (
              <div className="space-y-3">
                {articlesList.map((art) => (
                  <div
                    key={art.id}
                    className="p-4 rounded-xl bg-slate-950/50 border border-slate-800 hover:border-slate-700 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2 text-xs font-semibold text-indigo-400 mb-1">
                        <span>{art.publisher}</span>
                        <span className="text-slate-600">•</span>
                        <span className="text-slate-500">{formatDetailTime(art.publishedAt)}</span>
                        {art.author && (
                          <>
                            <span className="text-slate-600">•</span>
                            <span className="text-slate-400 truncate max-w-[150px]">By {art.author}</span>
                          </>
                        )}
                      </div>
                      <p className="text-sm font-medium text-slate-200 line-clamp-2">
                        {art.title}
                      </p>
                    </div>

                    <a
                      href={art.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3.5 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/40 text-indigo-300 hover:text-white text-xs font-semibold flex items-center space-x-1.5 shrink-0 self-start sm:self-center transition-all"
                    >
                      <span>Read Original</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/60 flex items-center justify-between text-xs text-slate-500">
          <span>Personal Intelligence • Multi-Source Consensus</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
