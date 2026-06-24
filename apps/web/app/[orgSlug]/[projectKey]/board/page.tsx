'use client';

import Link from 'next/link';
import { Board } from '../../../../components/board';

export default function BoardPage({
  params,
}: {
  params: { orgSlug: string; projectKey: string };
}) {
  const { orgSlug, projectKey } = params;
  return (
    <main className="min-h-screen">
      <header className="flex items-center gap-3 border-b border-edge px-4 py-3">
        <Link href={`/${orgSlug}`} className="text-sm text-zinc-400 hover:text-zinc-200">
          ← {orgSlug}
        </Link>
        <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-300">{projectKey}</span>
        <h1 className="font-medium">Board</h1>
      </header>
      <Board orgSlug={orgSlug} projectKey={projectKey} />
    </main>
  );
}
