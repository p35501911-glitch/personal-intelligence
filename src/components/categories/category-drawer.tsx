'use client';

import React, { useState } from 'react';
import { CategoryNode } from '@/types/category';
import { CategoryIcon } from './icon-helper';
import { X, Check, ChevronDown, ChevronRight, AlertCircle } from 'lucide-react';

interface CategoryDrawerProps {
  category: CategoryNode | null;
  isOpen: boolean;
  onClose: () => void;
  selectedIds: string[];
  onToggleSelect: (id: string, name: string) => void;
  maxSelections: number;
}

export function CategoryDrawer({
  category,
  isOpen,
  onClose,
  selectedIds,
  onToggleSelect,
  maxSelections,
}: CategoryDrawerProps) {
  const [expandedSubIds, setExpandedSubIds] = useState<Record<string, boolean>>({});

  if (!isOpen || !category) return null;

  const toggleSubExpanded = (subId: string) => {
    setExpandedSubIds((prev) => ({ ...prev, [subId]: !prev[subId] }));
  };

  const isMainSelected = selectedIds.includes(category.id);
  const isAtLimit = selectedIds.length >= maxSelections;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm transition-all duration-200">
      <div className="relative w-full max-w-2xl max-h-[85vh] flex flex-col bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden text-slate-100">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-800 bg-slate-900/60">
          <div className="flex items-center space-x-3">
            <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-indigo-400">
              <CategoryIcon name={category.icon} className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-xl font-bold tracking-tight text-white">{category.name}</h2>
                <span className="px-2 py-0.5 text-xs font-semibold bg-slate-800 text-slate-400 rounded-md border border-slate-700">
                  Level 1 • Main
                </span>
              </div>
              <p className="text-sm text-slate-400 mt-0.5 line-clamp-1">{category.description}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            aria-label="Close drawer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick select main category banner */}
        <div className="px-6 py-3.5 bg-slate-800/40 border-b border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="text-xs font-medium text-slate-300">
              Follow all <span className="text-indigo-300 font-semibold">{category.name}</span> content (broadest scope):
            </span>
          </div>
          <button
            onClick={() => onToggleSelect(category.id, category.name)}
            disabled={!isMainSelected && isAtLimit}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-all ${
              isMainSelected
                ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/30'
                : isAtLimit
                ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700/50'
                : 'bg-slate-800 text-slate-200 hover:bg-slate-700 border border-slate-700 hover:text-white'
            }`}
          >
            {isMainSelected ? (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>Selected</span>
              </>
            ) : (
              <span>Select Entire Main Category</span>
            )}
          </button>
        </div>

        {/* Subcategories & Topics Scrollable Tree */}
        <div className="flex-1 p-6 overflow-y-auto space-y-4">
          <div className="flex items-center justify-between text-xs font-medium text-slate-400 pb-1">
            <span>SUBCATEGORIES & TOPICS</span>
            <span>Select up to {maxSelections} total across all categories</span>
          </div>

          {(!category.children || category.children.length === 0) ? (
            <div className="py-12 text-center text-slate-500 text-sm">
              No specific subcategories configured for this category yet.
            </div>
          ) : (
            <div className="space-y-3">
              {category.children.map((subcat) => {
                const isSubSelected = selectedIds.includes(subcat.id);
                const isSubExpanded = !!expandedSubIds[subcat.id];
                const subDisabled = !isSubSelected && isAtLimit;
                const hasTopics = subcat.children && subcat.children.length > 0;

                return (
                  <div
                    key={subcat.id}
                    className="border border-slate-800 rounded-xl bg-slate-900/40 overflow-hidden transition-all hover:border-slate-700"
                  >
                    {/* Subcategory Row (Level 2) */}
                    <div className="p-4 flex items-center justify-between gap-3">
                      <div className="flex items-center space-x-3 min-w-0">
                        {hasTopics && (
                          <button
                            type="button"
                            onClick={() => toggleSubExpanded(subcat.id)}
                            className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition"
                          >
                            {isSubExpanded ? (
                              <ChevronDown className="w-4 h-4" />
                            ) : (
                              <ChevronRight className="w-4 h-4" />
                            )}
                          </button>
                        )}
                        <div className="p-2 bg-slate-800/80 rounded-lg text-slate-300">
                          <CategoryIcon name={subcat.icon} className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center space-x-2">
                            <span className="text-sm font-semibold text-white truncate">
                              {subcat.name}
                            </span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700/50">
                              L2 Subcategory
                            </span>
                          </div>
                          {subcat.description && (
                            <p className="text-xs text-slate-400 truncate mt-0.5">
                              {subcat.description}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Select Subcategory Checkbox / Button */}
                      <button
                        onClick={() => onToggleSelect(subcat.id, `${category.name} → ${subcat.name}`)}
                        disabled={subDisabled}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-all whitespace-nowrap ${
                          isSubSelected
                            ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/30'
                            : subDisabled
                            ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700/40'
                            : 'bg-slate-800/90 text-slate-200 hover:bg-slate-700 border border-slate-700 hover:text-white'
                        }`}
                      >
                        {isSubSelected ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span>Selected</span>
                          </>
                        ) : (
                          <span>Select Subcategory</span>
                        )}
                      </button>
                    </div>

                    {/* Level 3 Topics List (Expanded) */}
                    {hasTopics && isSubExpanded && (
                      <div className="bg-slate-950/60 border-t border-slate-800/70 p-3.5 pl-11 space-y-2">
                        <div className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase mb-2">
                          Specific Topics in {subcat.name}:
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {subcat.children!.map((topic) => {
                            const isTopicSelected = selectedIds.includes(topic.id);
                            const topicDisabled = !isTopicSelected && isAtLimit;

                            return (
                              <button
                                key={topic.id}
                                onClick={() =>
                                  onToggleSelect(
                                    topic.id,
                                    `${category.name} → ${subcat.name} → ${topic.name}`
                                  )
                                }
                                disabled={topicDisabled}
                                className={`text-left p-2.5 rounded-lg border text-xs flex items-start justify-between gap-2 transition-all ${
                                  isTopicSelected
                                    ? 'bg-indigo-950/60 border-indigo-500/50 text-indigo-100 shadow-sm'
                                    : topicDisabled
                                    ? 'bg-slate-900/40 border-slate-800/40 text-slate-500 cursor-not-allowed'
                                    : 'bg-slate-900/80 border-slate-800 text-slate-300 hover:border-slate-700 hover:text-white'
                                }`}
                              >
                                <div>
                                  <div className="font-medium">{topic.name}</div>
                                  {topic.description && (
                                    <div className="text-[10px] text-slate-400 mt-0.5 line-clamp-1">
                                      {topic.description}
                                    </div>
                                  )}
                                </div>
                                <div
                                  className={`w-4 h-4 mt-0.5 rounded flex items-center justify-center border shrink-0 ${
                                    isTopicSelected
                                      ? 'bg-indigo-600 border-indigo-500 text-white'
                                      : 'border-slate-700 bg-slate-800'
                                  }`}
                                >
                                  {isTopicSelected && <Check className="w-3 h-3" />}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer info */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/80 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center space-x-1.5">
            <AlertCircle className="w-4 h-4 text-indigo-400" />
            <span>Selections automatically tailor your personalized intelligence feed.</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-lg transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
