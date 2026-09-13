'use client';

import React from 'react';

export function FeedSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="flex flex-col justify-between bg-slate-900/40 border border-slate-800/60 rounded-2xl p-5 animate-pulse space-y-4"
        >
          <div className="space-y-3">
            {/* Top pill skeleton */}
            <div className="flex items-center justify-between">
              <div className="w-20 h-4 bg-slate-800 rounded-md"></div>
              <div className="w-14 h-4 bg-slate-800 rounded-md"></div>
            </div>

            {/* Title skeleton */}
            <div className="space-y-2">
              <div className="w-full h-5 bg-slate-800 rounded-md"></div>
              <div className="w-3/4 h-5 bg-slate-800 rounded-md"></div>
            </div>

            {/* Image skeleton */}
            <div className="w-full h-36 bg-slate-800/60 rounded-xl"></div>

            {/* Synopsis skeleton */}
            <div className="space-y-1.5 pt-1">
              <div className="w-full h-3 bg-slate-800/50 rounded"></div>
              <div className="w-5/6 h-3 bg-slate-800/50 rounded"></div>
            </div>
          </div>

          {/* Footer skeleton */}
          <div className="pt-3 border-t border-slate-800/60 flex items-center justify-between">
            <div className="w-28 h-3 bg-slate-800 rounded"></div>
            <div className="w-16 h-3 bg-slate-800 rounded"></div>
          </div>
        </div>
      ))}
    </div>
  );
}
