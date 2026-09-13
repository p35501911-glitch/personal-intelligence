'use client';

import React, { useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Zap, Shield, Sparkles, BookOpen, Bookmark, ArrowLeft, Loader2, AlertCircle } from 'lucide-react';

function LoginContent() {
  const searchParams = useSearchParams();
  const errorParam = searchParams.get('error');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(
    errorParam === 'auth_callback_failed'
      ? 'Authentication failed. Please try signing in again.'
      : errorParam
      ? 'An error occurred during sign in. Please try again.'
      : null
  );

  const handleGoogleSignIn = async () => {
    try {
      setIsLoading(true);
      setErrorMessage(null);

      const supabase = createClient();
      const origin = window.location.origin;

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${origin}/auth/callback?next=/`,
        },
      });

      if (error) {
        setErrorMessage(error.message);
        setIsLoading(false);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to initialize Google login.';
      setErrorMessage(msg);
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md">
      {/* Back to feed link */}
      <div className="mb-6">
        <Link
          href="/"
          className="inline-flex items-center space-x-2 text-xs font-semibold text-slate-400 hover:text-slate-200 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Feed Preview</span>
        </Link>
      </div>

      {/* Main Card */}
      <div className="bg-slate-900/90 border border-slate-800/80 rounded-2xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl">
        {/* Header Branding */}
        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-600/30 text-white font-bold mb-4">
            <Zap className="w-6 h-6 fill-current" />
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white">
            Personal<span className="text-indigo-400">Intelligence</span>
          </h1>
          <p className="text-xs text-slate-400 mt-2 max-w-xs">
            Autonomous multi-source news intelligence and tiered AI briefings.
          </p>
        </div>

        {/* Error Notification */}
        {errorMessage && (
          <div className="mb-6 p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-start space-x-3 text-rose-400 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Google OAuth Button */}
        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={isLoading}
          className="w-full h-12 bg-white hover:bg-slate-100 text-slate-900 font-semibold rounded-xl flex items-center justify-center space-x-3 transition-all shadow-md hover:shadow-lg disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
        >
          {isLoading ? (
            <Loader2 className="w-5 h-5 animate-spin text-slate-700" />
          ) : (
            <>
              {/* Google G Logo SVG */}
              <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span className="text-sm">Continue with Google</span>
            </>
          )}
        </button>

        {/* Feature Checklist */}
        <div className="mt-8 pt-6 border-t border-slate-800/80 space-y-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
            Your intelligence account includes:
          </p>
          <div className="flex items-center space-x-2.5 text-xs text-slate-300">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            <span>50-Category Personalized Feed with AI Relevance</span>
          </div>
          <div className="flex items-center space-x-2.5 text-xs text-slate-300">
            <BookOpen className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            <span>Daily & Weekly Executive Intelligence Briefings</span>
          </div>
          <div className="flex items-center space-x-2.5 text-xs text-slate-300">
            <Bookmark className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            <span>Private Saved Dossier with Full AI Insights</span>
          </div>
          <div className="flex items-center space-x-2.5 text-xs text-slate-300">
            <Shield className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>Strict Row-Level Security (RLS) Isolation</span>
          </div>
        </div>
      </div>

      {/* Footer Info */}
      <div className="mt-6 text-center text-[11px] text-slate-400">
        <span>Free Tier • Zero API cost • Google Gemini Flash Powered</span>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4">
      <Suspense
        fallback={
          <div className="flex items-center justify-center p-12">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
          </div>
        }
      >
        <LoginContent />
      </Suspense>
    </main>
  );
}
