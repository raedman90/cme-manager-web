import { api } from "@/api/axios";
import type { ListBatchesParams, ListBatchesResponse, Batch, BatchMaterial } from "@/types/batch";

const SORT_MAP: Record<string, string> = {
  code: "numero",
  createdAt: "criadoEm",
  materialCount: "materialCount",
};

function mapMaterials(raw: any[] | undefined): BatchMaterial[] {
  const arr = Array.isArray(raw) ? raw : [];
  return arr.map((m: any) => ({
    id: m.id,
    name: m.nome ?? m.name ?? "",
    code: m.codigo ?? m.code ?? null,
  }));
}

function fromApi(l: any): Batch {
  const matsRaw = Array.isArray(l.materiais) ? l.materiais : Array.isArray(l.materials) ? l.materials : [];
  const materials = mapMaterials(matsRaw);

  const materialCount =
    (l._count?.materiais as number | undefined) ??
    (Array.isArray(matsRaw) ? matsRaw.length : 0) ??
    0;

  return {
    id: l.id,
    code: l.numero,
    name: l.nome ?? null,
    materialCount,
    createdAt: l.criadoEm,
    updatedAt: l.atualizadoEm ?? null,
    materials, // <- NOVO
  };
}

export type CreateOrUpdateBatchPayload = Partial<Batch> & { materialIds?: string[] };
function toApi(payload: CreateOrUpdateBatchPayload) {
  return {
    numero: payload.code,
    nome: payload.name,
    materiais: payload.materialIds, // ids para conectar
  };
}

function normalizeListResponse(payload: any, params: ListBatchesParams): ListBatchesResponse {
  const toList = (arr: any[]) => arr.map(fromApi);

  if (Array.isArray(payload)) {
    const perPage = params.perPage ?? payload.length;
    return { data: toList(payload), total: payload.length, page: params.page ?? 1, perPage };
  }
  if (payload?.data && payload?.meta) {
    const { data } = payload;
    const { total = data.length, page = params.page ?? 1, perPage = params.perPage ?? data.length } = payload.meta;
    return { data: toList(data), total, page, perPage };
  }
  if (payload?.items && payload?.total) {
    const { items, total } = payload;
    return { data: toList(items), total, page: params.page ?? 1, perPage: params.perPage ?? items.length };
  }
  const arr = payload?.data ?? [];
  return { data: toList(arr), total: arr.length, page: params.page ?? 1, perPage: params.perPage ?? arr.length };
}

export async function listBatches(params: ListBatchesParams): Promise<ListBatchesResponse> {
  const { q, page, perPage, status, sort, order } = params;
  const paramsApi: Record<string, any> = {
    q: q || undefined,
    page: page || undefined,
    perPage: perPage || undefined,
    status: status || undefined,
    sort: sort ? (SORT_MAP[sort] ?? sort) : undefined,
    order: order || undefined,
  };
  const { data } = await api.get("/lotes", { params: paramsApi });
  return normalizeListResponse(data, params);
}

export async function createBatch(payload: CreateOrUpdateBatchPayload): Promise<Batch> {
  const { data } = await api.post("/lotes", toApi(payload));
  return fromApi(data);
}

export async function updateBatch(id: string, payload: CreateOrUpdateBatchPayload): Promise<Batch> {
  const { data } = await api.put(`/lotes/${id}`, toApi(payload));
  return fromApi(data);
}

export async function deleteBatch(id: string): Promise<void> {
  await api.delete(`/lotes/${id}`);
}
