import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { AuthUser } from "@msm/shared";
import { api, onUnauthorized, setCsrfToken } from "./api";

interface AuthState {
  loading: boolean;
  authenticated: boolean;
  user: AuthUser | null;
  /** Password accepted; waiting for TOTP / recovery code. */
  pendingTwoFactor: boolean;
  login: (
    username: string,
    password: string,
    rememberMe?: boolean,
    turnstileToken?: string,
  ) => Promise<{ requiresTwoFactor: boolean }>;
  loginTwoFactor: (code: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [pendingTwoFactor, setPendingTwoFactor] = useState(false);

  const clearSession = useCallback(() => {
    setAuthenticated(false);
    setUser(null);
    setPendingTwoFactor(false);
    setCsrfToken(null);
  }, []);

  useEffect(() => {
    api
      .me()
      .then((r) => {
        setAuthenticated(r.authenticated);
        setUser(r.user);
        setPendingTwoFactor(false);
        setCsrfToken(r.csrfToken);
      })
      .catch(() => {
        clearSession();
      })
      .finally(() => setLoading(false));
  }, [clearSession]);

  useEffect(() => onUnauthorized(clearSession), [clearSession]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      void api
        .me()
        .then((r) => {
          if (!r.authenticated) {
            // Mid-login 2FA: password step left pendingTwoFactor; do not wipe it
            // (clearSession would bounce the user back to the password form).
            setAuthenticated(false);
            setUser(null);
          } else {
            setAuthenticated(true);
            setUser(r.user);
            setPendingTwoFactor(false);
            setCsrfToken(r.csrfToken);
          }
        })
        .catch(() => {
          // Network blip / API restart — keep UI; 401s from other calls clear auth
        });
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  const login = useCallback(
    async (username: string, password: string, rememberMe = false, turnstileToken?: string) => {
      const result = await api.login(username, password, rememberMe, turnstileToken);
      if (result.requiresTwoFactor) {
        setPendingTwoFactor(true);
        setAuthenticated(false);
        setUser(null);
        return { requiresTwoFactor: true };
      }
      setPendingTwoFactor(false);
      setAuthenticated(true);
      setUser(result.user ?? null);
      setCsrfToken(result.csrfToken);
      return { requiresTwoFactor: false };
    },
    [],
  );

  const loginTwoFactor = useCallback(async (code: string) => {
    const result = await api.loginTwoFactor(code);
    setPendingTwoFactor(false);
    setAuthenticated(true);
    setUser(result.user);
    setCsrfToken(result.csrfToken);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      // still clear local state
    }
    clearSession();
  }, [clearSession]);

  const refreshUser = useCallback(async () => {
    const r = await api.me();
    if (!r.authenticated) {
      clearSession();
      return;
    }
    setAuthenticated(true);
    setUser(r.user);
    setPendingTwoFactor(false);
    setCsrfToken(r.csrfToken);
  }, [clearSession]);

  const value = useMemo(
    () => ({
      loading,
      authenticated,
      user,
      pendingTwoFactor,
      login,
      loginTwoFactor,
      logout,
      refreshUser,
    }),
    [loading, authenticated, user, pendingTwoFactor, login, loginTwoFactor, logout, refreshUser],
  );

  return createElement(AuthContext.Provider, { value }, children);
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}
