'use client';

import React, { useState } from 'react';
import { FeedContainer } from '@/components/feed';
import { CategoryBrowser } from '@/components/categories/category-browser';
import { SavedIntelligenceView } from '@/components/saved-stories';
import { DigestView } from '@/components/digests';
import { CategoryNode } from '@/types/category';
import { Sparkles, Sliders, Bookmark, BookOpen } from 'lucide-react';

interface DashboardViewProps {
  initialCategories: CategoryNode[];
}

export function DashboardView({ initialCategories }: DashboardViewProps) {
  const [activeTab, setActiveTab] = useState<'feed' | 'digests' | 'saved' | 'categories'>('feed');

  return (
    <div className="flex-1 flex flex-col">
      {/* Sub-Navigation Tabs */}
      <div className="border-b border-slate-800/80 bg-slate-950/60 sticky top-16 z-30 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
          <div className="flex space-x-1 sm:space-x-4">
            <button
              type="button"
              onClick={() => setActiveTab('feed')}
              className={`py-3.5 px-3 sm:px-4 text-xs sm:text-sm font-bold border-b-2 transition-all flex items-center space-x-2 ${
                activeTab === 'feed'
                  ? 'border-indigo-500 text-white'
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
              }`}
            >
              <Sparkles className="w-4 h-4 text-indigo-400" />
              <span>Live Intelligence Feed</span>
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('digests')}
              className={`py-3.5 px-3 sm:px-4 text-xs sm:text-sm font-bold border-b-2 transition-all flex items-center space-x-2 ${
                activeTab === 'digests'
                  ? 'border-indigo-500 text-white'
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
              }`}
            >
              <BookOpen className={`w-4 h-4 ${activeTab === 'digests' ? 'text-indigo-400' : 'text-slate-400'}`} />
              <span>Intelligence Briefings</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('saved')}
              className={`py-3.5 px-3 sm:px-4 text-xs sm:text-sm font-bold border-b-2 transition-all flex items-center space-x-2 ${
                activeTab === 'saved'
                  ? 'border-indigo-500 text-white'
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
              }`}
            >
              <Bookmark className={`w-4 h-4 ${activeTab === 'saved' ? 'fill-indigo-400/20 text-indigo-400' : 'text-slate-400'}`} />
              <span>Saved Intelligence</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('categories')}
              className={`py-3.5 px-3 sm:px-4 text-xs sm:text-sm font-bold border-b-2 transition-all flex items-center space-x-2 ${
                activeTab === 'categories'
                  ? 'border-indigo-500 text-white'
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
              }`}
            >
              <Sliders className="w-4 h-4 text-slate-400" />
              <span>Manage Topics</span>
            </button>
          </div>

          <div className="hidden sm:flex items-center text-xs text-slate-500">
            <span>Free Tier • Briefings, Dossier & Topics</span>
          </div>
        </div>
      </div>

      {/* Tab Panels */}
      <div className="flex-1">
        {activeTab === 'feed' ? (
          <FeedContainer onOpenManageTopics={() => setActiveTab('categories')} />
        ) : activeTab === 'digests' ? (
          <DigestView onNavigateToTopics={() => setActiveTab('categories')} />
        ) : activeTab === 'saved' ? (
          <SavedIntelligenceView onNavigateToFeed={() => setActiveTab('feed')} />
        ) : (
          <CategoryBrowser initialCategories={initialCategories} />
        )}
      </div>
    </div>
  );
}
