'use client';

import React from 'react';
import type { DigestStory } from '@/server/news/digests/types';
import type { PersonalizedStoryItem } from '@/server/news/relevance';
import { Layers, Globe, Clock, Sparkles } from 'lucide-react';

interface DigestStoryListProps {
  stories: DigestStory[];
  onOpenStory?: (story: PersonalizedStoryItem) => void;
}

export function DigestStoryList({ stories, onOpenStory }: DigestStoryListProps) {
  if (!stories || stories.length === 0) return null;

  return (
    <section className="space-y-4 pt-4">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center space-x-2">
          <Layers className="w-4 h-4 text-indigo-400" />
          <h2 className="text-sm sm:text-base font-bold text-white uppercase tracking-wider">
            Included Stories ({stories.length})
          </h2>
        </div>
        <span className="text-xs text-slate-500">Click story to open full dossier</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {stories.map((item) => {
          const s = item.story;
          if (!s) return null;

          const isImportant = item.isImportant || s.importance === 'CRITICAL' || s.importance === 'HIGH';

          return (
            <div
              key={item.id}
              onClick={() => onOpenStory && onOpenStory(s)}
              className="group cursor-pointer rounded-2xl bg-slate-900/40 border border-slate-800/80 hover:border-indigo-500/50 hover:bg-slate-900/70 p-5 transition-all space-y-3 flex flex-col justify-between"
            >
              <div className="space-y-2">
                {/* Meta pills */}
                <div className="flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center space-x-2">
                    <span className="px-2 py-0.5 rounded font-mono font-bold text-[10px] bg-slate-800 text-indigo-300">
                      #{item.rank}
                    </span>
                    {isImportant ? (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/15 border border-rose-500/30 text-rose-400">
                        IMPORTANT
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-800 text-slate-400">
                        NORMAL
                      </span>
                    )}
                  </div>

                  {s.intelligence && (
                    <span className="flex items-center space-x-1 text-[10px] text-indigo-400 font-medium">
                      <Sparkles className="w-3 h-3" />
                      <span>{s.intelligence.tier === 'important' ? 'Deep AI' : 'Brief'}</span>
                    </span>
                  )}
                </div>

                {/* Canonical Title */}
                <h3 className="text-sm font-bold text-white group-hover:text-indigo-300 transition-colors line-clamp-2 leading-snug">
                  {s.canonicalTitle}
                </h3>

                {/* Summary / Key takeaways snippet */}
                <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                  {s.summary || 'Click to view intelligence dossier and publisher coverage.'}
                </p>
              </div>

              {/* Footer source coverage */}
              <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-500">
                <span className="flex items-center space-x-1.5">
                  <Globe className="w-3 h-3" />
                  <span>{s.sourceCount} publisher{s.sourceCount === 1 ? '' : 's'}</span>
                </span>

                <span className="flex items-center space-x-1">
                  <Clock className="w-3 h-3" />
                  <span>{s.latestPublishedAt ? new Date(s.latestPublishedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''}</span>
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
