'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { API, apiFetch } from '../lib/api';

type SetupStatus = { initialized: boolean };

export default function LoginPage() {
  const [initialized, setInitialized] = useState<boolean | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    apiFetch(`${API}/auth/status`, { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Could not check the account setup.');
        const status = (await response.json()) as SetupStatus;
        setInitialized(status.initialized);
      })
      .catch((cause: unknown) => {
        setError(
          cause instanceof Error
            ? cause.message
            : 'Could not connect to the API.',
        );
      });
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      const endpoint = initialized ? 'login' : 'bootstrap';
      const response = await apiFetch(`${API}/auth/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      if (!response.ok) {
        if (response.status === 409) {
          setInitialized(true);
          throw new Error('The admin account already exists. Please sign in.');
        }
        if (response.status === 401) {
          throw new Error('Invalid username or password.');
        }
        const body = await response.json().catch(() => null);
        const validationMessage = Array.isArray(body?.message)
          ? body.message.join(' ')
          : typeof body?.message === 'string'
            ? body.message
            : null;
        throw new Error(
          validationMessage
            ? validationMessage
            : initialized
              ? 'Sign in failed. Please try again.'
              : 'Admin account setup failed. Please try again.',
        );
      }

      const query = new URLSearchParams(window.location.search);
      const next = query.get('next');
      window.location.replace(
        next?.startsWith('/') && !next.startsWith('//') ? next : '/',
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  };

  const settingUp = initialized === false;

  return (
    <main className="login-page">
      <section className="login-card">
        <img src="/hamiz-logo.png" alt="Hamiz Boutique" />
        <p className="eyebrow">PRIVATE WORKSPACE</p>
        <h1>{settingUp ? 'Create your admin account' : 'Welcome back'}</h1>
        <p className="login-description">
          {initialized === null
            ? 'Checking account setup…'
            : settingUp
              ? 'Set up the owner account to secure your boutique workspace.'
              : 'Sign in to manage your clients and orders.'}
        </p>
        {initialized !== null && (
          <form onSubmit={submit}>
            <label>
              Username or email
              <input
                autoComplete="username"
                required
                maxLength={254}
                pattern="([A-Za-z0-9._-]{3,32}|[A-Za-z0-9.!#$%&amp;'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+)"
                title="Use a 3–32 character username or a valid email address."
                value={username}
                onChange={(event) => setUsername(event.target.value)}
              />
              <span className="login-hint">
                Use a 3–32 character username or a valid email address.
              </span>
            </label>
            <label>
              Password
              <input
                type="password"
                autoComplete={settingUp ? 'new-password' : 'current-password'}
                required
                minLength={settingUp ? 12 : 1}
                maxLength={128}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              {settingUp && (
                <span className="login-hint">
                  Use at least 12 characters. Numbers are allowed.
                </span>
              )}
            </label>
            <button className="primary" disabled={submitting}>
              {submitting
                ? 'Please wait…'
                : settingUp
                  ? 'Create admin account'
                  : 'Sign in'}
            </button>
          </form>
        )}
        {error && <p className="login-error" role="alert">{error}</p>}
        {initialized === null && error && (
          <Link className="login-retry" href="/login">Retry</Link>
        )}
      </section>
    </main>
  );
}
