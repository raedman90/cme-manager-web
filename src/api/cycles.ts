import { api } from "@/api/axios";
import type { Cycle, ListCyclesParams, ListCyclesResponse } from "@/types/cycle";

/* ------------------------- mapeamento seguro ------------------------- */
function mapRow(r: any): Cycle {
  return {
    id: r.id,
    materialId: r.materialId,
    etapa: r.etapa,
    responsavel: r.responsavel,
    observacoes: r.observacoes ?? null,
    timestamp: r.timestamp ?? r.createdAt ?? r.updatedAt ?? null,
    loteId: r.loteId ?? r.batchId ?? null,

    // extras vindos com include/joins
    materialName: r.material?.nome ?? r.material?.name ?? r.materialName ?? null,
    materialCode: r.material?.codigo ?? r.material?.code ?? r.materialCode ?? null,
    loteNumero: r.lote?.numero ?? r.lote?.code ?? r.loteNumero ?? null,
  };
}

/* ------------------------- normalização da lista ------------------------- */
function normalizeList(payload: any, params: ListCyclesParams): ListCyclesResponse {
  // Formato paginado esperado: { data, total, page, perPage }
  if (payload && Array.isArray(payload.data)) {
    return {
      data: payload.data.map(mapRow),
      total: Number(payload.total ?? payload.data.length ?? 0),
      page: Number(payload.page ?? params.page ?? 1),
      perPage: Number(payload.perPage ?? params.perPage ?? payload.data.length ?? 10),
    };
  }

  // Formatos alternativos (compat)
  const arr = Array.isArray(payload?.dados)
    ? payload.dados
    : Array.isArray(payload)
    ? payload
    : [];

  const mapped = arr.map(mapRow);
  const perPage = params.perPage ?? (mapped.length || 10);
  const page = params.page ?? 1;
  return { data: mapped, total: mapped.length, page, perPage };
}

/* ----------------------------- listagem ----------------------------- */
export async function listCycles(params: ListCyclesParams): Promise<ListCyclesResponse> {
  // Envia paginação, busca e sort para o backend
  const q: any = {
    q: params.q || undefined,
    page: params.page || undefined,
    perPage: params.perPage || undefined,
    etapa: params.etapa || undefined,
    sort: params.sort || undefined,
    order: params.order || undefined,

    // filtros diretos
    materialId: params.materialId || undefined,
    loteId: params.loteId || undefined,
    // compat (alguns controllers aceitam batchId)
    batchId: params.loteId || undefined,
  };

  const { data } = await api.get("/cycles", { params: q });
  return normalizeList(data, params);
}

/* ----------------------------- criação ----------------------------- */
export type CreateCyclePayload = {
  materialId?: string;
  loteId?: string; // opcional: se presente, back pode criar ciclo para o material já associado ao lote
  etapa: string;
  responsavel: string;         // badge verificado do TECH
  observacoes?: string;
  // params?: any  // (se você já estiver enviando metadados de etapa)
};

export async function createCycle(payload: CreateCyclePayload & Record<string, any>) {
  const { data } = await api.post("/cycles", payload);
  return data;
}

/* ----------------------------- cancelamento ----------------------------- */
export async function deleteCycle(id: string) {
  await api.delete(`/cycles/${id}`);
}

/* ----------------------------- update de etapa ----------------------------- */
export type UpdateStagePayload = {
  etapa: string;          // "RECEBIMENTO" | "LAVAGEM" | "DESINFECCAO" | "ESTERILIZACAO" | "ARMAZENAMENTO"
  responsavel: string;    // reutiliza o badge já salvo no ciclo
  observacoes?: string;
  // params?: any
};

export async function updateCycleStage(id: string, dto: UpdateStagePayload & Record<string, any>) {
  // ✅ rota dedicada para estágio (compatível com StageAdvanceDialog)
  const { data } = await api.patch(`/cycles/${id}/stage`, dto);
  return data;
}

// (mantém alias se alguém ainda importar)
export async function patchCycleStage(id: string, payload: UpdateStagePayload) {
  const { data } = await api.patch(`/cycles/${id}/stage`, payload);
  return data;
}

/* ----------------------------- criação em lote ----------------------------- */
export type CreateCycleLotePayload = {
  etapa: string;
  responsavel: string;
  observacoes?: string;
  // params?: any
};

export async function createCycleForBatch(loteId: string, payload: CreateCycleLotePayload & Record<string, any>) {
  // ✅ rota preferida (loteRoutes): POST /lotes/:id/cycles
  try {
    const { data } = await api.post(`/lotes/${loteId}/cycles`, payload);
    return data;
  } catch (err: any) {
    // fallback compat (se tiver rota antiga ainda ativa): POST /cycles/lote/:id
    if (err?.response?.status === 404) {
      const { data } = await api.post(`/cycles/lote/${loteId}`, payload);
      return data;
    }
    throw err;
  }
}
export async function updateCycleBasics(
  id: string,
  dto: { responsavel?: string; observacoes?: string }
) {
  // endpoint simples no back: PATCH /cycles/:id
  const { data } = await api.patch(`/cycles/${id}`, dto);
  return data;
}
// Alias opcional
export const createCycleForLote = createCycleForBatch;
