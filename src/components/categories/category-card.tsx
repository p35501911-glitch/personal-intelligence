'use client';

import React from 'react';
import { CategoryNode } from '@/types/category';
import { CategoryIcon } from './icon-helper';
import { ChevronRight, Check } from 'lucide-react';

interface CategoryCardProps {
  category: CategoryNode;
  selectedIds: string[];
  onOpenDrawer: (category: CategoryNode) => void;
  onQuickToggleMain: (id: string, name: string) => void;
  isAtLimit: boolean;
}

export function CategoryCard({
  category,
  selectedIds,
  onOpenDrawer,
  onQuickToggleMain,
  isAtLimit,
}: CategoryCardProps) {
  const isMainSelected = selectedIds.includes(category.id);

  // Count how many items in this branch (main, sub, or topic) are selected
  let branchSelectedCount = 0;
  if (isMainSelected) branchSelectedCount++;
  category.children?.forEach((sub) => {
    if (selectedIds.includes(sub.id)) branchSelectedCount++;
    sub.children?.forEach((top) => {
      if (selectedIds.includes(top.id)) branchSelectedCount++;
    });
  });

  const subcategoryPreview = category.children?.slice(0, 3).map((s) => s.name).join(' · ');

  return (
    <div className={`group relative flex flex-col justify-between p-5 rounded-2xl border transition-all duration-200 ${
      branchSelectedCount > 0
        ? 'bg-slate-900/90 border-indigo-500/60 shadow-lg shadow-indigo-950/30 ring-1 ring-indigo-500/20'
        : 'bg-slate-900/50 hover:bg-slate-900/80 border-slate-800 hover:border-slate-700/80'
    }`}>
      {/* Top row */}
      <div>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center space-x-3">
            <div className={`p-3 rounded-xl border transition-colors ${
              branchSelectedCount > 0
                ? 'bg-indigo-600/15 border-indigo-500/30 text-indigo-400'
                : 'bg-slate-800/80 border-slate-700/60 text-slate-300 group-hover:text-indigo-400 group-hover:border-slate-600'
            }`}>
              <CategoryIcon name={category.icon} className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white group-hover:text-indigo-300 transition-colors">
                {category.name}
              </h3>
              {subcategoryPreview && (
                <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">
                  {subcategoryPreview}
                </p>
              )}
            </div>
          </div>

          {/* Branch badge if any item inside is selected */}
          {branchSelectedCount > 0 && (
            <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 flex items-center space-x-1">
              <Check className="w-3 h-3" />
              <span>{branchSelectedCount} selected</span>
            </span>
          )}
        </div>

        {/* Description */}
        {category.description && (
          <p className="text-xs text-slate-400 mt-3.5 line-clamp-2 leading-relaxed">
            {category.description}
          </p>
        )}
      </div>

      {/* Bottom actions */}
      <div className="mt-5 pt-4 border-t border-slate-800/60 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => onQuickToggleMain(category.id, category.name)}
          disabled={!isMainSelected && isAtLimit}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
            isMainSelected
              ? 'bg-indigo-600 text-white border-indigo-500'
              : !isMainSelected && isAtLimit
              ? 'bg-slate-800/40 text-slate-600 border-slate-800 cursor-not-allowed'
              : 'bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-white border-slate-700/60'
          }`}
        >
          {isMainSelected ? 'Selected' : 'Select All ' + category.name}
        </button>

        <button
          type="button"
          onClick={() => onOpenDrawer(category)}
          className="px-3 py-1.5 text-xs font-semibold text-indigo-400 hover:text-indigo-300 flex items-center space-x-1 transition-colors hover:translate-x-0.5"
        >
          <span>Explore Topics</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
