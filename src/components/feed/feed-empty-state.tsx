'use client';

import React from 'react';
import { Sparkles, Globe, AlertCircle, RefreshCw, Layers } from 'lucide-react';

interface FeedEmptyStateProps {
  type: 'no-categories' | 'no-matching-stories' | 'all-empty' | 'error';
  errorMessage?: string;
  onRetry?: () => void;
  onSwitchToAll?: () => void;
  onOpenManageTopics?: () => void;
}

export function FeedEmptyState({
  type,
  errorMessage,
  onRetry,
  onSwitchToAll,
  onOpenManageTopics,
}: FeedEmptyStateProps) {
  if (type === 'error') {
    return (
      <div className="text-center py-16 px-4 bg-slate-900/40 border border-red-500/20 rounded-2xl max-w-xl mx-auto my-8">
        <div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h3 className="text-lg font-bold text-white mb-2">Unable to Load Intelligence Feed</h3>
        <p className="text-sm text-slate-400 max-w-md mx-auto mb-6">
          {errorMessage || 'There was an issue reaching the intelligence engine. Please retry.'}
        </p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition inline-flex items-center space-x-2"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Retry Feed</span>
          </button>
        )}
      </div>
    );
  }

  if (type === 'no-categories') {
    return (
      <div className="text-center py-16 px-4 bg-slate-900/40 border border-slate-800 rounded-2xl max-w-xl mx-auto my-8">
        <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center mx-auto mb-4">
          <Sparkles className="w-6 h-6" />
        </div>
        <h3 className="text-lg font-bold text-white mb-2">No Topics Selected Yet</h3>
        <p className="text-sm text-slate-400 max-w-md mx-auto mb-6 leading-relaxed">
          Choose up to 5 categories or topics to build your personalized intelligence stream, or switch to global coverage.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          {onOpenManageTopics && (
            <button
              type="button"
              onClick={onOpenManageTopics}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition shadow-lg shadow-indigo-600/30"
            >
              Choose Topics Now
            </button>
          )}
          {onSwitchToAll && (
            <button
              type="button"
              onClick={onSwitchToAll}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
            >
              Follow Everything (ALL)
            </button>
          )}
        </div>
      </div>
    );
  }

  if (type === 'no-matching-stories') {
    return (
      <div className="text-center py-16 px-4 bg-slate-900/40 border border-slate-800 rounded-2xl max-w-xl mx-auto my-8">
        <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto mb-4">
          <Layers className="w-6 h-6" />
        </div>
        <h3 className="text-lg font-bold text-white mb-2">No updates yet for your selected categories</h3>
        <p className="text-sm text-slate-400 max-w-md mx-auto mb-6 leading-relaxed">
          New stories are continuously ingested and clustered by our background worker. You can explore the global wire in the meantime.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          {onSwitchToAll && (
            <button
              type="button"
              onClick={onSwitchToAll}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition shadow-lg shadow-indigo-600/30 inline-flex items-center space-x-1.5"
            >
              <Globe className="w-4 h-4" />
              <span>Switch to Global Wire (ALL)</span>
            </button>
          )}
          {onOpenManageTopics && (
            <button
              type="button"
              onClick={onOpenManageTopics}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
            >
              Adjust Topics
            </button>
          )}
        </div>
      </div>
    );
  }

  // 'all-empty'
  return (
    <div className="text-center py-16 px-4 bg-slate-900/40 border border-slate-800 rounded-2xl max-w-xl mx-auto my-8">
      <div className="w-12 h-12 rounded-2xl bg-slate-800/80 border border-slate-700 text-slate-400 flex items-center justify-center mx-auto mb-4">
        <Globe className="w-6 h-6" />
      </div>
      <h3 className="text-lg font-bold text-white mb-2">No updates available yet</h3>
      <p className="text-sm text-slate-400 max-w-md mx-auto mb-6 leading-relaxed">
        The news ingestion pipeline is actively listening for new RSS and wire dispatches. Check back shortly or trigger an ingestion cycle.
      </p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition inline-flex items-center space-x-2"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Refresh Now</span>
        </button>
      )}
    </div>
  );
}
