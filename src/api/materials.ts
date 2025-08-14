// src/api/materials.ts
import { api } from "@/api/axios";
import type { ListMaterialsParams, ListMaterialsResponse, Material } from "@/types/material";

/** Mapeia campos de sort do front -> back (Prisma) */
const SORT_MAP: Record<string, string> = {
  name: "nome",
  code: "codigo",
  active: "ativo",
  createdAt: "criadoEm",
  updatedAt: "atualizadoEm",
};

/** API -> Front */
function fromApi(m: any): Material {
  return {
    id: m.id,
    name: m.nome,
    code: m.codigo,
    description: m.descricao ?? "",
    active: Boolean(m.ativo),
    category: m.categoria ?? undefined,
    type: m.tipo ?? undefined,
    expiry: m.validade ?? undefined,
    createdAt: m.criadoEm,
    updatedAt: m.atualizadoEm,

    // 👇 novo: garante o campo exigido pelo tipo
    reprocessamentos: Number(m.reprocessamentos ?? m.reprocessCount ?? m.reprocess ?? 0),
  };
}

/** Front -> API */
function toApi(payload: Partial<Material>): any {
  return {
    nome: payload.name,
    codigo: payload.code,
    descricao: payload.description,
    ativo: payload.active,
    categoria: payload.category,
    tipo: payload.type,
    validade: payload.expiry,
  };
}

function normalizeListResponse(payload: any, params: { page?: number; perPage?: number }): ListMaterialsResponse {
  if (Array.isArray(payload)) {
    const perPage = params.perPage ?? payload.length;
    return { data: payload.map(fromApi), total: payload.length, page: params.page ?? 1, perPage };
  }
  if (payload?.data && payload?.meta) {
    const { data } = payload;
    const { total = data.length, page = params.page ?? 1, perPage = params.perPage ?? data.length } = payload.meta;
    return { data: data.map(fromApi), total, page, perPage };
  }
  if (payload?.items && payload?.total) {
    const { items, total } = payload;
    return { data: items.map(fromApi), total, page: params.page ?? 1, perPage: params.perPage ?? items.length };
  }
  const arr = payload?.data ?? [];
  return { data: arr.map(fromApi), total: arr.length, page: params.page ?? 1, perPage: params.perPage ?? arr.length };
}

/** Listar com filtros */
export async function listMaterials(params: ListMaterialsParams): Promise<ListMaterialsResponse> {
  const { data } = await api.get("/materials", { params });
  const normalized = normalizeListResponse(data, params);

  // mapear cada item
  const mapped = (normalized.data || []).map((m: any) => ({
    ...m,
    // mantém o campo do tipo Material
    reprocessamentos: Number(m.reprocessamentos ?? m.reprocessCount ?? m.reprocess ?? 0),

    // robustez para outros campos que às vezes vêm com nomes diferentes
    name: m.name ?? m.nome ?? m.Name ?? "",
    code: m.code ?? m.codigo ?? m.Code ?? null,
    description: m.description ?? m.descricao ?? null,
    active: typeof m.active === "boolean" ? m.active : (typeof m.ativo === "boolean" ? m.ativo : true),
  }));

  return { ...normalized, data: mapped };
}

export async function createMaterial(payload: Partial<Material>): Promise<Material> {
  const { data } = await api.post("/materials", toApi(payload));
  return fromApi(data);
}

export async function updateMaterial(id: string, payload: Partial<Material>): Promise<Material> {
  const { data } = await api.put(`/materials/${id}`, toApi(payload));
  return fromApi(data);
}

export async function deleteMaterial(id: string): Promise<void> {
  await api.delete(`/materials/${id}`);
}

/* ========= NOVO: Histórico do material (timeline) ========= */

export type Stage =
  | "RECEBIMENTO"
  | "LAVAGEM"
  | "DESINFECCAO"
  | "ESTERILIZACAO"
  | "ARMAZENAMENTO";

export type Source = "LEDGER" | "DB";

export interface MaterialHistoryEvent {
  timestamp: string;   // ISO
  stage: Stage;
  operator: string | null;
  source: Source;
  txId: string | null; // no DB pode ser null
  cycleId: string;
  batchId: string | null;
}

export interface MaterialHistoryResponse {
  materialId: string;
  events: MaterialHistoryEvent[];
}

export async function getMaterialHistory(materialId: string) {
  const { data } = await api.get<Partial<MaterialHistoryResponse>>(
    `/materials/${materialId}/history`
  );

  const rawEvents: any[] = Array.isArray((data as any)?.events)
    ? (data as any).events
    : [];

  // normaliza campos e garante array
  const events: MaterialHistoryEvent[] = rawEvents.map((e: any) => ({
    timestamp: String(e.timestamp ?? e.time ?? ""),
    stage: (e.stage ?? e.etapa ?? "RECEBIMENTO") as any,
    operator: e.operator ?? e.operador ?? null,
    source: (e.source ?? (e.txId ? "LEDGER" : "DB")) as any,
    txId: e.txId ?? null,
    cycleId: String(e.cycleId ?? e.cicloId ?? ""),
    batchId: e.batchId ?? e.loteId ?? null,
  }));

  return {
    materialId: String((data as any)?.materialId ?? materialId),
    events,
  } as MaterialHistoryResponse;
}

