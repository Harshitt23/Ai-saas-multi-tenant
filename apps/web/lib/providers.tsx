'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api } from './api';
import { useAuthStore } from './auth-store';

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 10_000, refetchOnWindowFocus: false, retry: 1 },
        },
      }),
  );
  const setAuth = useAuthStore((s) => s.setAuth);
  const [ready, setReady] = useState(false);

  // Silent session restore on first load via the refresh cookie.
  useEffect(() => {
    api
      .post<{ accessToken: string }>('/auth/refresh')
      .then((res) => setAuth(res.accessToken))
      .catch(() => undefined)
      .finally(() => setReady(true));
  }, [setAuth]);

  return (
    <QueryClientProvider client={client}>
      {ready ? children : <div className="p-8 text-zinc-500">Loading…</div>}
    </QueryClientProvider>
  );
}
