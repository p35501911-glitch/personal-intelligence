import React from 'react';
import Link from 'next/link';
import { DashboardView } from '@/components/dashboard-view';
import { TAXONOMY_SEED } from '@/lib/data/categories-seed';
import { Zap, ShieldCheck } from 'lucide-react';

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col justify-between">
      {/* Top Navbar */}
      <header className="border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-600/30 text-white font-bold">
              <Zap className="w-5 h-5 fill-current" />
            </div>
            <div>
              <span className="font-extrabold text-base tracking-tight text-white">
                Personal<span className="text-indigo-400">Intelligence</span>
              </span>
              <span className="ml-2 px-2 py-0.5 text-[10px] font-bold rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
                Free V1
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <Link
              href="/onboarding/categories"
              className="px-3.5 py-1.5 rounded-full text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/30 transition-all flex items-center space-x-1.5"
            >
              <span>Onboarding Flow</span>
              <span>→</span>
            </Link>
            <div className="flex items-center space-x-2 text-xs text-slate-400 bg-slate-900 px-3 py-1.5 rounded-full border border-slate-800">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span className="font-medium">Supabase Connected</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content: Dashboard View (Feed + Topic Management) */}
      <DashboardView initialCategories={TAXONOMY_SEED} />

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-950/90 py-8 mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-4">
          <div className="flex items-center space-x-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Row Level Security (RLS) Active • Max 5 Selections Enforced</span>
          </div>
          <div>
            <span>Personal Intelligence Engine • Step 1C Category Foundation</span>
          </div>
        </div>
      </footer>
    </main>
  );
}
