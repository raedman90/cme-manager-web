// src/types/history.ts
export type Source = "LEDGER" | "DB";
export type Stage =
  | "RECEBIMENTO"
  | "LAVAGEM"
  | "DESINFECCAO"
  | "ESTERILIZACAO"
  | "ARMAZENAMENTO";

export interface MaterialHistoryEvent {
  timestamp: string;         // ISO
  stage: Stage;
  operator: string | null;   // crachá/nome
  source: Source;            // LEDGER | DB
  txId: string | null;
  cycleId: string;
  batchId: string | null;
}

export interface MaterialHistoryResponse {
  materialId: string;
  events: MaterialHistoryEvent[];
}

export interface BatchHistoryResponse {
  lote?: { id: string; name: string | null; code: string | null };
  materials: Array<{ id: string; name: string | null; code: string | null }>;
  events: MaterialHistoryEvent[];
}
