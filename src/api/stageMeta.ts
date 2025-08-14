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
  const { data } = await api.get(`/stage-events/${stageEventId}/stage-meta/${kind}`);
  return data as {
    ok: boolean;
    cycleId: string;
    stageEventId: string;
    stage: Stage;
    detail?: any; // registro específico da etapa (ex.: DisinfectionEvent)
    meta?: any;   // StageEvent.meta (se o back devolver)
  };
}