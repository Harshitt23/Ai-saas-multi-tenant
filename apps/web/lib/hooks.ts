'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateIssueInput,
  IssueStatusValue,
  MoveIssueInput,
  UpdateIssueInput,
} from '@pm/types';
import { api, uploadAttachment, type Attachment } from './api';

export interface Org {
  id: string;
  slug: string;
  name: string;
  memberships: { role: string }[];
  _count: { projects: number; memberships: number };
}

export interface Project {
  id: string;
  key: string;
  name: string;
  description: string | null;
  _count: { issues: number };
}

export interface Issue {
  id: string;
  number: number;
  title: string;
  description: string | null;
  status: IssueStatusValue;
  priority: string;
  rank: string;
  assigneeId: string | null;
  projectId: string;
  updatedAt: string;
}

export interface Member {
  id: string; // membership id
  role: string;
  user: { id: string; name: string; email: string; avatarUrl: string | null };
}

export const useOrgs = () => useQuery({ queryKey: ['orgs'], queryFn: () => api.get<Org[]>('/orgs') });

export const useMembers = (orgSlug: string) =>
  useQuery({
    queryKey: ['members', orgSlug],
    queryFn: () => api.get<Member[]>(`/orgs/${orgSlug}/members`, orgSlug),
    enabled: !!orgSlug,
  });

export const useProjects = (orgSlug: string) =>
  useQuery({
    queryKey: ['projects', orgSlug],
    queryFn: () => api.get<Project[]>(`/orgs/${orgSlug}/projects`, orgSlug),
    enabled: !!orgSlug,
  });

export const issuesKey = (orgSlug: string, projectKey: string) => ['issues', orgSlug, projectKey];

export const useIssues = (orgSlug: string, projectKey: string) =>
  useQuery({
    queryKey: issuesKey(orgSlug, projectKey),
    queryFn: () =>
      api.get<Issue[]>(`/orgs/${orgSlug}/projects/${projectKey}/issues?limit=100`, orgSlug),
    enabled: !!orgSlug && !!projectKey,
  });

export function useCreateIssue(orgSlug: string, projectKey: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateIssueInput) =>
      api.post<Issue>(`/orgs/${orgSlug}/projects/${projectKey}/issues`, input, orgSlug),
    onSuccess: () => qc.invalidateQueries({ queryKey: issuesKey(orgSlug, projectKey) }),
  });
}

/**
 * Optimistic drag/drop move. We patch the cache immediately, then roll back if
 * the server rejects the move — the hallmark of a responsive board UI.
 */
export function useMoveIssue(orgSlug: string, projectKey: string) {
  const qc = useQueryClient();
  const key = issuesKey(orgSlug, projectKey);

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: MoveIssueInput; optimisticRank: string }) =>
      api.patch<Issue>(`/orgs/${orgSlug}/projects/${projectKey}/issues/${id}/move`, input, orgSlug),

    onMutate: async ({ id, input, optimisticRank }) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<Issue[]>(key);
      qc.setQueryData<Issue[]>(key, (old) =>
        (old ?? []).map((i) =>
          i.id === id ? { ...i, status: input.status, rank: optimisticRank } : i,
        ),
      );
      return { previous };
    },

    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
    },

    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
}

/** Edit an issue's fields (title/description/status/priority/assignee). */
export function useUpdateIssue(orgSlug: string, projectKey: string) {
  const qc = useQueryClient();
  const key = issuesKey(orgSlug, projectKey);
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateIssueInput }) =>
      api.patch<Issue>(`/orgs/${orgSlug}/projects/${projectKey}/issues/${id}`, input, orgSlug),
    onMutate: async ({ id, input }) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<Issue[]>(key);
      qc.setQueryData<Issue[]>(key, (old) =>
        (old ?? []).map((i) => (i.id === id ? { ...i, ...input } : i)),
      );
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
}

/** Delete an issue, removing it from the board cache immediately. */
export function useDeleteIssue(orgSlug: string, projectKey: string) {
  const qc = useQueryClient();
  const key = issuesKey(orgSlug, projectKey);
  return useMutation({
    mutationFn: (id: string) =>
      api.delete<void>(`/orgs/${orgSlug}/projects/${projectKey}/issues/${id}`, orgSlug),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<Issue[]>(key);
      qc.setQueryData<Issue[]>(key, (old) => (old ?? []).filter((i) => i.id !== id));
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
}

// --- attachments ---------------------------------------------------------

export const attachmentsKey = (orgSlug: string, issueId: string) => [
  'attachments',
  orgSlug,
  issueId,
];

export const useAttachments = (orgSlug: string, issueId: string) =>
  useQuery({
    queryKey: attachmentsKey(orgSlug, issueId),
    queryFn: () =>
      api.get<Attachment[]>(`/orgs/${orgSlug}/issues/${issueId}/attachments`, orgSlug),
    enabled: !!orgSlug && !!issueId,
  });

export function useUploadAttachment(orgSlug: string, issueId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => uploadAttachment(orgSlug, issueId, file),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: attachmentsKey(orgSlug, issueId) }),
  });
}

export function useDeleteAttachment(orgSlug: string, issueId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.delete<void>(`/orgs/${orgSlug}/issues/${issueId}/attachments/${id}`, orgSlug),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: attachmentsKey(orgSlug, issueId) }),
  });
}
