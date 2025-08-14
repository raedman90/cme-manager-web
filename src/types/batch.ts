export type BatchMaterial = {
  id: string;
  name: string;
  code: string | null;
};

export type Batch = {
  id: string;
  code: string;                // Lote.numero
  name: string | null;         // Lote.nome
  materialCount: number;       // _count.materiais || materiais.length
  createdAt: string;
  updatedAt?: string | null;
  materials?: BatchMaterial[]; // <- NOVO (para edição/chips)
};

export type ListBatchesParams = {
  page?: number;
  perPage?: number;
  q?: string;
  status?: string;
  sort?: keyof Batch | "createdAt" | "updatedAt";
  order?: "asc" | "desc";
};

export type ListBatchesResponse = {
  data: Batch[];
  total: number;
  page: number;
  perPage: number;
};
