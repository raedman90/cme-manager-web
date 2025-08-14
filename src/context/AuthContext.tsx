import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { User } from "@/types/auth";

export type Tokens = {
  accessToken: string;
  refreshToken?: string | null;
};

type AuthContextValue = {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  signIn: (data: { user: User; tokens: Tokens }) => void;
  signOut: () => void;
  // opcional: para cenários específicos
  setTokens: (tokens: Tokens | null) => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function readStorage() {
  // migração: se existir 'token'/'user', migra para o novo padrão
  const legacyToken = localStorage.getItem("token");
  const legacyUser = localStorage.getItem("user");
  if (legacyToken && !localStorage.getItem("access_token")) {
    localStorage.setItem("access_token", legacyToken);
    localStorage.removeItem("token");
  }
  if (legacyUser && !localStorage.getItem("auth_user")) {
    localStorage.setItem("auth_user", legacyUser);
    localStorage.removeItem("user");
  }

  const accessToken = localStorage.getItem("access_token");
  const refreshToken = localStorage.getItem("refresh_token");
  const userRaw = localStorage.getItem("auth_user");
  const user = userRaw ? (JSON.parse(userRaw) as User) : null;

  return { accessToken, refreshToken, user };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [{ accessToken, user }, setAuth] = useState(() => readStorage());

  // escuta logout global disparado pelo interceptor (falha no refresh)
  useEffect(() => {
    const onLogout = () => {
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
      localStorage.removeItem("auth_user");
      setAuth({ accessToken: null as any, refreshToken: null as any, user: null });
    };
    window.addEventListener("auth:logout", onLogout);
    return () => window.removeEventListener("auth:logout", onLogout);
  }, []);

  // (opcional) refletir mudanças de token feitas fora do contexto (ex.: refresh)
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === "access_token") {
        setAuth((s) => ({ ...s, accessToken: localStorage.getItem("access_token") }));
      }
      if (e.key === "auth_user") {
        const userRaw = localStorage.getItem("auth_user");
        setAuth((s) => ({ ...s, user: userRaw ? (JSON.parse(userRaw) as User) : null }));
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      accessToken,
      isAuthenticated: !!accessToken,
      signIn: ({ user, tokens }) => {
        localStorage.setItem("access_token", tokens.accessToken);
        if (tokens.refreshToken !== undefined) {
          if (tokens.refreshToken) localStorage.setItem("refresh_token", tokens.refreshToken);
          else localStorage.removeItem("refresh_token");
        }
        localStorage.setItem("auth_user", JSON.stringify(user));
        setAuth({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken ?? null, user });
      },
      signOut: () => {
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        localStorage.removeItem("auth_user");
        setAuth({ accessToken: null as any, refreshToken: null as any, user: null });
      },
      setTokens: (tokens) => {
        if (!tokens) {
          localStorage.removeItem("access_token");
          localStorage.removeItem("refresh_token");
          setAuth((s) => ({ ...s, accessToken: null as any }));
        } else {
          localStorage.setItem("access_token", tokens.accessToken);
          if (tokens.refreshToken !== undefined) {
            if (tokens.refreshToken) localStorage.setItem("refresh_token", tokens.refreshToken);
            else localStorage.removeItem("refresh_token");
          }
          setAuth((s) => ({ ...s, accessToken: tokens.accessToken }));
        }
      },
    }),
    [accessToken, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
