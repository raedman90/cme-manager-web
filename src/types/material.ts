export interface Material {
  reprocessamentos: number;
  id: string;
  name: string;
  code: string;
  description?: string;
  active: boolean;

  // campos extras (se quiser usar no front)
  category?: string;
  type?: string;     // crítico/semicrítico/não crítico
  expiry?: string;   // ISO date
  reprocessCount?: number;

  createdAt: string;
  updatedAt: string;
}

export interface ListMaterialsParams {
  q?: string;
  page?: number;
  perPage?: number;
  active?: "true" | "false";
  sort?: keyof Material;      // "name" | "code" | "active" | "createdAt" | "updatedAt" | ...
  order?: "asc" | "desc";
}

export interface ListMaterialsResponse {
  data: Material[];
  total: number;
  page: number;
  perPage: number;
}
