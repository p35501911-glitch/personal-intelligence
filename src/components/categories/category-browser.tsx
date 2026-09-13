'use client';

import React, { useState, useEffect } from 'react';
import { CategoryNode, CategorySelectionMode } from '@/types/category';
import { CategoryCard } from './category-card';
import { CategoryDrawer } from './category-drawer';
import { Globe, X, Sparkles, Check, AlertCircle, Save, Loader2 } from 'lucide-react';

interface CategoryBrowserProps {
  initialCategories: CategoryNode[];
}

export function CategoryBrowser({ initialCategories }: CategoryBrowserProps) {
  const [categories] = useState<CategoryNode[]>(initialCategories);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectionMode, setSelectionMode] = useState<CategorySelectionMode>('CUSTOM');
  const [activeDrawerCategory, setActiveDrawerCategory] = useState<CategoryNode | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const MAX_SELECTIONS = 5;
  const isAtLimit = selectedIds.length >= MAX_SELECTIONS;

  // Compute ID-to-name lookup map
  const selectedLabels = React.useMemo(() => {
    const labelMap: Record<string, string> = {};
    const traverse = (node: CategoryNode, breadcrumb: string) => {
      const currentPath = breadcrumb ? `${breadcrumb} → ${node.name}` : node.name;
      labelMap[node.id] = currentPath;
      if (node.children) {
        node.children.forEach((child) => traverse(child, currentPath));
      }
    };
    categories.forEach((cat) => traverse(cat, ''));
    return labelMap;
  }, [categories]);

  // Load existing preferences on mount
  useEffect(() => {
    async function loadPreferences() {
      try {
        const res = await fetch('/api/user/categories');
        if (res.ok) {
          const data = await res.json();
          if (data.selection_mode === 'ALL') {
            setSelectionMode('ALL');
            setSelectedIds([]);
          } else if (Array.isArray(data.selected_ids)) {
            setSelectedIds(data.selected_ids);
            setSelectionMode('CUSTOM');
          }
        }
      } catch (err) {
        console.error('Error fetching initial preferences:', err);
      }
    }
    loadPreferences();
  }, []);

  const handleToggleSelect = (id: string) => {
    setSaveSuccess(false);
    setErrorMessage(null);

    // If previously in ALL mode, switch to CUSTOM mode upon selecting an item
    if (selectionMode === 'ALL') {
      setSelectionMode('CUSTOM');
      setSelectedIds([id]);
      return;
    }

    if (selectedIds.includes(id)) {
      // Remove
      setSelectedIds((prev) => prev.filter((item) => item !== id));
    } else {
      // Add if under limit
      if (selectedIds.length >= MAX_SELECTIONS) {
        setErrorMessage(`Maximum of ${MAX_SELECTIONS} categories/topics allowed. Remove one to select another.`);
        return;
      }
      setSelectedIds((prev) => [...prev, id]);
    }
  };

  const handleRemove = (id: string) => {
    setSaveSuccess(false);
    setSelectedIds((prev) => prev.filter((item) => item !== id));
  };

  const handleToggleAllMode = () => {
    setSaveSuccess(false);
    setErrorMessage(null);
    if (selectionMode === 'ALL') {
      setSelectionMode('CUSTOM');
    } else {
      setSelectionMode('ALL');
      setSelectedIds([]); // ALL mode doesn't store individual rows
    }
  };

  const handleSavePreferences = async () => {
    setIsSaving(true);
    setSaveSuccess(false);
    setErrorMessage(null);

    try {
      const res = await fetch('/api/user/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category_ids: selectedIds,
          selection_mode: selectionMode,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to save preferences');
      }

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 4000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save preferences';
      setErrorMessage(msg);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      
      {/* Header Section */}
      <div className="text-center max-w-3xl mx-auto mb-10">
        <div className="inline-flex items-center space-x-2 px-3 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold uppercase tracking-wider mb-4">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Personalization Engine</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
          Choose what you want to follow
        </h1>
        <p className="mt-3 text-base text-slate-400 leading-relaxed">
          Select up to <strong className="text-slate-200">5 categories or topics</strong> to tailor your real-time intelligence feed, or choose <strong className="text-indigo-400">All</strong> for global coverage.
        </p>
      </div>

      {/* Control Bar: Counter, ALL Toggle, Save Button */}
      <div className="bg-slate-900/70 border border-slate-800 backdrop-blur-md rounded-2xl p-5 mb-8 flex flex-col md:flex-row items-center justify-between gap-4 shadow-xl">
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          
          {/* Counter Badge */}
          <div className={`px-3.5 py-1.5 rounded-xl border text-xs font-bold flex items-center space-x-2 ${
            selectionMode === 'ALL'
              ? 'bg-indigo-950/60 border-indigo-500/40 text-indigo-300'
              : isAtLimit
              ? 'bg-amber-950/60 border-amber-500/40 text-amber-300'
              : 'bg-slate-800 border-slate-700 text-slate-300'
          }`}>
            <span>
              {selectionMode === 'ALL'
                ? 'Mode: ALL CATEGORIES'
                : `${selectedIds.length} / ${MAX_SELECTIONS} Selected`}
            </span>
          </div>

          {/* Follow All Mode Toggle */}
          <button
            type="button"
            onClick={handleToggleAllMode}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center space-x-2 border transition-all ${
              selectionMode === 'ALL'
                ? 'bg-indigo-600 text-white border-indigo-500 shadow-md shadow-indigo-600/30'
                : 'bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-white border-slate-700'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Follow Everything (ALL)</span>
          </button>
        </div>

        {/* Action Save Button */}
        <div className="flex items-center space-x-3 w-full md:w-auto justify-end">
          {saveSuccess && (
            <span className="text-xs font-medium text-emerald-400 flex items-center space-x-1">
              <Check className="w-4 h-4" />
              <span>Preferences saved!</span>
            </span>
          )}

          <button
            type="button"
            onClick={handleSavePreferences}
            disabled={isSaving || (selectionMode === 'CUSTOM' && selectedIds.length === 0)}
            className={`px-5 py-2.5 rounded-xl text-xs font-bold flex items-center space-x-2 transition-all shadow-md ${
              isSaving || (selectionMode === 'CUSTOM' && selectedIds.length === 0)
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
                <Save className="w-4 h-4" />
                <span>Save Selections</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Error Alert if any */}
      {errorMessage && (
        <div className="mb-6 p-4 rounded-xl bg-red-950/40 border border-red-500/30 text-red-200 text-xs flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Active Selections Badges Bar */}
      {selectionMode === 'ALL' ? (
        <div className="mb-8 p-4 rounded-xl bg-indigo-950/30 border border-indigo-500/30 text-indigo-200 text-xs flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Globe className="w-4 h-4 text-indigo-400" />
            <span>
              <strong>Global Coverage Enabled:</strong> You will receive intelligence across all 15 categories and subtopics.
            </span>
          </div>
          <button
            onClick={() => setSelectionMode('CUSTOM')}
            className="text-xs text-indigo-400 hover:text-indigo-200 underline font-semibold"
          >
            Switch to Custom Selection
          </button>
        </div>
      ) : selectedIds.length > 0 ? (
        <div className="mb-8 p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80">
          <div className="text-xs font-semibold text-slate-400 mb-2.5 uppercase tracking-wider">
            Your Selected Topics ({selectedIds.length}/{MAX_SELECTIONS}):
          </div>
          <div className="flex flex-wrap gap-2">
            {selectedIds.map((id) => (
              <span
                key={id}
                className="inline-flex items-center space-x-1.5 pl-3 pr-2 py-1.5 rounded-lg bg-indigo-950/70 border border-indigo-500/40 text-indigo-200 text-xs font-medium shadow-sm"
              >
                <span>{selectedLabels[id] || id}</span>
                <button
                  type="button"
                  onClick={() => handleRemove(id)}
                  className="p-0.5 hover:bg-indigo-800/50 rounded text-indigo-300 hover:text-white transition"
                  aria-label="Remove category"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {/* 15 Main Categories Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {categories.map((cat) => (
          <CategoryCard
            key={cat.id}
            category={cat}
            selectedIds={selectedIds}
            onOpenDrawer={(c) => setActiveDrawerCategory(c)}
            onQuickToggleMain={handleToggleSelect}
            isAtLimit={isAtLimit}
          />
        ))}
      </div>

      {/* Drill-down Subcategory & Topic Modal Drawer */}
      <CategoryDrawer
        category={activeDrawerCategory}
        isOpen={!!activeDrawerCategory}
        onClose={() => setActiveDrawerCategory(null)}
        selectedIds={selectedIds}
        onToggleSelect={handleToggleSelect}
        maxSelections={MAX_SELECTIONS}
      />
    </div>
  );
}
