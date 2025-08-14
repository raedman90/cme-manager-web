import { api } from "@/api/axios";

export type SeriesStagesPoint = {
  date: string;
  RECEBIMENTO: number;
  LAVAGEM: number;
  DESINFECCAO: number;
  ESTERILIZACAO: number;
  ARMAZENAMENTO: number;
};

export type TopReprocessedItem = { materialId: string; name: string | null; code: string | null; count: number };
export type RecentEventItem = {
  id: string;
  materialId: string;
  materialName: string | null;
  materialCode: string | null;
  stage: "RECEBIMENTO" | "LAVAGEM" | "DESINFECCAO" | "ESTERILIZACAO" | "ARMAZENAMENTO" | string;
  timestamp: string;
  source: "LEDGER" | "DB";
  operator: string | null;
  batchId: string | null;
};

export type MetricsOverview = {
  totals: {
    materials: number;
    materialsActive: number;
    lotes: number;
    reprocessTotal: number;
    reprocess24h: number;
    events24h: number;
    ledgerShare24h: number; // 0..1
  };
  stagesToday: Record<string, number>;
  sourceSplit24h: { LEDGER: number; DB: number };
  series7d: SeriesStagesPoint[];
  topReprocessed: TopReprocessedItem[];
  recentEvents: RecentEventItem[];
  lastLedgerAt: string | null;
  generatedAt: string;
};

export async function getMetricsOverview(params?: { days?: number }): Promise<MetricsOverview> {
  const { data } = await api.get("/metrics/overview", { params });
  return data as MetricsOverview;
}
