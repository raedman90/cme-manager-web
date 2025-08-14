// src/api/history.ts
import { api } from "@/api/axios";
import type {
  MaterialHistoryResponse,
  BatchHistoryResponse,
  MaterialHistoryEvent,
  Source,
  Stage,
} from "@/types/history";

function normSource(s: any): Source {
  const v = String(s ?? "").toUpperCase();
  if (v === "LEDGER" || v === "FABRIC") return "LEDGER";
  return "DB";
}

function normStage(s: any): Stage {
  const up = String(s ?? "").toUpperCase();
  const allowed: Stage[] = ["RECEBIMENTO","LAVAGEM","DESINFECCAO","ESTERILIZACAO","ARMAZENAMENTO"];
  return (allowed.includes(up as Stage) ? up : "RECEBIMENTO") as Stage;
}

function mapEvent(e: any): MaterialHistoryEvent {
  return {
    timestamp: String(e.timestamp ?? e.occurredAt ?? ""),
    stage: normStage(e.stage ?? e.etapa),
    operator: e.operator ?? e.responsavel ?? null,
    source: normSource(e.source ?? e.fonte),
    txId: e.txId ?? e.ledgerTxId ?? null,
    cycleId: String(e.cycleId ?? e.cicloId ?? e.id ?? ""),
    batchId: e.batchId ?? e.loteId ?? null,
  };
}

/** MATERIAL */
export async function getMaterialHistory(
  id: string,
  params?: { startDate?: string; endDate?: string; etapa?: string }
): Promise<MaterialHistoryResponse> {
  const { data } = await api.get(`/materials/${id}/history`, { params });

  const raw = Array.isArray(data?.events)
    ? data.events
    : (Array.isArray(data?.timeline) ? data.timeline : []);

  const events: MaterialHistoryEvent[] = raw.map(mapEvent);

  // aceita { materialId } ou { material: { id } }
  const materialId =
    (data?.materialId as string) ??
    (data?.material?.id as string) ??
    id;

  return { materialId, events };
}

/** LOTE */
export async function getBatchHistory(
  id: string,
  params?: { startDate?: string; endDate?: string; etapa?: string }
): Promise<BatchHistoryResponse> {
  const { data } = await api.get(`/lotes/${id}/history`, { params });

  const raw = Array.isArray(data?.events)
    ? data.events
    : (Array.isArray(data?.timeline) ? data.timeline : []);

  const events: MaterialHistoryEvent[] = raw.map(mapEvent);

  const lote = data?.lote
    ? {
        id: String(data.lote.id),
        name: data.lote.name ?? data.lote.nome ?? null,
        code: data.lote.code ?? data.lote.numero ?? null,
      }
    : undefined;

  const materials = Array.isArray(data?.materials)
    ? data.materials.map((m: any) => ({
        id: String(m.id),
        name: m.name ?? m.nome ?? null,
        code: m.code ?? m.codigo ?? null,
      }))
    : [];

  return { lote, materials, events };
}

/** Resolver QR/código */
export async function resolveByCode(code: string): Promise<{
  type: "material" | "lote";
  id: string;
  code?: string;
  label?: string;
}> {
  const { data } = await api.get("/search/resolve", { params: { code } });
  return data;
}
