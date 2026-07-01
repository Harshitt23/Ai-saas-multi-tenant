'use client';

import { useState } from 'react';
import { ApiError } from '../lib/api';
import {
  useInviteMember,
  useMembers,
  useNotificationPrefs,
  useUpdateNotificationPrefs,
  type NotificationPrefs,
} from '../lib/hooks';

const ROLES = ['MEMBER', 'ADMIN', 'GUEST'];

const ROLE_BADGE: Record<string, string> = {
  OWNER: 'bg-indigo-600/30 text-indigo-200',
  ADMIN: 'bg-emerald-600/30 text-emerald-200',
  MEMBER: 'bg-zinc-700 text-zinc-300',
  GUEST: 'bg-zinc-800 text-zinc-400',
};

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-edge bg-panel p-5">
      <h2 className="mb-4 text-sm font-semibold text-zinc-200">{title}</h2>
      {children}
    </section>
  );
}

export function MembersPanel({ orgSlug }: { orgSlug: string }) {
  const { data: members = [], isLoading } = useMembers(orgSlug);
  const invite = useInviteMember(orgSlug);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('MEMBER');
  const [notice, setNotice] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const value = email.trim();
    if (!value || invite.isPending) return;
    setNotice(null);
    invite.mutate(
      { email: value, role },
      {
        onSuccess: (data) => {
          setNotice(
            data.status === 'added'
              ? `${value} was already a user — added to the org.`
              : `Invitation email sent to ${value}.`,
          );
          setEmail('');
        },
      },
    );
  };

  const errMsg =
    invite.error instanceof ApiError
      ? invite.error.status === 403
        ? 'You need admin rights to invite members.'
        : invite.error.message
      : invite.error
        ? 'Failed to invite.'
        : null;

  return (
    <Panel title="Members">
      <ul className="mb-4 divide-y divide-edge">
        {members.map((m) => (
          <li key={m.id} className="flex items-center justify-between py-2">
            <div className="min-w-0">
              <p className="truncate text-sm text-zinc-100">{m.user.name}</p>
              <p className="truncate text-xs text-zinc-500">{m.user.email}</p>
            </div>
            <span
              className={`rounded px-2 py-0.5 text-xs ${ROLE_BADGE[m.role] ?? ROLE_BADGE.MEMBER}`}
            >
              {m.role}
            </span>
          </li>
        ))}
        {isLoading && <li className="py-2 text-sm text-zinc-500">Loading…</li>}
      </ul>

      <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="teammate@company.com"
          className="flex-1 rounded-md border border-edge bg-surface px-3 py-2 text-sm text-zinc-100 outline-none focus:border-indigo-500"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="rounded-md border border-edge bg-surface px-3 py-2 text-sm text-zinc-100 outline-none focus:border-indigo-500"
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={!email.trim() || invite.isPending}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {invite.isPending ? 'Inviting…' : 'Invite'}
        </button>
      </form>
      {notice && <p className="mt-2 text-xs text-emerald-400">{notice}</p>}
      {errMsg && <p className="mt-2 text-xs text-red-400">{errMsg}</p>}
    </Panel>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <div>
        <p className="text-sm text-zinc-200">{label}</p>
        <p className="text-xs text-zinc-500">{hint}</p>
      </div>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
          checked ? 'bg-indigo-600' : 'bg-zinc-700'
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
            checked ? 'translate-x-4' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  );
}

export function NotificationPrefsPanel() {
  const { data: prefs } = useNotificationPrefs();
  const update = useUpdateNotificationPrefs();
  const set = (key: keyof NotificationPrefs, value: boolean) => update.mutate({ [key]: value });

  return (
    <Panel title="Email notifications">
      {prefs ? (
        <div className="divide-y divide-edge">
          <Toggle
            label="When assigned to an issue"
            hint="Email me when someone assigns an issue to me."
            checked={prefs.emailOnAssigned}
            onChange={(v) => set('emailOnAssigned', v)}
          />
          <Toggle
            label="When mentioned"
            hint="Email me when someone @-mentions me in a comment."
            checked={prefs.emailOnMentioned}
            onChange={(v) => set('emailOnMentioned', v)}
          />
          <Toggle
            label="On new comments"
            hint="Email me about comments on issues I'm involved in."
            checked={prefs.emailOnComment}
            onChange={(v) => set('emailOnComment', v)}
          />
        </div>
      ) : (
        <p className="text-sm text-zinc-500">Loading…</p>
      )}
    </Panel>
  );
}
