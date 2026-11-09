'use client';

import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ReactNode, useEffect, useState } from 'react';
import { API, apiFetch } from '../lib/api';

export function AuthGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState('');
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    if (pathname === '/login') {
      setChecking(false);
      return;
    }

    let active = true;
    apiFetch(`${API}/auth/me`, { cache: 'no-store' })
      .then((response) => {
        if (!active) return;
        if (response.status === 401) {
          const next = `${window.location.pathname}${window.location.search}`;
          router.replace(`/login?next=${encodeURIComponent(next)}`);
        } else if (response.ok) {
          setAuthorized(true);
          setError('');
        } else {
          setError('Could not verify your session. Please try again.');
        }
      })
      .catch(() => {
        if (active) setError('Could not connect to the API. Please try again.');
      })
      .finally(() => {
        if (active) setChecking(false);
      });

    return () => {
      active = false;
    };
  }, [pathname, router]);

  const logout = async () => {
    setLoggingOut(true);
    setError('');
    try {
      const response = await apiFetch(`${API}/auth/logout`, { method: 'POST' });
      if (!response.ok) throw new Error('Logout failed. Please try again.');
      setAuthorized(false);
      router.replace('/login');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Logout failed.');
      setLoggingOut(false);
    }
  };

  if (pathname === '/login') return children;
  if (checking || !authorized) {
    return (
      <main className="auth-loading">
        <p>{error || (checking ? 'Checking your session…' : 'Redirecting to sign in…')}</p>
        {error && <button onClick={() => window.location.reload()}>Retry</button>}
      </main>
    );
  }

  return (
    <>
      <div className="auth-controls">
        {error && <span role="alert">{error}</span>}
        {pathname === '/' && <Link className="auth-nav-link" href="/clients">View clients</Link>}
        <button onClick={logout} disabled={loggingOut}>
          {loggingOut ? 'Signing out…' : 'Log out'}
        </button>
      </div>
      {children}
    </>
  );
}
