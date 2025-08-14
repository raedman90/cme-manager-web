import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

export function useSSE(enable = true) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!enable) return;
    const es = new EventSource(`${import.meta.env.VITE_API_URL || "http://localhost:3333"}/events/stream`, { withCredentials: false });

    es.addEventListener("cycle", () => {
      // quando há novo ciclo/etapa, atualiza listas
      qc.invalidateQueries({ queryKey: ["materials"] });
      qc.invalidateQueries({ queryKey: ["batches"] });
      qc.invalidateQueries({ queryKey: ["cycles"] });
    });
    es.addEventListener("ping", () => {/* keepalive */});

    es.onerror = () => { /* silencioso em dev */ };
    return () => { es.close(); };
  }, [enable, qc]);
}
