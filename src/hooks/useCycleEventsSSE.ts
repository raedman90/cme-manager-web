import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/axios";
import { useAuth } from "@/context/AuthContext";

export function useCycleEventsSSE(enabled = true) {
  const qc = useQueryClient();
  const { accessToken } = useAuth();

  React.useEffect(() => {
    if (!enabled) return;
    const base =
      (api?.defaults?.baseURL as string | undefined) ||
      (import.meta as any)?.env?.VITE_API_BASE_URL ||
      "";
    const API_BASE = String(base).replace(/\/$/, "");
    const token = (accessToken || localStorage.getItem("access_token") || "").replace(/^Bearer\s+/i, "");
    if (!token) return;

    const es = new EventSource(`${API_BASE}/events/cycles?token=${encodeURIComponent(token)}`);
    const onAny = (e: MessageEvent) => {
      try {
        const payload = JSON.parse(e.data);
        // invalida o que fizer sentido para você; exemplo:
        qc.invalidateQueries({ queryKey: ["cycles"] });
      } catch {}
    };
    // escuta mensagens padrão e eventos nomeados
    es.onmessage = onAny as any;
    es.addEventListener("cycle:update", onAny as any);
    es.onerror = () => { /* browser reconecta sozinho */ };

    return () => {
      es.removeEventListener("cycle:update", onAny as any);
      es.onmessage = null;
      es.close();
    };
  }, [enabled, accessToken, qc]);
}

