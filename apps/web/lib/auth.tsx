'use client';

/**
 * Auth context: session user via GET /api/auth/me (TanStack Query), login /
 * logout mutations, and a CASL-style `can(action, subject)` helper backed by
 * the pure rules in lib/ability.ts.
 */
import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ENDPOINTS, type LoginResponse, type Role, type User } from '@medidata/shared';
import { apiFetch, clearStoredToken, storeToken } from '@/lib/api';
import { roleCan, type Action, type Subject } from '@/lib/ability';

export const AUTH_QUERY_KEY = ['auth', 'me'] as const;

export type AuthContextValue = {
  user: User | null;
  role: Role | undefined;
  /** True while the initial /api/auth/me lookup is in flight. */
  isLoading: boolean;
  can: (action: Action, subject: Subject) => boolean;
  login: (email: string, password: string) => Promise<User>;
  isLoggingIn: boolean;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const meQuery = useQuery<{ user: User } | null>({
    queryKey: AUTH_QUERY_KEY,
    queryFn: ({ signal }) =>
      apiFetch<{ user: User }>(ENDPOINTS.authMe.path, { signal, silent: true }),
    retry: false,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const loginMutation = useMutation({
    mutationFn: (vars: { email: string; password: string }) =>
      apiFetch<LoginResponse>(ENDPOINTS.authLogin.path, {
        method: 'POST',
        body: vars,
        skipAuthRedirect: true,
      }),
    onSuccess: (response) => {
      if (response?.token) storeToken(response.token);
      queryClient.setQueryData(AUTH_QUERY_KEY, { user: response.user });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: () =>
      apiFetch<void>(ENDPOINTS.authLogout.path, { method: 'POST', silent: true }),
    onSettled: () => {
      clearStoredToken();
      queryClient.setQueryData(AUTH_QUERY_KEY, null);
      queryClient.clear();
    },
  });

  const user = meQuery.data?.user ?? null;
  const role: Role | undefined = user?.role;

  const can = useCallback(
    (action: Action, subject: Subject) => roleCan(role, action, subject),
    [role],
  );

  const login = useCallback(
    async (email: string, password: string) => {
      const response = await loginMutation.mutateAsync({ email, password });
      return response.user;
    },
    [loginMutation],
  );

  const logout = useCallback(async () => {
    await logoutMutation.mutateAsync();
  }, [logoutMutation]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      role,
      // Treat a failed /me lookup as "resolved, unauthenticated".
      isLoading: meQuery.isLoading,
      can,
      login,
      isLoggingIn: loginMutation.isPending,
      logout,
    }),
    [user, role, meQuery.isLoading, can, login, loginMutation.isPending, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/** CASL-style ability helper bound to the current session role. */
export function useAbility(): { can: (action: Action, subject: Subject) => boolean } {
  const { can } = useAuth();
  return { can };
}
