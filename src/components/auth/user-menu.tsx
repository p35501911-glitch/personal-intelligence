'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { LogIn, LogOut, Sparkles } from 'lucide-react';
import type { User as SupabaseUser } from '@supabase/supabase-js';

export function UserMenu() {
  const router = useRouter();
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSigningOut, setIsSigningOut] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const supabase = createClient();

    // Initial user fetch
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (isMounted) {
        setUser(user);
        setIsLoading(false);
      }
    });

    // Subscribe to auth state changes (sign in, sign out, token refresh)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (isMounted) {
        setUser(session?.user ?? null);
        setIsLoading(false);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleSignOut = async () => {
    try {
      setIsSigningOut(true);
      const supabase = createClient();
      await supabase.auth.signOut();
      router.push('/');
      router.refresh();
    } catch (err) {
      console.error('Sign out error:', err);
      setIsSigningOut(false);
    }
  };

  if (isLoading) {
    return (
      <div className="h-8 w-24 bg-slate-900 animate-pulse rounded-full border border-slate-800"></div>
    );
  }

  if (user) {
    const displayName =
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      user.email?.split('@')[0] ||
      'Intelligence User';
    const initial = displayName.charAt(0).toUpperCase();

    return (
      <div className="flex items-center space-x-3">
        {/* User Badge */}
        <div className="flex items-center space-x-2 bg-slate-900/90 border border-slate-800 px-2.5 py-1 rounded-full text-xs text-slate-300">
          <div className="w-5 h-5 rounded-full bg-indigo-600 flex items-center justify-center text-[10px] font-bold text-white uppercase">
            {initial}
          </div>
          <span className="hidden md:inline font-medium max-w-[140px] truncate text-slate-200">
            {displayName}
          </span>
        </div>

        {/* Sign Out Action */}
        <button
          type="button"
          onClick={handleSignOut}
          disabled={isSigningOut}
          className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800/80 transition-colors flex items-center space-x-1.5 text-xs font-medium cursor-pointer"
          title="Sign out of Personal Intelligence"
          aria-label="Sign out"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Sign Out</span>
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center space-x-2">
      <div className="hidden sm:flex items-center space-x-1.5 text-[11px] text-slate-400 bg-slate-900/60 px-2.5 py-1 rounded-full border border-slate-800">
        <Sparkles className="w-3 h-3 text-indigo-400" />
        <span>Guest Preview</span>
      </div>

      <Link
        href="/login"
        className="px-3 py-1.5 rounded-full text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/30 transition-all flex items-center space-x-1.5"
      >
        <LogIn className="w-3.5 h-3.5" />
        <span>Sign In</span>
      </Link>
    </div>
  );
}
