'use client';

import React, { useEffect, useState } from 'react';
import { PersonalizedStoryItem } from '@/server/news/relevance';
import type { StoryDetails } from '@/server/news/stories';
import { X, ExternalLink, Clock, Layers, Globe, Calendar, Loader2, AlertCircle } from 'lucide-react';

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
  const [isLoading, setIsLoading] = useState(false);
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

          {/* Optional Summary */}
          {story.summary && (
            <div className="p-4 rounded-xl bg-indigo-950/20 border border-indigo-500/20 text-indigo-200/90 text-sm leading-relaxed">
              <strong className="text-indigo-300 block mb-1">Story Synopsis</strong>
              {story.summary}
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
