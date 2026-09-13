import React from 'react';
import { OnboardingCategorySelector } from '@/components/onboarding/onboarding-category-selector';
import { TAXONOMY_SEED } from '@/lib/data/categories-seed';
import { Metadata } from 'next';
import { Zap } from 'lucide-react';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Onboarding: Choose Categories | Personal Intelligence',
  description: 'Select up to 5 categories or topics to personalize your intelligence stream.',
};

export default function OnboardingCategoriesPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between">
      {/* Top Header */}
      <header className="border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-bold shadow-md shadow-indigo-600/30">
              <Zap className="w-4 h-4 fill-current" />
            </div>
            <span className="font-extrabold text-sm tracking-tight text-white">
              Personal<span className="text-indigo-400">Intelligence</span>
            </span>
          </Link>
          <div className="text-xs text-slate-400">
            Step 1 of 3: <span className="text-slate-200 font-semibold">Categories</span>
          </div>
        </div>
      </header>

      {/* Main Form */}
      <div className="flex-1">
        <OnboardingCategorySelector categories={TAXONOMY_SEED} />
      </div>

      {/* Minimal Footer */}
      <footer className="py-6 border-t border-slate-800/60 text-center text-xs text-slate-500">
        Personal Intelligence • Free V1
      </footer>
    </main>
  );
}
