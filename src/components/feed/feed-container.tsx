'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { PersonalizedStoryItem } from '@/server/news/relevance';
import { FeedCard } from './feed-card';
import { FeedHeaderControls } from './feed-header-controls';
import { FeedSkeleton } from './feed-skeleton';
import { FeedEmptyState } from './feed-empty-state';
import { StoryDetailModal } from './story-detail-modal';
import { TAXONOMY_SEED } from '@/lib/data/categories-seed';
import type { CategoryNode } from '@/types/category';
import { Loader2 } from 'lucide-react';

interface FeedContainerProps {
  onOpenManageTopics?: () => void;
}

const PAGE_LIMIT = 18;
const POLLING_INTERVAL_MS = 60000; // 60 seconds

export function FeedContainer({ onOpenManageTopics }: FeedContainerProps) {
  const [stories, setStories] = useState<PersonalizedStoryItem[]>([]);
  const [mode, setMode] = useState<'CATEGORY' | 'ALL'>('CATEGORY');
  const [userCategoryIds, setUserCategoryIds] = useState<string[]>([]);
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [importanceFilter, setImportanceFilter] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState<'relevance' | 'recent' | 'importance'>('relevance');

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const [detailStory, setDetailStory] = useState<PersonalizedStoryItem | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Build category ID -> Name map from TAXONOMY_SEED
  const categoryNamesMap = React.useMemo(() => {
    const map: Record<string, string> = {};
    const traverse = (node: CategoryNode) => {
      map[node.id] = node.name;
      if (node.slug) map[node.slug] = node.name;
      if (node.children) {
        node.children.forEach(traverse);
      }
    };
    TAXONOMY_SEED.forEach(traverse);
    return map;
  }, []);

  // 1. Fetch user preferences on initial mount
  useEffect(() => {
    async function loadPreferences() {
      try {
        const res = await fetch('/api/user/categories');
        if (res.ok) {
          const data = await res.json();
          if (!isMountedRef.current) return;
          if (data.mode === 'ALL') {
            setMode('ALL');
            setUserCategoryIds([]);
          } else if (Array.isArray(data.categoryIds)) {
            setUserCategoryIds(data.categoryIds);
            setMode('CATEGORY');
          }
        }
      } catch (err) {
        console.warn('Could not load user category preferences:', err);
      }
    }
    loadPreferences();
  }, []);

  // 2. Fetch feed stories when filters, category, or mode change
  useEffect(() => {
    let isCancelled = false;

    async function loadFeed() {
      try {
        const params = new URLSearchParams();
        params.set('limit', String(PAGE_LIMIT));
        params.set('offset', '0');
        params.set('mode', mode);

        if (activeCategoryId) {
          params.set('categoryId', activeCategoryId);
        }
        if (importanceFilter !== null) {
          params.set('minImportance', String(importanceFilter));
        }
        if (sortBy) {
          params.set('sortBy', sortBy);
        }

        const res = await fetch(`/api/feed?${params.toString()}`);
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || 'Failed to fetch intelligence feed');
        }

        const data = await res.json();
        if (!isCancelled && isMountedRef.current) {
          const fetchedStories: PersonalizedStoryItem[] = data.stories || data.feed || [];
          setStories(fetchedStories);
          setOffset(0);
          setHasMore(Boolean(data.pagination?.hasMore));
          setErrorMessage(null);
          setLastUpdated(new Date());
          setIsLoading(false);
          setIsRefreshing(false);
        }
      } catch (err: unknown) {
        if (!isCancelled && isMountedRef.current) {
          const msg = err instanceof Error ? err.message : 'Error loading intelligence feed';
          setErrorMessage(msg);
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    }

    loadFeed();

    return () => {
      isCancelled = true;
    };
  }, [mode, activeCategoryId, importanceFilter, sortBy]);

  // 3. Manual refresh or pagination loader
  const executeFetch = useCallback(
    async (targetOffset: number, isAppend: boolean) => {
      try {
        const params = new URLSearchParams();
        params.set('limit', String(PAGE_LIMIT));
        params.set('offset', String(targetOffset));
        params.set('mode', mode);

        if (activeCategoryId) {
          params.set('categoryId', activeCategoryId);
        }
        if (importanceFilter !== null) {
          params.set('minImportance', String(importanceFilter));
        }
        if (sortBy) {
          params.set('sortBy', sortBy);
        }

        const res = await fetch(`/api/feed?${params.toString()}`);
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || 'Failed to fetch intelligence feed');
        }

        const data = await res.json();
        if (!isMountedRef.current) return;

        const incomingStories: PersonalizedStoryItem[] = data.stories || data.feed || [];
        const incomingHasMore: boolean = Boolean(data.pagination?.hasMore);

        if (isAppend) {
          setStories((prev) => {
            const existingIds = new Set(prev.map((s) => s.id));
            const uniqueIncoming = incomingStories.filter((s) => !existingIds.has(s.id));
            return [...prev, ...uniqueIncoming];
          });
        } else {
          setStories(incomingStories);
        }

        setOffset(targetOffset);
        setHasMore(incomingHasMore);
        setLastUpdated(new Date());
      } catch (err: unknown) {
        if (!isMountedRef.current) return;
        const msg = err instanceof Error ? err.message : 'Error loading intelligence feed';
        if (!isAppend) {
          setErrorMessage(msg);
        }
      } finally {
        if (isMountedRef.current) {
          setIsLoading(false);
          setIsRefreshing(false);
          setIsLoadingMore(false);
        }
      }
    },
    [mode, activeCategoryId, importanceFilter, sortBy]
  );

  // 4. Visibility-aware 60s background polling
  useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null;

    const startPolling = () => {
      if (!intervalId) {
        intervalId = setInterval(() => {
          if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
            executeFetch(0, false);
          }
        }, POLLING_INTERVAL_MS);
      }
    };

    const stopPolling = () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        startPolling();
      } else {
        stopPolling();
      }
    };

    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      startPolling();
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [executeFetch]);

  // Handlers
  const handleToggleMode = (newMode: 'CATEGORY' | 'ALL') => {
    setIsLoading(true);
    setMode(newMode);
    setActiveCategoryId(null);
    setOffset(0);
  };

  const handleSelectCategory = (catId: string | null) => {
    setIsLoading(true);
    setActiveCategoryId(catId);
    setOffset(0);
  };

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

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header Controls Bar */}
      <FeedHeaderControls
        mode={mode}
        onToggleMode={handleToggleMode}
        selectedCategoryIds={userCategoryIds}
        activeCategoryId={activeCategoryId}
        onSelectCategory={handleSelectCategory}
        categoryNamesMap={categoryNamesMap}
        importanceFilter={importanceFilter}
        onChangeImportance={(minImp) => {
          setImportanceFilter(minImp);
          setOffset(0);
        }}
        sortBy={sortBy}
        onChangeSortBy={(sort) => {
          setSortBy(sort);
          setOffset(0);
        }}
        isRefreshing={isRefreshing}
        onRefresh={handleRefresh}
        lastUpdated={lastUpdated}
        onOpenManageTopics={onOpenManageTopics}
      />

      {/* Main Feed Content Area */}
      {isLoading ? (
        <FeedSkeleton />
      ) : errorMessage ? (
        <FeedEmptyState
          type="error"
          errorMessage={errorMessage}
          onRetry={handleRefresh}
        />
      ) : mode === 'CATEGORY' && userCategoryIds.length === 0 ? (
        <FeedEmptyState
          type="no-categories"
          onOpenManageTopics={onOpenManageTopics}
          onSwitchToAll={() => handleToggleMode('ALL')}
        />
      ) : stories.length === 0 ? (
        <FeedEmptyState
          type={mode === 'CATEGORY' ? 'no-matching-stories' : 'all-empty'}
          onRetry={handleRefresh}
          onSwitchToAll={() => handleToggleMode('ALL')}
          onOpenManageTopics={onOpenManageTopics}
        />
      ) : (
        <div className="space-y-10">
          {/* Stories Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {stories.map((story) => (
              <FeedCard
                key={story.id}
                story={story}
                onOpenDetail={(s) => setDetailStory(s)}
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
                    <span>Loading more stories...</span>
                  </>
                ) : (
                  <span>Load More Stories</span>
                )}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Story Detail Slide-over / Modal */}
      {detailStory && (
        <StoryDetailModal
          key={detailStory.id}
          story={detailStory}
          isOpen={true}
          onClose={() => setDetailStory(null)}
        />
      )}
    </div>
  );
}
