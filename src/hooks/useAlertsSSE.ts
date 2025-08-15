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
    es.addEventListener("alert", onMsg as any);
    es.onerror = () => { /* o browser reconecta automaticamente */ };
    return () => {
      es.removeEventListener("alert", onMsg as any);
      es.close();
    };
  }, [enabled, qc]);
}
