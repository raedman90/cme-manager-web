import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/axios";

export function useAlertsSSE(enabled = true) {
  const qc = useQueryClient();
  React.useEffect(() => {
    if (!enabled) return;
    const base =
      (api?.defaults?.baseURL as string | undefined) ||
      (import.meta as any)?.env?.VITE_API_BASE_URL ||
      "";
     const API_BASE = String(base).replace(/\/$/, "");
    // tenta várias fontes para achar o token
    const guessToken = () => {
      const h = (api?.defaults?.headers?.common?.Authorization as string | undefined) || "";
      if (h?.startsWith("Bearer ")) return h.slice(7);
      const keys = ["auth_token", "token", "access_token", "jwt", "AUTH_TOKEN"];
      for (const k of keys) {
        const v = localStorage.getItem(k) || sessionStorage.getItem(k);
        if (v) return v.startsWith("Bearer ") ? v.slice(7) : v;
      }
      return "";
    };
    const token = guessToken();
    if (!token) {
      // ajuda a diagnosticar 401 rapidamente
      // eslint-disable-next-line no-console
      console.warn("[useAlertsSSE] Nenhum token encontrado para SSE. Defina localStorage 'auth_token' ou configure axios.defaults.headers.common.Authorization = 'Bearer ...'");
    }
    const qs = token ? `?token=${encodeURIComponent(token)}` : "";
    const url = `${API_BASE}/alerts/stream${qs}`;

    const es = new EventSource(url);
    const onMsg = (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        if (data?.type === "comment" && data?.comment?.alertId) {
          qc.invalidateQueries({ queryKey: ["alert-comments", data.comment.alertId] });
        } else {
          // eventos de open/ack/resolve/counts
          qc.invalidateQueries({ queryKey: ["alerts-counts"] });
          qc.invalidateQueries({ queryKey: ["alerts", "open-map"] });
          qc.invalidateQueries({ queryKey: ["alerts"] });
        }
      } catch {}
    };
    // ouça tanto o tipo custom "alert" quanto a mensagem default
    es.addEventListener("alert", onMsg as any);
    es.onmessage = onMsg as any;
    es.onerror = () => { /* o browser reconecta automaticamente */ };
    return () => {
      es.removeEventListener("alert", onMsg as any);
      es.onmessage = null;
      es.close();
    };
  }, [enabled, qc]);
}
