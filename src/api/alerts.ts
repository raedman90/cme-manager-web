import { api } from "@/api/axios";

export type Alert = {
  id: string;
  key: string;
  kind: "DISINFECTION_FAIL" | "STERILIZATION_FAIL" | "STORAGE_EXPIRES_SOON" | "STORAGE_EXPIRED" | "READINESS_BLOCK";
  severity: "INFO" | "WARNING" | "CRITICAL";
  status: "OPEN" | "ACKED" | "RESOLVED";
  title: string;
  message?: string;
  cycleId?: string;
  materialId?: string;
  stageEventId?: string;
  stage?: string;
  dueAt?: string | null;
  createdAt: string;
};

export async function listAlerts(params?: { status?: string; severity?: string; q?: string; page?: number; perPage?: number }) {
  const { data } = await api.get("/alerts", { params });
  return data as { data: Alert[]; total: number; page: number; perPage: number };
}
export async function getAlertCounts() {
  const { data } = await api.get("/alerts/counts");
  return data as { open: number; critical: number };
}
export async function ackAlert(id: string) {
  const { data } = await api.patch(`/alerts/${id}/ack`);
  return data as Alert;
}
export async function resolveAlert(id: string) {
  const { data } = await api.patch(`/alerts/${id}/resolve`);
  return data as Alert;
}
// -------- Comments --------
export async function listAlertComments(alertId: string, params?: { page?: number; perPage?: number }) {
  const { data } = await api.get(`/alerts/${alertId}/comments`, { params });
  return data as { data: Array<{ id: string; author?: string | null; text: string; createdAt: string }>; total: number; page: number; perPage: number };
}

export async function createAlertComment(alertId: string, payload: { text: string; author?: string }) {
  const { data } = await api.post(`/alerts/${alertId}/comments`, payload);
  return data;
}

export async function getAlertStats(params?: { from?: string; to?: string; tz?: string }) {
  const { data } = await api.get("/alerts/stats", { params });
  return data as {
    tz: string; from: string; to: string;
    byDay: Array<{ day: string; total: number; CRITICAL: number; WARNING: number; INFO: number }>;
    byKind: Array<{ kind: string; count: number }>;
    totals: { total: number; CRITICAL: number; WARNING: number; INFO: number };
  };
}