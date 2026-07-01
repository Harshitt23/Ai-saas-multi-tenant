'use client';

import Link from 'next/link';
import { useProjects } from '../../lib/hooks';
import { MembersPanel, NotificationPrefsPanel } from '../../components/org-settings';

export default function OrgPage({ params }: { params: { orgSlug: string } }) {
  const { orgSlug } = params;
  const projects = useProjects(orgSlug);

  return (
    <main className="mx-auto max-w-3xl p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{orgSlug}</h1>
        <Link href="/" className="text-sm text-zinc-400 hover:text-zinc-200">
          ← all orgs
        </Link>
      </div>
      <ul className="mt-6 grid gap-3 sm:grid-cols-2">
        {projects.data?.map((p) => (
          <li key={p.id}>
            <Link
              href={`/${orgSlug}/${p.key}/board`}
              className="block rounded border border-edge bg-panel p-4 hover:border-indigo-500"
            >
              <div className="flex items-center gap-2">
                <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-300">{p.key}</span>
                <span className="font-medium">{p.name}</span>
              </div>
              <p className="mt-1 text-sm text-zinc-500">{p.description ?? 'No description'}</p>
              <p className="mt-2 text-xs text-zinc-600">{p._count.issues} issues</p>
            </Link>
          </li>
        ))}
        {projects.isLoading && <p className="text-zinc-500">Loading…</p>}
        {projects.data?.length === 0 && <p className="text-zinc-500">No projects yet.</p>}
      </ul>

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        <MembersPanel orgSlug={orgSlug} />
        <NotificationPrefsPanel />
      </div>
    </main>
  );
}
