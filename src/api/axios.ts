// src/api/axios.ts
import axios from "axios";
import NProgress from "nprogress";
const baseURL = import.meta.env.VITE_API_URL || "/api";
const REFRESH_PATH = "/auth/refresh";

// Cliente principal (com interceptors)
export const api = axios.create({ baseURL });

// Cliente sem interceptors (usar em /auth/login, /auth/refresh, etc.)
export const authApi = axios.create({ baseURL });

/* -------------------- helpers de storage -------------------- */

function getAccessToken() {
  return localStorage.getItem("access_token");
}
function getRefreshToken() {
  return localStorage.getItem("refresh_token");
}
function setTokens(access?: string | null, refresh?: string | null) {
  if (access === null) localStorage.removeItem("access_token");
  if (typeof access === "string") localStorage.setItem("access_token", access);

  if (refresh === null) localStorage.removeItem("refresh_token");
  if (typeof refresh === "string") localStorage.setItem("refresh_token", refresh);
}

function broadcastLogout() {
  // AuthProvider escuta este evento e faz signOut
  window.dispatchEvent(new Event("auth:logout"));
}

function isAuthURL(url?: string) {
  if (!url) return false;
  // considera /auth, /auth/..., /auth?...
  return /\/auth(\/|$|\?)/i.test(url);
}

/* -------------------- controle de refresh -------------------- */

let isRefreshing = false;
let refreshPromise: Promise<string | null> | null = null;
let subscribers: Array<(token: string | null) => void> = [];

function subscribeTokenRefresh(cb: (t: string | null) => void) {
  subscribers.push(cb);
}
function onRefreshed(token: string | null) {
  subscribers.forEach((cb) => cb(token));
  subscribers = [];
}
let axiosInFlight = 0;
function progressStart() {
  if (axiosInFlight === 0) NProgress.start();
  axiosInFlight++;
}
function progressDone() {
  axiosInFlight = Math.max(0, axiosInFlight - 1);
  if (axiosInFlight === 0) NProgress.done();
}

/* -------------------- interceptors -------------------- */

// Adiciona Authorization, exceto em rotas de auth
api.interceptors.request.use((config) => {
  const url = String(config.url || "");
  if (!isAuthURL(url)) progressStart();
  const token = getAccessToken();
  if (token && !isAuthURL(url)) {
    config.headers = config.headers ?? {};
    (config.headers as any).Authorization = `Bearer ${token}`;
  }
  return config;
});

authApi.interceptors.request.use((config) => {
  // Mostra progresso no login/refresh também
  progressStart();
  return config;
});

// Tenta refresh em 401, exceto em rotas de auth
api.interceptors.response.use(
  (res) => { progressDone(); return res; },
  async (error) => {
    progressDone();
    const status = error?.response?.status;
    const original = (error?.config || {}) as any;

    // Sem resposta (network error, CORS, etc.)
    if (!status) {
      return Promise.reject(error);
    }

    // Não tenta refresh para endpoints /auth e evita loops
    const url = String(original?.url || "");
    const isAuthRoute = isAuthURL(url);

    if (status === 401 && !original.__isRetryRequest && !isAuthRoute) {
      original.__isRetryRequest = true;

      const rt = getRefreshToken();
      if (!rt) {
        setTokens(null, null);
        broadcastLogout();
        return Promise.reject(error);
      }

      // Dispara o refresh apenas uma vez
      if (!isRefreshing) {
        isRefreshing = true;

        refreshPromise = authApi
          .post(REFRESH_PATH, { refreshToken: rt })
          .then((r) => {
            const access =
              r.data?.accessToken ?? r.data?.access_token ?? null;
            const refresh =
              r.data?.refreshToken ?? r.data?.refresh_token ?? rt;

            if (access) {
              setTokens(access, refresh);
            } else {
              setTokens(null, null);
            }

            onRefreshed(access); // avisa todo mundo do novo token (ou null)
            return access;
          })
          .catch(() => {
            setTokens(null, null);
            broadcastLogout();
            onRefreshed(null);
            return null;
          })
          .finally(() => {
            isRefreshing = false;
          });
      }

      // Espera o refresh (ou falha) e reexecuta a requisição original
      return new Promise((resolve, reject) => {
        subscribeTokenRefresh((newToken) => {
          if (!newToken) {
            reject(error);
            return;
          }
          original.headers = original.headers ?? {};
          original.headers["Authorization"] = `Bearer ${newToken}`;
          resolve(api(original));
        });
      });
    }

    return Promise.reject(error);
  }
);
authApi.interceptors.response.use(
  (res) => { progressDone(); return res; },
  (error) => { progressDone(); return Promise.reject(error); }
);
