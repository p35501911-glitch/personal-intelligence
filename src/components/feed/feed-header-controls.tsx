'use client';

import React from 'react';
import { Globe, RefreshCw, Sparkles, Filter, SlidersHorizontal } from 'lucide-react';

interface FeedHeaderControlsProps {
  mode: 'CATEGORY' | 'ALL';
  onToggleMode: (newMode: 'CATEGORY' | 'ALL') => void;
  selectedCategoryIds: string[];
  activeCategoryId: string | null;
  onSelectCategory: (categoryId: string | null) => void;
  categoryNamesMap: Record<string, string>;
  importanceFilter: number | null;
  onChangeImportance: (minImportance: number | null) => void;
  sortBy: 'relevance' | 'recent' | 'importance';
  onChangeSortBy: (sort: 'relevance' | 'recent' | 'importance') => void;
  isRefreshing: boolean;
  onRefresh: () => void;
  lastUpdated: Date | null;
  onOpenManageTopics?: () => void;
}

export function FeedHeaderControls({
  mode,
  onToggleMode,
  selectedCategoryIds,
  activeCategoryId,
  onSelectCategory,
  categoryNamesMap,
  importanceFilter,
  onChangeImportance,
  sortBy,
  onChangeSortBy,
  isRefreshing,
  onRefresh,
  lastUpdated,
  onOpenManageTopics,
}: FeedHeaderControlsProps) {
  return (
    <div className="bg-slate-900/80 border border-slate-800 backdrop-blur-md rounded-2xl p-5 mb-8 shadow-xl space-y-4">
      {/* Top Controls Row */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Left: Mode Switcher (My Topics vs ALL) */}
        <div className="flex items-center bg-slate-950 p-1.5 rounded-xl border border-slate-800/80 self-start">
          <button
            type="button"
            onClick={() => onToggleMode('CATEGORY')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5 ${
              mode === 'CATEGORY'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>My Topics</span>
            {selectedCategoryIds.length > 0 && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-indigo-900/60 border border-indigo-400/30 text-indigo-200">
                {selectedCategoryIds.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => onToggleMode('ALL')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5 ${
              mode === 'ALL'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Global Wire (ALL)</span>
          </button>
        </div>

        {/* Right: Filters & Refresh Button */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Importance Filter */}
          <div className="flex items-center space-x-1.5 text-xs text-slate-400">
            <Filter className="w-3.5 h-3.5 text-slate-500" />
            <select
              value={importanceFilter ?? ''}
              onChange={(e) => {
                const val = e.target.value;
                onChangeImportance(val === '' ? null : Number(val));
              }}
              className="bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-200 text-xs rounded-xl px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
            >
              <option value="">All Importance</option>
              <option value="0.8">Critical Only (≥0.80)</option>
              <option value="0.6">High & Above (≥0.60)</option>
              <option value="0.4">Medium & Above (≥0.40)</option>
            </select>
          </div>

          {/* Sort Filter */}
          <div className="flex items-center space-x-1.5 text-xs text-slate-400">
            <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500" />
            <select
              value={sortBy}
              onChange={(e) => onChangeSortBy(e.target.value as 'relevance' | 'recent' | 'importance')}
              className="bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-200 text-xs rounded-xl px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
            >
              <option value="relevance">Top Relevance</option>
              <option value="recent">Newest First</option>
              <option value="importance">Highest Importance</option>
            </select>
          </div>

          {/* Refresh Action */}
          <button
            type="button"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700 flex items-center space-x-1.5 transition disabled:opacity-50"
            title="Refresh feed"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-indigo-400' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {/* Sub-Bar: Selected Category Quick-Pills (when in CATEGORY mode) */}
      {mode === 'CATEGORY' && (
        <div className="pt-3 border-t border-slate-800/60 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => onSelectCategory(null)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition ${
                activeCategoryId === null
                  ? 'bg-indigo-950 border border-indigo-500/40 text-indigo-300'
                  : 'bg-slate-950/60 border border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              All My Topics ({selectedCategoryIds.length})
            </button>

            {selectedCategoryIds.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => onSelectCategory(activeCategoryId === id ? null : id)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition ${
                  activeCategoryId === id
                    ? 'bg-indigo-950 border border-indigo-500/40 text-indigo-300'
                    : 'bg-slate-950/60 border border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {categoryNamesMap[id] || id}
              </button>
            ))}
          </div>

          {onOpenManageTopics && (
            <button
              type="button"
              onClick={onOpenManageTopics}
              className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold transition"
            >
              Manage Topics →
            </button>
          )}
        </div>
      )}

      {/* Freshness Status text */}
      <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
        <span className="flex items-center space-x-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
          <span>Auto-refresh active (60s polling)</span>
        </span>
        {lastUpdated && (
          <span>
            Updated {lastUpdated.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
        )}
      </div>
    </div>
  );
}
