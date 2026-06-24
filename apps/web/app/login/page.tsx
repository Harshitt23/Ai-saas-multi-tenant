'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, ApiError } from '../../lib/api';
import { useAuthStore } from '../../lib/auth-store';

type Mode = 'login' | 'register';

export default function LoginPage() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [mode, setMode] = useState<Mode>('login');
  const [form, setForm] = useState({ email: 'owner@acme.test', password: 'password123', name: '', orgName: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const path = mode === 'login' ? '/auth/login' : '/auth/register';
      const payload =
        mode === 'login'
          ? { email: form.email, password: form.password }
          : { email: form.email, password: form.password, name: form.name, orgName: form.orgName || undefined };
      const res = await api.post<{ accessToken: string; userId?: string }>(path, payload);
      setAuth(res.accessToken, res.userId ?? null);
      router.push('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto mt-24 max-w-sm px-6">
      <h1 className="text-2xl font-semibold">{mode === 'login' ? 'Sign in' : 'Create account'}</h1>
      <form onSubmit={submit} className="mt-6 space-y-3">
        {mode === 'register' && (
          <input
            className="w-full rounded border border-edge bg-panel px-3 py-2"
            placeholder="Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
        )}
        <input
          className="w-full rounded border border-edge bg-panel px-3 py-2"
          placeholder="Email"
          type="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          required
        />
        <input
          className="w-full rounded border border-edge bg-panel px-3 py-2"
          placeholder="Password"
          type="password"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          required
        />
        {mode === 'register' && (
          <input
            className="w-full rounded border border-edge bg-panel px-3 py-2"
            placeholder="Organization name (optional)"
            value={form.orgName}
            onChange={(e) => setForm({ ...form, orgName: e.target.value })}
          />
        )}
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button
          disabled={busy}
          className="w-full rounded bg-indigo-600 px-4 py-2 font-medium hover:bg-indigo-500 disabled:opacity-50"
        >
          {busy ? '…' : mode === 'login' ? 'Sign in' : 'Create account'}
        </button>
      </form>
      <button
        className="mt-4 text-sm text-zinc-400 hover:text-zinc-200"
        onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
      >
        {mode === 'login' ? 'Need an account? Register' : 'Have an account? Sign in'}
      </button>
      <p className="mt-6 text-xs text-zinc-600">Seed login: owner@acme.test / password123</p>
    </main>
  );
}
