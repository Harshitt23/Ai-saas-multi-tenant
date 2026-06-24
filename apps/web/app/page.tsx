'use client';

import Link from 'next/link';
import { useAuthStore } from '../lib/auth-store';
import { useOrgs } from '../lib/hooks';

export default function HomePage() {
  const token = useAuthStore((s) => s.accessToken);
  const orgs = useOrgs();

  if (!token) {
    return (
      <main className="mx-auto max-w-md p-10">
        <h1 className="text-2xl font-semibold">PM SaaS</h1>
        <p className="mt-2 text-zinc-400">Multi-tenant project management.</p>
        <Link
          href="/login"
          className="mt-6 inline-block rounded bg-indigo-600 px-4 py-2 font-medium hover:bg-indigo-500"
        >
          Sign in
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl p-10">
      <h1 className="text-xl font-semibold">Your organizations</h1>
      <ul className="mt-4 space-y-2">
        {orgs.data?.map((o) => (
          <li key={o.id}>
            <Link
              href={`/${o.slug}`}
              className="flex items-center justify-between rounded border border-edge bg-panel px-4 py-3 hover:border-indigo-500"
            >
              <span>
                <span className="font-medium">{o.name}</span>
                <span className="ml-2 text-xs text-zinc-500">{o.memberships[0]?.role}</span>
              </span>
              <span className="text-xs text-zinc-500">
                {o._count.projects} projects · {o._count.memberships} members
              </span>
            </Link>
          </li>
        ))}
        {orgs.data?.length === 0 && <p className="text-zinc-500">No organizations yet.</p>}
      </ul>
    </main>
  );
}
