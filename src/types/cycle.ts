export type CycleStage =
  | "RECEBIMENTO"
  | "LAVAGEM"
  | "DESINFECCAO"
  | "ESTERILIZACAO"
  | "ARMAZENAMENTO";

export type Cycle = {
  id: string;
  materialId: string;
  etapa: CycleStage | string;   // backend uppercasa
  responsavel: string;
  observacoes?: string | null;
  timestamp: string;            // criado no back
  loteId?: string | null;

  // extras de conveniência para UI (se vierem via include/mapping)
  materialName?: string | null;
  materialCode?: string | null;
  loteNumero?: string | null;
};

export type ListCyclesParams = {
  page?: number;
  perPage?: number;
  q?: string;           // (opcional: filtrar por materialCode/nome no adapter)
  loteId?: string;
  materialId?: string;
  etapa?: string;
  sort?: "timestamp" | "etapa" | "responsavel";
  order?: "asc" | "desc";
};

export type ListCyclesResponse = {
  data: Cycle[];
  total: number;
  page: number;
  perPage: number;
};
