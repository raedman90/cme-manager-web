import { api } from "@/api/axios";

export type PolicyStatus = "ok" | "near" | "exceeded" | "unknown";

export type MaterialReconcile = {
  material: { id: string; name?: string | null; code?: string | null; type?: string | null; reprocessCount?: number };
  summary: { dbCount: number; fabricCount: number; lastStageDb: string | null; lastStageFabric: string | null; equal: boolean };
  diffs: Array<{ index: number; type: "missing-db" | "missing-ledger" | "mismatch"; db?: any; fabric?: any }>;
  policy: { status: PolicyStatus; limit: number | null };
};

export async function getMaterialReconcile(id: string): Promise<MaterialReconcile> {
  const { data } = await api.get(`/materials/${id}/reconcile`);
  // pt->en defensivo
  if (data?.policy?.status === undefined && data?.policy?.estado) data.policy.status = data.policy.estado;
  return data;
}

export type LoteReconcile = {
  lote: { id: string; name?: string | null; code?: string | null };
  materialCount: number;
  dbCount: number;
  fabricCount: number;
  equal: boolean;
};

export async function getBatchReconcile(id: string): Promise<LoteReconcile> {
  const { data } = await api.get(`/lotes/${id}/reconcile`);
  return data;
}

export async function reconcileMaterial(id: string) {
  const { data } = await api.get(`/materials/${id}/reconcile`);
  return data as {
    material: { id: string; name?: string; code?: string; type?: string; reprocessCount_db: number; reprocessCount_ledger: number; policy: { limit: number; exceeded: boolean } };
    ledger: { count: number; lastStage: string | null; lastAt: string | null };
    db: { count: number; lastStage: string | null; lastAt: string | null };
    diffs: { missingInDb: any[]; missingInLedger: any[] };
  };
}

export async function reconcileBatch(id: string) {
  const { data } = await api.get(`/lotes/${id}/reconcile`);
  return data as {
    lote: { id: string; name?: string; code?: string };
    items: Awaited<ReturnType<typeof reconcileMaterial>>[];
    summary: { count: number; exceeded: number };
  };
}

export async function applyReconcileMaterial(id: string) {
  const { data } = await api.post(`/materials/${id}/reconcile/apply`);
  return data as { ok: boolean; inserted: number; sterilizationsAdded: number };
}