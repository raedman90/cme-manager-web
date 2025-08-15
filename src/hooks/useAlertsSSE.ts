import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";

export function useAlertsSSE(enabled = true) {
  const qc = useQueryClient();
  React.useEffect(() => {
    if (!enabled) return;
    const es = new EventSource("/alerts/stream");
    const onMsg = (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        // Estratégia simples: invalida caches relevantes
        qc.invalidateQueries({ queryKey: ["alerts-counts"] });
        qc.invalidateQueries({ queryKey: ["alerts", "open-map"] });
        // se a lista de alertas estiver aberta
        qc.invalidateQueries({ queryKey: ["alerts"] });
      } catch {}
    };
    es.addEventListener("alert", onMsg as any);
    es.onerror = () => { /* o browser reconecta automaticamente */ };
    return () => {
      es.removeEventListener("alert", onMsg as any);
      es.close();
    };
  }, [enabled, qc]);
}
