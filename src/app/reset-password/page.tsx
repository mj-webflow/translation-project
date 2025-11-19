"use client";

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase';
import Image from "next/image";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [isValidToken, setIsValidToken] = useState(false);

  useEffect(() => {
    const handleAuthToken = async () => {
      // Create client only when needed (client-side only)
      const supabase = createClient();
      
      // First, check for hash params (from email link)
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      const accessToken = hashParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token');
      const type = hashParams.get('type');
      
      console.log('Hash params:', { accessToken: !!accessToken, refreshToken: !!refreshToken, type });
      
      if (accessToken && refreshToken) {
        try {
          // Exchange the tokens for a session
          console.log('Setting session from tokens...');
          const { data, error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          
          if (error) {
            console.error('Error setting session:', error);
            setError('Invalid or expired link. Please request a new password reset.');
          } else if (data.session) {
            console.log('Session established successfully');
            setIsValidToken(true);
          } else {
            setError('Failed to establish session. Please request a new link.');
          }
        } catch (err) {
          console.error('Exception setting session:', err);
          setError('An error occurred. Please request a new link.');
        }
      } else {
        // No tokens in URL, check if we already have a session
        const { data: { session } } = await supabase.auth.getSession();
        console.log('Existing session check:', !!session);
        
        if (session) {
          setIsValidToken(true);
        } else {
          setError('Invalid or expired link. Please request a new password reset or contact your administrator.');
        }
      }
    };
    
    handleAuthToken();
  }, []);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      setLoading(false);
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters long.');
      setLoading(false);
      return;
    }

    try {
      // Create client only when needed (client-side only)
      const supabase = createClient();
      
      const { error } = await supabase.auth.updateUser({
        password: password,
      });

      if (error) {
        setError(error.message);
      } else {
        setMessage('Password updated successfully! Redirecting to login...');
        setTimeout(() => {
          const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
          window.location.href = `${basePath}/login`;
        }, 2000);
      }
    } catch (err) {
      setError('Failed to reset password. Please try again.');
      console.error('Password reset error:', err);
    } finally {
      setLoading(false);
    }
  };

  if (!isValidToken && !error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-zinc-600 dark:text-zinc-400">Verifying reset link...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex min-h-screen w-full max-w-md flex-col items-center justify-center py-32 px-8 bg-white dark:bg-black">
        <Image
          className="mb-8"
          src="/Favicon_64px_Light.svg"
          alt="Webflow logo"
          width={100}
          height={20}
          priority
        />
        
        <div className="w-full">
          <h1 className="text-3xl font-semibold text-center mb-2 text-black dark:text-zinc-50">
            Set Your Password
          </h1>
          <p className="text-center text-zinc-600 dark:text-zinc-400 mb-8">
            Create a secure password for your account
          </p>

          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          {message && (
            <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
              <p className="text-sm text-green-600 dark:text-green-400">{message}</p>
            </div>
          )}

          {isValidToken && !message && (
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  New Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full px-4 py-2 border border-zinc-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50 placeholder-zinc-500 dark:placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="••••••••"
                />
              </div>

              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Confirm New Password
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full px-4 py-2 border border-zinc-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50 placeholder-zinc-500 dark:placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="••••••••"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-400 text-white font-medium rounded-lg transition-colors disabled:cursor-not-allowed"
              >
                {loading ? 'Updating password...' : 'Update Password'}
              </button>
            </form>
          )}

          {!isValidToken && error && (
            <div className="text-center">
              <a
                href={`${process.env.NEXT_PUBLIC_BASE_PATH || ''}/login`}
                className="inline-block py-2.5 px-6 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
              >
                Back to Login
              </a>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

