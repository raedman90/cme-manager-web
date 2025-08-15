// src/api/stageMeta.ts
import { api } from "@/api/axios";

/** Etapas permitidas */
export type Stage =
  | "RECEBIMENTO"
  | "LAVAGEM"
  | "DESINFECCAO"
  | "ESTERILIZACAO"
  | "ARMAZENAMENTO";

export type StageKind = "wash" | "disinfection" | "sterilization" | "storage";

/** Map Stage (UI) -> kind (rota) */
export function stageToKind(stage: Stage | string): StageKind | null {
  const s = String(stage || "").toUpperCase();
  if (s === "LAVAGEM") return "wash";
  if (s === "DESINFECCAO") return "disinfection";
  if (s === "ESTERILIZACAO") return "sterilization";
  if (s === "ARMAZENAMENTO") return "storage";
  return null;
}

/* Payloads por etapa */
export type WashMeta = {
  method: "MANUAL" | "ULTRASSONICA" | "TERMO_DESINFECCAO";
  detergent?: string;
  timeMin?: number;
  tempC?: number;
};

export type DisinfectionMeta = {
  agent: "PERACETICO" | "HIPOCLORITO" | "OPA" | "QUATERNARIO" | "ALCOOL70" | "OUTRO";
  concentration?: string;
  contactMin: number;
  solutionLotId?: string;
  testStripLot?: string;
  testStripResult?: "PASS" | "FAIL" | "NA"; // inclui NA como no serviço
  activationTime?: string;  // "HH:mm"
  activationLevel?: "ATIVO_2" | "ATIVO_1" | "INATIVO" | "NAO_REALIZADO";
  testStripExpiry?: string; // "YYYY-MM-DD"
  measuredTempC?: number;
  ph?: number;
};

export type SterilizationMeta = {
  method: "STEAM_134" | "STEAM_121" | "H2O2" | "ETO" | "OUTRO";
  autoclaveId?: string;
  program?: string;
  exposureMin?: number;
  tempC?: number;
  ci?: "PASS" | "FAIL" | "NA";
  bi?: "PASS" | "FAIL" | "NA";
  loadId?: string;
};

export type StorageMeta = {
  location?: string;
  shelfPolicy?: "TIME" | "EVENT";
  expiresAt?: string; // ISO
  integrityOk?: boolean;
};

/* -------------------------- helpers -------------------------- */
const toNum = (v: unknown) => {
  if (v === "" || v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};
const clean = <T extends Record<string, any>>(obj: T) => {
  const out: any = {};
  Object.entries(obj || {}).forEach(([k, v]) => {
    if (v === "" || v === undefined || v === null) return;
    out[k] = v;
  });
  return out as T;
};

/* -------------------- por CICLO (URLs planas) -------------------- */
/** LAVAGEM */
export async function attachWashMeta(cycleId: string, meta: WashMeta, notes?: string, opts?: { force?: boolean }) {
  const payload = clean({
    method: meta.method,
    detergent: meta.detergent,
    timeMin: toNum(meta.timeMin),
    tempC: toNum(meta.tempC),
    ...(notes ? { notes } : {}),
  });
  const qs = opts?.force ? "?force=1" : "";
  const { data } = await api.post(`/cycles/${cycleId}/stage-meta/wash${qs}`, payload);
  return data;
}

/** DESINFECÇÃO */
export async function attachDisinfectionMeta(cycleId: string, meta: DisinfectionMeta, notes?: string, opts?: { force?: boolean }) {
  const payload = clean({
    agent: meta.agent,                              // << plano (sem wrapper)
    concentration: meta.concentration,
    contactMin: Number(meta.contactMin),           // obrigatório > 0
    solutionLotId: meta.solutionLotId,
    testStripLot: meta.testStripLot,
    testStripResult: meta.testStripResult,
    activationTime: meta.activationTime,
    activationLevel: meta.activationLevel,
    testStripExpiry: meta.testStripExpiry,
    measuredTempC: toNum(meta.measuredTempC),
    ph: toNum(meta.ph),
    ...(notes ? { notes } : {}),
  });
  const qs = opts?.force ? "?force=1" : "";
  const { data } = await api.post(`/cycles/${cycleId}/stage-meta/disinfection${qs}`, payload);
  return data;
}

/** ESTERILIZAÇÃO */
export async function attachSterilizationMeta(cycleId: string, meta: SterilizationMeta, notes?: string, opts?: { force?: boolean }) {
  const payload = clean({
    method: meta.method,
    autoclaveId: meta.autoclaveId,
    program: meta.program,
    exposureMin: toNum(meta.exposureMin),
    tempC: toNum(meta.tempC),
    ci: meta.ci,
    bi: meta.bi,
    loadId: meta.loadId,
    ...(notes ? { notes } : {}),
  });
  const qs = opts?.force ? "?force=1" : "";
  const { data } = await api.post(`/cycles/${cycleId}/stage-meta/sterilization${qs}`, payload);
  return data;
}

/** ARMAZENAMENTO */
export async function attachStorageMeta(cycleId: string, meta: StorageMeta, notes?: string, opts?: { force?: boolean }) {
  const payload = clean({
    location: meta.location,
    shelfPolicy: meta.shelfPolicy,
    expiresAt: meta.expiresAt,      // já em ISO
    integrityOk: meta.integrityOk,
    ...(notes ? { notes } : {}),
  });
  const qs = opts?.force ? "?force=1" : "";
  const { data } = await api.post(`/cycles/${cycleId}/stage-meta/storage${qs}`, payload);
  return data;
}

/* ------------------------ GET p/ prefill por CICLO ------------------------ */
export async function getStageEventMeta(stageEventId: string, kind: StageKind) {
  const { data } = await api.get(`/cycles/${stageEventId}/stage-meta/${kind}`);
  return data as {
    ok: boolean;
    cycleId: string;
    stageEventId: string;
    stage: Stage;
    detail?: any; // registro específico da etapa (ex.: DisinfectionEvent)
    meta?: any;   // StageEvent.meta (se o back devolver)
  };
}
/** Verifica se EXISTE metadado para a etapa de um ciclo (pelo endpoint /cycles/...). */
export async function checkStageMeta(cycleId: string, stage: Stage) {
  const kind = stageToKind(stage);
  if (!kind) return { exists: false as const };
  try {
    const { data } = await api.get(`/cycles/${cycleId}/stage-meta/${kind}`);
    return {
      exists: !!data?.detail,
      stageEventId: data?.stageEventId as string | undefined,
    };
  } catch (e: any) {
    if (e?.response?.status === 404) {
      // Sem StageEvent ou sem metadado para essa etapa do ciclo
      return { exists: false as const };
    }
    // Propaga outros erros (401/500 etc.) para o caller decidir
    throw e;
  }
}