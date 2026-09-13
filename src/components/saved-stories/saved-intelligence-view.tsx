'use client';

import React, { useState, useEffect, useCallback } from 'react';
import type { SavedStoryItem } from '@/server/news/saved-stories';
import type { PersonalizedStoryItem } from '@/server/news/relevance';
import { FeedCard } from '@/components/feed/feed-card';
import { FeedSkeleton } from '@/components/feed/feed-skeleton';
import { StoryDetailModal } from '@/components/feed/story-detail-modal';
import { Bookmark, Sparkles, RefreshCw, Loader2, ArrowLeft } from 'lucide-react';

interface SavedIntelligenceViewProps {
  onNavigateToFeed?: () => void;
}

const PAGE_LIMIT = 18;

export function SavedIntelligenceView({ onNavigateToFeed }: SavedIntelligenceViewProps) {
  const [stories, setStories] = useState<SavedStoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [selectedStory, setSelectedStory] = useState<PersonalizedStoryItem | null>(null);
  const isMountedRef = React.useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const executeFetch = useCallback(async (currentOffset = 0, append = false) => {
    try {
      const res = await fetch(`/api/saved-stories?limit=${PAGE_LIMIT}&offset=${currentOffset}`);
      if (res.status === 401) {
        if (isMountedRef.current) {
          setError("Sign in required to view your personal saved intelligence dossier.");
          setStories([]);
        }
        return;
      }
      if (!res.ok) {
        throw new Error("Failed to load saved stories");
      }

      const data = await res.json();
      const fetched: SavedStoryItem[] = data.stories || [];

      if (isMountedRef.current) {
        setStories((prev) => (append ? [...prev, ...fetched] : fetched));
        setOffset(currentOffset);
        setHasMore(Boolean(data.pagination?.hasMore));
        setTotalCount(data.pagination?.count ?? fetched.length);
        setError(null);
      }
    } catch (err: unknown) {
      if (isMountedRef.current) {
        const msg = err instanceof Error ? err.message : "Error loading saved stories";
        setError(msg);
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
        setIsRefreshing(false);
        setIsLoadingMore(false);
      }
    }
  }, []);

  useEffect(() => {
    let isCancelled = false;
    async function loadInitial() {
      try {
        const res = await fetch(`/api/saved-stories?limit=${PAGE_LIMIT}&offset=0`);
        if (res.status === 401) {
          if (!isCancelled && isMountedRef.current) {
            setError("Sign in required to view your personal saved intelligence dossier.");
            setStories([]);
            setIsLoading(false);
          }
          return;
        }
        if (!res.ok) {
          throw new Error("Failed to load saved stories");
        }
        const data = await res.json();
        if (!isCancelled && isMountedRef.current) {
          const fetched: SavedStoryItem[] = data.stories || [];
          setStories(fetched);
          setOffset(0);
          setHasMore(Boolean(data.pagination?.hasMore));
          setTotalCount(data.pagination?.count ?? fetched.length);
          setError(null);
          setIsLoading(false);
        }
      } catch (err: unknown) {
        if (!isCancelled && isMountedRef.current) {
          const msg = err instanceof Error ? err.message : "Error loading saved stories";
          setError(msg);
          setIsLoading(false);
        }
      }
    }

    loadInitial();
    return () => {
      isCancelled = true;
    };
  }, []);

  const handleRefresh = () => {
    setIsRefreshing(true);
    executeFetch(0, false);
  };

  const handleLoadMore = () => {
    if (isLoadingMore || !hasMore) return;
    setIsLoadingMore(true);
    const nextOffset = offset + PAGE_LIMIT;
    executeFetch(nextOffset, true);
  };

  const handleRemoveBookmark = useCallback(async (storyId: string) => {
    // Optimistically remove from list
    setStories((prev) => prev.filter((s) => s.id !== storyId));
    setTotalCount((prev) => Math.max(0, prev - 1));

    try {
      const res = await fetch(`/api/saved-stories/${storyId}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 404) {
        throw new Error("Failed to remove saved story");
      }
    } catch (err) {
      console.warn("Could not remove bookmark, refreshing:", err);
      // Re-fetch to synchronize state on error
      executeFetch(0, false);
    }
  }, [executeFetch]);

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Dossier Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 rounded-2xl bg-gradient-to-r from-slate-900/90 via-indigo-950/30 to-slate-900/90 border border-slate-800 shadow-xl backdrop-blur-md">
        <div className="flex items-center space-x-3.5">
          <div className="w-12 h-12 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shadow-inner">
            <Bookmark className="w-6 h-6 fill-indigo-400/20" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight flex items-center space-x-2.5">
              <span>Saved Intelligence Dossier</span>
              {totalCount > 0 && (
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  {totalCount} {totalCount === 1 ? 'story' : 'stories'}
                </span>
              )}
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
              Your curated archive of important stories and AI executive intelligence briefs.
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2 shrink-0">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing || isLoading}
            className="p-2.5 rounded-xl border border-slate-700/80 bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-all disabled:opacity-50"
            title="Refresh saved dossier"
            aria-label="Refresh saved dossier"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-indigo-400' : ''}`} />
          </button>

          {onNavigateToFeed && (
            <button
              type="button"
              onClick={onNavigateToFeed}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/25 transition-all flex items-center space-x-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Live Feed</span>
            </button>
          )}
        </div>
      </div>

      {/* Error notice */}
      {error && (
        <div className="p-4 rounded-xl bg-amber-950/40 border border-amber-500/30 text-amber-300 text-xs flex items-center justify-between">
          <span>{error}</span>
          <button
            type="button"
            onClick={handleRefresh}
            className="underline font-bold hover:text-white ml-4"
          >
            Retry
          </button>
        </div>
      )}

      {/* Content Area */}
      {isLoading ? (
        <FeedSkeleton />
      ) : stories.length === 0 ? (
        /* Empty Dossier State */
        <div className="text-center py-16 px-4 rounded-3xl bg-slate-900/40 border border-slate-800/80 max-w-lg mx-auto space-y-5">
          <div className="w-16 h-16 rounded-2xl bg-indigo-950/60 border border-indigo-500/30 flex items-center justify-center mx-auto text-indigo-400 shadow-xl">
            <Bookmark className="w-8 h-8 opacity-70" />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-white mb-2">
              Your intelligence dossier is empty
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 leading-relaxed max-w-sm mx-auto">
              Save key stories and executive AI briefs while browsing the live feed to build your personal intelligence archive.
            </p>
          </div>
          {onNavigateToFeed && (
            <button
              type="button"
              onClick={onNavigateToFeed}
              className="px-5 py-2.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/30 transition-all inline-flex items-center space-x-2"
            >
              <Sparkles className="w-4 h-4 text-indigo-200" />
              <span>Explore Live Intelligence Feed</span>
            </button>
          )}
        </div>
      ) : (
        /* Saved Stories Grid */
        <div className="space-y-10">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {stories.map((story) => (
              <FeedCard
                key={story.id}
                story={story}
                onOpenDetail={(s) => setSelectedStory(s)}
                onToggleSave={(storyId) => handleRemoveBookmark(storyId)}
              />
            ))}
          </div>

          {/* Load More Pagination */}
          {hasMore && (
            <div className="flex justify-center pt-4">
              <button
                type="button"
                onClick={handleLoadMore}
                disabled={isLoadingMore}
                className="px-6 py-2.5 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-850 text-slate-200 border border-slate-700/80 hover:border-indigo-500/40 transition-all flex items-center space-x-2 shadow-lg disabled:opacity-50"
              >
                {isLoadingMore ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                    <span>Loading more saved stories...</span>
                  </>
                ) : (
                  <span>Load More Saved Stories</span>
                )}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Story Detail Modal */}
      {selectedStory && (
        <StoryDetailModal
          key={selectedStory.id}
          story={selectedStory}
          isOpen={true}
          onClose={() => setSelectedStory(null)}
        />
      )}
    </div>
  );
}
