'use client';

import React, { useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  Zap,
  Shield,
  Sparkles,
  BookOpen,
  Bookmark,
  ArrowLeft,
  Loader2,
  AlertCircle,
  Mail,
  Lock,
  Eye,
  EyeOff,
  LogIn,
  UserPlus,
  CheckCircle2,
} from 'lucide-react';

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const errorParam = searchParams.get('error');
  const nextParam = searchParams.get('next');

  // Auth Mode: 'signin' | 'signup'
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');

  // Form Fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Status
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(
    errorParam === 'auth_callback_failed'
      ? 'Authentication failed. Please try signing in again.'
      : errorParam
      ? 'An error occurred during sign in. Please try again.'
      : null
  );
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Email/Password Submit Handler
  const handleEmailPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      setErrorMessage('Please enter a valid email address.');
      return;
    }

    if (password.length < 6) {
      setErrorMessage('Password must be at least 6 characters.');
      return;
    }

    try {
      setIsLoading(true);
      const supabase = createClient();

      if (authMode === 'signin') {
        // Sign In with Email & Password
        const { data, error } = await supabase.auth.signInWithPassword({
          email: trimmedEmail,
          password,
        });

        if (error) {
          if (error.message.includes('Invalid login credentials')) {
            setErrorMessage('Invalid email or password. Please verify and try again.');
          } else {
            setErrorMessage(error.message);
          }
          setIsLoading(false);
          return;
        }

        if (data.session) {
          let destination = nextParam || '/';
          if (destination === '/') {
            // Check if returning user has already completed onboarding
            const { data: pref } = await supabase
              .from('user_preferences')
              .select('category_selection_mode')
              .eq('user_id', data.session.user.id)
              .maybeSingle();

            if (!pref) {
              destination = '/onboarding/categories';
            }
          }
          router.push(destination);
          router.refresh();
        }
      } else {
        // Sign Up with Email & Password -> route to onboarding
        const signupTarget = nextParam || '/onboarding/categories';
        const origin = window.location.origin;
        const { data, error } = await supabase.auth.signUp({
          email: trimmedEmail,
          password,
          options: {
            emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(signupTarget)}`,
          },
        });

        if (error) {
          if (error.message.toLowerCase().includes('already registered')) {
            setErrorMessage('An account with this email already exists. Please sign in instead.');
            setAuthMode('signin');
          } else {
            setErrorMessage(error.message);
          }
          setIsLoading(false);
          return;
        }

        // If session was established immediately (email confirm disabled in Supabase)
        if (data.session) {
          router.push(signupTarget);
          router.refresh();
          return;
        }

        // Otherwise email confirmation was sent
        setSuccessMessage(
          'Account created! Check your email inbox for a confirmation link to complete category setup.'
        );
        setIsLoading(false);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'An unexpected error occurred.';
      setErrorMessage(msg);
      setIsLoading(false);
    }
  };

  // Google OAuth Handler
  const handleGoogleSignIn = async () => {
    try {
      setIsGoogleLoading(true);
      setErrorMessage(null);
      setSuccessMessage(null);

      const supabase = createClient();
      const origin = window.location.origin;
      const oauthTarget = authMode === 'signup' ? (nextParam || '/onboarding/categories') : (nextParam || '/');

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(oauthTarget)}`,
        },
      });

      if (error) {
        setErrorMessage(error.message);
        setIsGoogleLoading(false);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to initialize Google login.';
      setErrorMessage(msg);
      setIsGoogleLoading(false);
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
          <span>Back to Feed</span>
        </Link>
      </div>

      {/* Main Card */}
      <div className="bg-slate-900/90 border border-slate-800/80 rounded-2xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl">
        {/* Header Branding */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-600/30 text-white font-bold mb-3">
            <Zap className="w-6 h-6 fill-current" />
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white">
            Personal<span className="text-indigo-400">Intelligence</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1 max-w-xs">
            Autonomous multi-source news intelligence and tiered AI briefings.
          </p>
        </div>

        {/* Notifications */}
        {errorMessage && (
          <div className="mb-5 p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-start space-x-3 text-rose-400 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        {successMessage && (
          <div className="mb-5 p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-start space-x-3 text-emerald-400 text-xs">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Primary Action: Continue with Google */}
        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={isLoading || isGoogleLoading}
          className="w-full h-12 bg-white hover:bg-slate-100 text-slate-900 font-bold rounded-xl flex items-center justify-center space-x-3 transition-all shadow-lg hover:shadow-xl disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer mb-6"
        >
          {isGoogleLoading ? (
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
              <span className="text-sm font-semibold text-slate-800">Continue with Google</span>
            </>
          )}
        </button>

        {/* Divider */}
        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-800" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-slate-900 px-2 text-slate-500 font-medium uppercase tracking-wider text-[10px]">
              Or continue with email
            </span>
          </div>
        </div>

        {/* Auth Mode Toggle Tabs */}
        <div className="grid grid-cols-2 p-1 bg-slate-950/80 rounded-xl border border-slate-800/80 mb-6">
          <button
            type="button"
            onClick={() => {
              setAuthMode('signin');
              setErrorMessage(null);
              setSuccessMessage(null);
            }}
            className={`py-2 text-xs font-bold rounded-lg transition-all ${
              authMode === 'signin'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setAuthMode('signup');
              setErrorMessage(null);
              setSuccessMessage(null);
            }}
            className={`py-2 text-xs font-bold rounded-lg transition-all ${
              authMode === 'signup'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Create Account
          </button>
        </div>

        {/* Email & Password Form */}
        <form onSubmit={handleEmailPasswordSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="auth-email"
              className="block text-xs font-semibold text-slate-300 mb-1.5"
            >
              Email Address
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                <Mail className="w-4 h-4" />
              </div>
              <input
                id="auth-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                disabled={isLoading || isGoogleLoading}
                className="w-full h-11 pl-10 pr-3.5 bg-slate-950/80 border border-slate-800 rounded-xl text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all disabled:opacity-60"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="auth-password"
              className="block text-xs font-semibold text-slate-300 mb-1.5"
            >
              Password
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                <Lock className="w-4 h-4" />
              </div>
              <input
                id="auth-password"
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete={authMode === 'signin' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                minLength={6}
                disabled={isLoading || isGoogleLoading}
                className="w-full h-11 pl-10 pr-10 bg-slate-950/80 border border-slate-800 rounded-xl text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all disabled:opacity-60"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-500 hover:text-slate-300 transition-colors"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {authMode === 'signup' && (
              <p className="text-[11px] text-slate-500 mt-1">Must be at least 6 characters.</p>
            )}
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading || isGoogleLoading}
            className="w-full h-11 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl flex items-center justify-center space-x-2 transition-all shadow-md shadow-indigo-600/30 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin text-white" />
            ) : authMode === 'signin' ? (
              <>
                <LogIn className="w-4 h-4" />
                <span className="text-sm">Sign In with Email</span>
              </>
            ) : (
              <>
                <UserPlus className="w-4 h-4" />
                <span className="text-sm">Create Account with Email</span>
              </>
            )}
          </button>
        </form>

        {/* Feature Checklist */}
        <div className="mt-8 pt-5 border-t border-slate-800/80 space-y-2.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
            Your intelligence account includes:
          </p>
          <div className="flex items-center space-x-2 text-xs text-slate-300">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            <span>50-Category Personalized Feed with AI Relevance</span>
          </div>
          <div className="flex items-center space-x-2 text-xs text-slate-300">
            <BookOpen className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            <span>Daily & Weekly Executive Intelligence Briefings</span>
          </div>
          <div className="flex items-center space-x-2 text-xs text-slate-300">
            <Bookmark className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            <span>Private Saved Dossier with Full AI Insights</span>
          </div>
          <div className="flex items-center space-x-2 text-xs text-slate-300">
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
