import { useQuery } from "@tanstack/react-query";
import { listAlerts } from "@/api/alerts";

export type Sev = "INFO" | "WARNING" | "CRITICAL";

function rank(sev?: Sev) {
  return sev === "CRITICAL" ? 3 : sev === "WARNING" ? 2 : sev === "INFO" ? 1 : 0;
}

/**
 * Busca alertas OPEN e agrega a severidade máxima por cicloId.
 * Refaz a cada 30s.
 */
export function useAlertsMap(enabled = true) {
  const query = useQuery({
    queryKey: ["alerts", "open-map"],
    queryFn: () => listAlerts({ status: "OPEN", perPage: 500 }),
    refetchInterval: enabled ? 30000 : undefined,
    enabled,
  });

  const map = new Map<string, Sev>();
  (query.data?.data ?? []).forEach((a) => {
    if (!a.cycleId) return;
    const prev = map.get(a.cycleId);
    if (!prev || rank(a.severity) > rank(prev)) map.set(a.cycleId, a.severity);
  });

  return { map, raw: query.data?.data ?? [], isLoading: query.isLoading };
}