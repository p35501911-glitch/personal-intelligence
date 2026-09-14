'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CategoryNode } from '@/types/category';
import { CategoryIcon } from '@/components/categories/icon-helper';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Globe,
  Sparkles,
  AlertCircle,
  ArrowRight,
  Loader2,
  CheckCircle2,
} from 'lucide-react';

interface OnboardingCategorySelectorProps {
  categories: CategoryNode[];
  onContinueSuccess?: () => void;
}

export function OnboardingCategorySelector({
  categories,
  onContinueSuccess,
}: OnboardingCategorySelectorProps) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [mode, setMode] = useState<'CATEGORY' | 'ALL'>('CATEGORY');
  const [expandedMainId, setExpandedMainId] = useState<string | null>('cat-tech');
  const [expandedSubId, setExpandedSubId] = useState<string | null>('cat-tech-ai');
  const [warningMessage, setWarningMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);

  const MAX_LIMIT = 5;

  // Load existing preferences on mount
  useEffect(() => {
    async function fetchPreferences() {
      try {
        const res = await fetch('/api/user/categories');
        if (res.ok) {
          const data = await res.json();
          if (data.mode === 'ALL') {
            setMode('ALL');
            setSelectedIds([]);
          } else if (Array.isArray(data.categoryIds)) {
            setMode('CATEGORY');
            setSelectedIds(data.categoryIds);
          }
        }
      } catch (err) {
        console.error('Failed to load initial category preferences:', err);
      }
    }
    fetchPreferences();
  }, []);

  // Handle clicking [ ALL ]
  const handleSelectAll = () => {
    setWarningMessage(null);
    setMode('ALL');
    setSelectedIds([]); // Clear individual selections
  };

  // Handle selecting any category/topic
  const handleToggleCategory = (id: string) => {
    setWarningMessage(null);

    // If currently in ALL mode, remove ALL and select this single category
    if (mode === 'ALL') {
      setMode('CATEGORY');
      setSelectedIds([id]);
      return;
    }

    if (selectedIds.includes(id)) {
      // Unselect
      setSelectedIds((prev) => prev.filter((item) => item !== id));
    } else {
      // Check maximum 5 limit
      if (selectedIds.length >= MAX_LIMIT) {
        setWarningMessage('You can select up to 5 categories.');
        return;
      }
      setSelectedIds((prev) => [...prev, id]);
    }
  };

  const toggleMainExpand = (mainId: string) => {
    setExpandedMainId((prev) => (prev === mainId ? null : mainId));
  };

  const toggleSubExpand = (subId: string) => {
    setExpandedSubId((prev) => (prev === subId ? null : subId));
  };

  // Handle Continue button
  const handleContinue = async () => {
    setIsSaving(true);
    setWarningMessage(null);

    try {
      const res = await fetch('/api/user/categories', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          categoryIds: mode === 'ALL' ? [] : selectedIds,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to save selections.');
      }

      setIsCompleted(true);
      if (onContinueSuccess) {
        onContinueSuccess();
      } else {
        router.push('/');
        router.refresh();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error saving selections.';
      setWarningMessage(msg);
    } finally {
      setIsSaving(false);
    }
  };

  if (isCompleted) {
    return (
      <div className="max-w-xl mx-auto my-12 p-8 bg-slate-900/90 border border-emerald-500/40 rounded-3xl text-center shadow-2xl backdrop-blur-xl">
        <div className="w-16 h-16 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-lg shadow-emerald-950/40">
          <CheckCircle2 className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-extrabold text-white">Preferences Saved!</h2>
        <p className="text-sm text-slate-300 mt-2.5 leading-relaxed">
          {mode === 'ALL' ? (
            <>You are following <strong>All Categories</strong> globally across the intelligence engine.</>
          ) : (
            <>You selected <strong>{selectedIds.length} categories/topics</strong> to tailor your intelligence feed.</>
          )}
        </p>
        <div className="mt-8 pt-6 border-t border-slate-800 flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/"
            className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-indigo-600/30 transition-all flex items-center justify-center space-x-2"
          >
            <span>Go to Dashboard</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
          <button
            onClick={() => setIsCompleted(false)}
            className="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-xs rounded-xl border border-slate-700 transition-all"
          >
            Edit Selections
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[11px] font-bold uppercase tracking-wider mb-3">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Step 1D — Onboarding</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
          Choose what you want to follow
        </h1>
        <p className="text-slate-400 text-sm mt-2 font-medium">
          Select up to <span className="text-indigo-400 font-semibold">5</span> categories or topics
        </p>
      </div>

      {/* Top Controls: [ All ] Button & Live Status */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 mb-6 flex items-center justify-between shadow-lg backdrop-blur-md">
        <button
          type="button"
          onClick={handleSelectAll}
          className={`px-5 py-2.5 rounded-xl font-bold text-xs flex items-center space-x-2 transition-all shadow-sm ${
            mode === 'ALL'
              ? 'bg-indigo-600 text-white shadow-indigo-600/40 ring-2 ring-indigo-400'
              : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 hover:text-white'
          }`}
        >
          <Globe className="w-4 h-4" />
          <span>[ All ]</span>
        </button>

        {/* Selected Counter */}
        <div className="flex items-center space-x-2">
          <span className="text-xs text-slate-400 font-medium">Selected:</span>
          <span
            className={`px-3 py-1 rounded-lg text-xs font-black tracking-wide border ${
              mode === 'ALL'
                ? 'bg-indigo-950/80 border-indigo-500/50 text-indigo-300'
                : selectedIds.length === MAX_LIMIT
                ? 'bg-amber-950/80 border-amber-500/50 text-amber-300'
                : 'bg-slate-800 border-slate-700 text-slate-200'
            }`}
          >
            {mode === 'ALL' ? 'ALL' : `${selectedIds.length} / ${MAX_LIMIT}`}
          </span>
        </div>
      </div>

      {/* Warning Message Banner (Step 1E validation feedback) */}
      {warningMessage && (
        <div className="mb-6 p-4 rounded-xl bg-amber-950/60 border border-amber-500/40 text-amber-200 text-xs font-semibold flex items-center space-x-2 animate-in fade-in duration-200">
          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
          <span>{warningMessage}</span>
        </div>
      )}

      {/* 15 Main Categories Hierarchical Accordion List */}
      <div className="space-y-3 mb-10">
        {categories.map((cat) => {
          const isMainExpanded = expandedMainId === cat.id;
          const isMainSelected = mode !== 'ALL' && selectedIds.includes(cat.id);

          // Subtree selected count
          let branchCount = 0;
          if (isMainSelected) branchCount++;
          cat.children?.forEach((sub) => {
            if (mode !== 'ALL' && selectedIds.includes(sub.id)) branchCount++;
            sub.children?.forEach((top) => {
              if (mode !== 'ALL' && selectedIds.includes(top.id)) branchCount++;
            });
          });

          return (
            <div
              key={cat.id}
              className={`border rounded-2xl overflow-hidden transition-all duration-200 ${
                branchCount > 0
                  ? 'border-indigo-500/50 bg-slate-900/90 shadow-md shadow-indigo-950/20'
                  : 'border-slate-800/90 bg-slate-900/40 hover:border-slate-700/80'
              }`}
            >
              {/* Level 1: Main Category Header */}
              <div className="p-4 flex items-center justify-between gap-3">
                <div
                  onClick={() => toggleMainExpand(cat.id)}
                  className="flex items-center space-x-3.5 flex-1 cursor-pointer select-none min-w-0"
                >
                  <div className="p-2.5 rounded-xl bg-slate-800 text-indigo-400 border border-slate-700/60 shrink-0">
                    <CategoryIcon name={cat.icon} className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center space-x-2">
                      <h3 className="font-bold text-sm text-white truncate">{cat.name}</h3>
                      {branchCount > 0 && (
                        <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-indigo-600/30 border border-indigo-500/40 text-indigo-300">
                          {branchCount} selected
                        </span>
                      )}
                    </div>
                    {cat.description && (
                      <p className="text-xs text-slate-400 truncate mt-0.5">{cat.description}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center space-x-2 shrink-0">
                  {/* Select Main Category directly */}
                  <button
                    type="button"
                    onClick={() => handleToggleCategory(cat.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center space-x-1.5 transition-all ${
                      isMainSelected
                        ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/30'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700'
                    }`}
                  >
                    {isMainSelected ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Selected</span>
                      </>
                    ) : (
                      <span>Select Main</span>
                    )}
                  </button>

                  {/* Expand / Collapse Button */}
                  <button
                    type="button"
                    onClick={() => toggleMainExpand(cat.id)}
                    className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
                    aria-label="Toggle subcategories"
                  >
                    {isMainExpanded ? (
                      <ChevronDown className="w-4 h-4" />
                    ) : (
                      <ChevronRight className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Level 2 Subcategories (Expanded) */}
              {isMainExpanded && cat.children && cat.children.length > 0 && (
                <div className="border-t border-slate-800/80 bg-slate-950/60 p-4 pl-8 space-y-3">
                  <div className="text-[11px] font-bold tracking-wider text-slate-400 uppercase mb-2">
                    {cat.name} Subcategories:
                  </div>

                  {cat.children.map((subcat) => {
                    const isSubExpanded = expandedSubId === subcat.id;
                    const isSubSelected = mode !== 'ALL' && selectedIds.includes(subcat.id);
                    const hasTopics = subcat.children && subcat.children.length > 0;

                    return (
                      <div
                        key={subcat.id}
                        className="border border-slate-800 rounded-xl bg-slate-900/60 overflow-hidden"
                      >
                        {/* Subcategory Row */}
                        <div className="p-3.5 flex items-center justify-between gap-3">
                          <div
                            onClick={() => hasTopics && toggleSubExpand(subcat.id)}
                            className={`flex items-center space-x-2.5 flex-1 min-w-0 ${
                              hasTopics ? 'cursor-pointer select-none' : ''
                            }`}
                          >
                            {hasTopics && (
                              <div className="text-slate-400 hover:text-white">
                                {isSubExpanded ? (
                                  <ChevronDown className="w-3.5 h-3.5" />
                                ) : (
                                  <ChevronRight className="w-3.5 h-3.5" />
                                )}
                              </div>
                            )}
                            <div className="p-1.5 rounded-lg bg-slate-800 text-slate-300">
                              <CategoryIcon name={subcat.icon} className="w-3.5 h-3.5" />
                            </div>
                            <span className="text-xs font-bold text-slate-200 truncate">
                              {subcat.name}
                            </span>
                          </div>

                          {/* Select Subcategory */}
                          <button
                            type="button"
                            onClick={() => handleToggleCategory(subcat.id)}
                            className={`px-2.5 py-1 rounded-md text-[11px] font-bold flex items-center space-x-1 transition-all ${
                              isSubSelected
                                ? 'bg-indigo-600 text-white'
                                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
                            }`}
                          >
                            {isSubSelected ? (
                              <>
                                <Check className="w-3 h-3" />
                                <span>Selected</span>
                              </>
                            ) : (
                              <span>Select Sub</span>
                            )}
                          </button>
                        </div>

                        {/* Level 3 Topics (Expanded) */}
                        {isSubExpanded && hasTopics && (
                          <div className="border-t border-slate-800 bg-slate-950/80 p-3 pl-8 grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {subcat.children!.map((topic) => {
                              const isTopicSelected =
                                mode !== 'ALL' && selectedIds.includes(topic.id);

                              return (
                                <button
                                  key={topic.id}
                                  type="button"
                                  onClick={() => handleToggleCategory(topic.id)}
                                  className={`p-2.5 rounded-lg border text-left text-xs flex items-center justify-between transition-all ${
                                    isTopicSelected
                                      ? 'bg-indigo-950/60 border-indigo-500/50 text-indigo-100 font-bold'
                                      : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:border-slate-700'
                                  }`}
                                >
                                  <span className="truncate mr-2">{topic.name}</span>
                                  <div
                                    className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
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
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Sticky Bottom Bar with [ Continue ] Button */}
      <div className="sticky bottom-6 z-30 p-4 bg-slate-950/90 border border-slate-800/90 rounded-2xl shadow-2xl backdrop-blur-xl flex items-center justify-between gap-4">
        <div className="text-xs text-slate-400">
          {mode === 'ALL' ? (
            <span className="text-indigo-400 font-bold">Mode: Following ALL categories</span>
          ) : (
            <span>
              <strong>{selectedIds.length}</strong> of <strong>{MAX_LIMIT}</strong> categories selected
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={handleContinue}
          disabled={isSaving || (mode === 'CATEGORY' && selectedIds.length === 0)}
          className={`px-8 py-3 rounded-xl font-extrabold text-xs flex items-center space-x-2 transition-all shadow-lg ${
            isSaving || (mode === 'CATEGORY' && selectedIds.length === 0)
              ? 'bg-slate-800 text-slate-500 border border-slate-700/50 cursor-not-allowed'
              : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/30 hover:scale-[1.02]'
          }`}
        >
          {isSaving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Saving...</span>
            </>
          ) : (
            <>
              <span>[ Continue ]</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}
