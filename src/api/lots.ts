import { api } from "@/api/axios";

export type Agent =
  | "PERACETICO"
  | "HIPOCLORITO"
  | "OPA"
  | "QUATERNARIO"
  | "ALCOOL70"
  | "OUTRO";

export type SolutionLot = {
  id: string; lotNumber: string; agent: Agent;
  concentrationLabel?: string | null;
  unit?: "PERCENT" | "PPM" | null;
  minValue?: number | null;
  maxValue?: number | null;
  expiryAt: string;
  brand?: string | null;
  supplier?: string | null;
};

export type TestStripLot = {
    notes: string;
  id: string; lotNumber: string; agent: SolutionLot["agent"];
  expiryAt: string; brand?: string | null;
};

export async function listSolutionLots(params?: { agent?: SolutionLot["agent"]; q?: string; includeExpired?: boolean; limit?: number }) {
  const { data } = await api.get("/lots/solutions", { params: { ...params, includeExpired: params?.includeExpired ? 1 : undefined } });
  return data as { data: SolutionLot[] };
}
export async function listTestStripLots(params?: { agent?: TestStripLot["agent"]; q?: string; includeExpired?: boolean; limit?: number }) {
  const { data } = await api.get("/lots/test-strips", { params: { ...params, includeExpired: params?.includeExpired ? 1 : undefined } });
  return data as { data: TestStripLot[] };
}

/* --------- CADASTRO --------- */

export async function createSolutionLot(payload: {
  lotNumber: string;
  agent: Agent;
  expiryAt: string; // ISO ou 'YYYY-MM-DD'
  concentrationLabel?: string;
  unit?: "PERCENT" | "PPM" | null;
  minValue?: number | null;
  maxValue?: number | null;
  brand?: string | null;
  supplier?: string | null;
  notes?: string | null;
}) {
  const { data } = await api.post("/lots/solutions", payload);
  return data as SolutionLot;
}

export async function createTestStripLot(payload: {
  lotNumber: string;
  agent: Agent;
  expiryAt: string; // ISO ou 'YYYY-MM-DD'
  brand?: string | null;
  notes?: string | null;
}) {
  const { data } = await api.post("/lots/test-strips", payload);
  return data as TestStripLot;
}
