import * as React from "react";
import { z } from "zod";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  listSolutionLots,
  listTestStripLots,
  createSolutionLot,
  createTestStripLot,
  type SolutionLot,
  type TestStripLot,
  type Agent,
} from "@/api/lots";
import { useToast } from "@/hooks/use-toast";

/* --------------------- consts/helpers --------------------- */
const AGENTS = [
  "PERACETICO",
  "HIPOCLORITO",
  "OPA",
  "QUATERNARIO",
  "ALCOOL70",
  "OUTRO",
] as const;
type AgentEnum = typeof AGENTS[number]; // (opcional) idêntico ao seu Agent

// Unidades idem:
const UNITS = ["PERCENT", "PPM"] as const;

function toDateInput(value?: string) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value.slice(0, 10);
  return d.toISOString().slice(0, 10);
}
function fmtBR(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("pt-BR", { timeZone: "America/Fortaleza" });
}
function isExpired(iso?: string) {
  if (!iso) return false;
  const d = new Date(iso);
  return d.getTime() < Date.now();
}

/* --------------------- schemas --------------------- */
const solSchema = z.object({
  lotNumber: z.string().min(1, "Informe o lote"),
  agent: z.enum(AGENTS, { message: "Informe o agente" }),
  expiryAt: z.string().min(1, "Informe a validade"),
  concentrationLabel: z.string().optional().or(z.literal("")),
  unit: z.enum(UNITS).optional(),
  minValue: z.preprocess((v) => (v === "" || v == null ? undefined : Number(v)), z.number().optional()),
  maxValue: z.preprocess((v) => (v === "" || v == null ? undefined : Number(v)), z.number().optional()),
  brand: z.string().optional().or(z.literal("")),
  supplier: z.string().optional().or(z.literal("")),
  notes: z.string().optional().or(z.literal("")),
});
type SolInput = z.input<typeof solSchema>;
type SolValues = z.output<typeof solSchema>;

const stripSchema = z.object({
  lotNumber: z.string().min(1, "Informe o lote"),
  agent: z.enum(AGENTS, { message: "Informe o agente" }),
  expiryAt: z.string().min(1, "Informe a validade"),
  brand: z.string().optional().or(z.literal("")),
  notes: z.string().optional().or(z.literal("")),
});
type StripInput = z.input<typeof stripSchema>;
type StripValues = z.output<typeof stripSchema>;

/* --------------------- page --------------------- */
export default function InsumosPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  // filtros de listagem
  const [agentFilterSol, setAgentFilterSol] = React.useState<Agent | "all">("all");
  const [agentFilterStrip, setAgentFilterStrip] = React.useState<Agent | "all">("all");
  const [qSol, setQSol] = React.useState("");
  const [qStrip, setQStrip] = React.useState("");
  const [includeExpiredSol, setIncludeExpiredSol] = React.useState(false);
  const [includeExpiredStrip, setIncludeExpiredStrip] = React.useState(false);

  // queries
  const solLots = useQuery({
    queryKey: ["solution-lots", agentFilterSol, qSol, includeExpiredSol],
    queryFn: () =>
      listSolutionLots({
        agent: agentFilterSol === "all" ? undefined : agentFilterSol,
        q: qSol || undefined,
        includeExpired: includeExpiredSol,
        limit: 100,
      }),
  });
  const stripLots = useQuery({
    queryKey: ["strip-lots", agentFilterStrip, qStrip, includeExpiredStrip],
    queryFn: () =>
      listTestStripLots({
        agent: agentFilterStrip === "all" ? undefined : agentFilterStrip,
        q: qStrip || undefined,
        includeExpired: includeExpiredStrip,
        limit: 100,
      }),
  });

  /* --------- forms --------- */
  type SolFormValues = z.infer<typeof solSchema>;   // use OUTPUT do zod
    const solForm = useForm<SolFormValues>({
    resolver: zodResolver(solSchema) as Resolver<SolFormValues>, // cast resolve o conflito de tipos
    defaultValues: {
        lotNumber: "",
        agent: "PERACETICO",
        expiryAt: "",
        concentrationLabel: "",
        unit: "PPM",
        minValue: undefined,
        maxValue: undefined,
        brand: "",
        supplier: "",
        notes: "",
    },
    mode: "onSubmit",
    });

  type StripFormValues = z.infer<typeof stripSchema>;
    const stripForm = useForm<StripFormValues>({
    resolver: zodResolver(stripSchema) as Resolver<StripFormValues>,
    defaultValues: {
        lotNumber: "",
        agent: "PERACETICO",
        expiryAt: "",
        brand: "",
        notes: "",
    },
    mode: "onSubmit",
    });

  const createSolMut = useMutation({
    mutationFn: (v: SolValues) =>
      createSolutionLot({
        ...v,
        minValue: v.minValue ?? null,
        maxValue: v.maxValue ?? null,
        unit: v.unit ?? null,
      }),
    onSuccess: () => {
      toast({ title: "Lote de solução cadastrado" });
      qc.invalidateQueries({ queryKey: ["solution-lots"] });
      solForm.reset({
        lotNumber: "",
        agent: solForm.getValues("agent"),
        expiryAt: "",
        concentrationLabel: "",
        unit: solForm.getValues("unit"),
        minValue: undefined,
        maxValue: undefined,
        brand: "",
        supplier: "",
        notes: "",
      });
    },
    onError: (e: any) =>
      toast({
        title: "Falha ao cadastrar",
        description: e?.response?.data?.message || e?.message || "Erro",
        variant: "destructive",
      }),
  });

  const createStripMut = useMutation({
    mutationFn: (v: StripValues) => createTestStripLot(v),
    onSuccess: () => {
      toast({ title: "Lote de fita teste cadastrado" });
      qc.invalidateQueries({ queryKey: ["strip-lots"] });
      stripForm.reset({
        lotNumber: "",
        agent: stripForm.getValues("agent"),
        expiryAt: "",
        brand: "",
        notes: "",
      });
    },
    onError: (e: any) =>
      toast({
        title: "Falha ao cadastrar",
        description: e?.response?.data?.message || e?.message || "Erro",
        variant: "destructive",
      }),
  });

  return (
    <section className="space-y-6">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Insumos</h2>
          <p className="text-sm opacity-80">Cadastre e gerencie lotes de solução desinfetante e fitas teste.</p>
        </div>
      </header>

      {/* --------- Cadastro: Solução --------- */}
      <Card>
        <CardHeader>
          <CardTitle>Cadastrar — Lote de Solução Desinfetante</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-3 sm:grid-cols-2 md:grid-cols-3"
            onSubmit={solForm.handleSubmit((values) => createSolMut.mutate(values as SolValues))}
          >
            <div>
              <label className="text-sm font-medium">Lote</label>
              <Input
                placeholder="Ex.: SL-2025-001"
                {...solForm.register("lotNumber")}
              />
              <FormErr msg={solForm.formState.errors.lotNumber?.message} />
            </div>
            <div>
              <label className="text-sm font-medium">Agente</label>
              <select
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                {...solForm.register("agent")}
              >
                {AGENTS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
              <FormErr msg={solForm.formState.errors.agent?.message} />
            </div>
            <div>
              <label className="text-sm font-medium">Validade</label>
              <Input
                type="date"
                value={toDateInput(solForm.watch("expiryAt"))}
                onChange={(e) => solForm.setValue("expiryAt", e.target.value, { shouldDirty: true })}
              />
              <FormErr msg={solForm.formState.errors.expiryAt?.message} />
            </div>

            <div className="md:col-span-2">
              <label className="text-sm font-medium">Rótulo de concentração</label>
              <Input placeholder='Ex.: "0,2% / 2000 ppm"' {...solForm.register("concentrationLabel")} />
            </div>
            <div>
              <label className="text-sm font-medium">Unidade</label>
              <select
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={solForm.watch("unit") || ""}
                onChange={(e) =>
                  solForm.setValue("unit", (e.target.value || undefined) as any, { shouldDirty: true })
                }
              >
                <option value="">—</option>
                {UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u === "PERCENT" ? "%" : "ppm"}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-sm font-medium">
                Faixa mín {solForm.watch("unit") === "PPM" ? "(ppm)" : "(%)"}
              </label>
              <Input type="number" inputMode="decimal" {...solForm.register("minValue")} />
            </div>
            <div>
              <label className="text-sm font-medium">
                Faixa máx {solForm.watch("unit") === "PPM" ? "(ppm)" : "(%)"}
              </label>
              <Input type="number" inputMode="decimal" {...solForm.register("maxValue")} />
            </div>

            <div>
              <label className="text-sm font-medium">Marca</label>
              <Input {...solForm.register("brand")} />
            </div>
            <div>
              <label className="text-sm font-medium">Fornecedor</label>
              <Input {...solForm.register("supplier")} />
            </div>

            <div className="sm:col-span-2 md:col-span-3">
              <label className="text-sm font-medium">Observações</label>
              <Textarea rows={2} {...solForm.register("notes")} />
            </div>

            <div className="sm:col-span-2 md:col-span-3 flex justify-end gap-2">
              <Button type="submit" disabled={createSolMut.isPending}>
                {createSolMut.isPending ? "Salvando…" : "Salvar"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* --------- Lista: Soluções --------- */}
      <Card>
        <CardHeader>
          <CardTitle>Lotes de Solução</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <div className="text-sm font-medium">Agente</div>
              <select
                className="rounded-md border bg-background px-3 py-2 text-sm"
                value={agentFilterSol}
                onChange={(e) => setAgentFilterSol(e.target.value as Agent | "all")}
              >
                <option value="all">Todos</option>
                {AGENTS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div className="text-sm font-medium">Buscar</div>
              <Input placeholder="lote/marca/fornecedor" value={qSol} onChange={(e) => setQSol(e.target.value)} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4"
                checked={includeExpiredSol}
                onChange={(e) => setIncludeExpiredSol(e.target.checked)}
              />
              Incluir vencidos
            </label>
            <div className="ml-auto text-sm opacity-70">
              {solLots.isLoading ? "Carregando…" : `${solLots.data?.data.length ?? 0} itens`}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th className="py-2 pr-2">Lote</th>
                  <th className="py-2 pr-2">Agente</th>
                  <th className="py-2 pr-2">Validade</th>
                  <th className="py-2 pr-2">Concentração</th>
                  <th className="py-2 pr-2">Faixa</th>
                  <th className="py-2 pr-2">Marca</th>
                  <th className="py-2 pr-2">Fornecedor</th>
                </tr>
              </thead>
              <tbody>
                {(solLots.data?.data ?? []).map((r: SolutionLot) => (
                  <tr key={r.id} className="border-b last:border-b-0">
                    <td className="py-2 pr-2">{r.lotNumber}</td>
                    <td className="py-2 pr-2">{r.agent}</td>
                    <td className="py-2 pr-2">
                      <span className={isExpired(r.expiryAt) ? "text-red-600 font-medium" : ""}>
                        {fmtBR(r.expiryAt)}
                      </span>
                    </td>
                    <td className="py-2 pr-2">{r.concentrationLabel || "—"}</td>
                    <td className="py-2 pr-2">
                      {r.unit
                        ? `${r.minValue ?? "?"}–${r.maxValue ?? "?"} ${r.unit === "PERCENT" ? "%" : "ppm"}`
                        : "—"}
                    </td>
                    <td className="py-2 pr-2">{r.brand || "—"}</td>
                    <td className="py-2 pr-2">{r.supplier || "—"}</td>
                  </tr>
                ))}
                {!solLots.isLoading && (solLots.data?.data?.length ?? 0) === 0 && (
                  <tr>
                    <td className="py-4 text-center text-muted-foreground" colSpan={7}>
                      Nenhum lote encontrado
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* --------- Cadastro: Fita Teste --------- */}
      <Card>
        <CardHeader>
          <CardTitle>Cadastrar — Lote de Fita Teste</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-3 sm:grid-cols-2 md:grid-cols-3"
            onSubmit={stripForm.handleSubmit((values) => createStripMut.mutate(values as StripValues))}
          >
            <div>
              <label className="text-sm font-medium">Lote</label>
              <Input placeholder="Ex.: FT-2025-001" {...stripForm.register("lotNumber")} />
              <FormErr msg={stripForm.formState.errors.lotNumber?.message} />
            </div>
            <div>
              <label className="text-sm font-medium">Agente</label>
              <select
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                {...stripForm.register("agent")}
              >
                {AGENTS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
              <FormErr msg={stripForm.formState.errors.agent?.message} />
            </div>
            <div>
              <label className="text-sm font-medium">Validade</label>
              <Input
                type="date"
                value={toDateInput(stripForm.watch("expiryAt"))}
                onChange={(e) => stripForm.setValue("expiryAt", e.target.value, { shouldDirty: true })}
              />
              <FormErr msg={stripForm.formState.errors.expiryAt?.message} />
            </div>

            <div>
              <label className="text-sm font-medium">Marca</label>
              <Input {...stripForm.register("brand")} />
            </div>
            <div className="md:col-span-2">
              <label className="text-sm font-medium">Observações</label>
              <Textarea rows={2} {...stripForm.register("notes")} />
            </div>

            <div className="sm:col-span-2 md:col-span-3 flex justify-end gap-2">
              <Button type="submit" disabled={createStripMut.isPending}>
                {createStripMut.isPending ? "Salvando…" : "Salvar"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* --------- Lista: Fitas --------- */}
      <Card>
        <CardHeader>
          <CardTitle>Lotes de Fita Teste</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <div className="text-sm font-medium">Agente</div>
              <select
                className="rounded-md border bg-background px-3 py-2 text-sm"
                value={agentFilterStrip}
                onChange={(e) => setAgentFilterStrip(e.target.value as Agent | "all")}
              >
                <option value="all">Todos</option>
                {AGENTS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div className="text-sm font-medium">Buscar</div>
              <Input placeholder="lote/marca/observação" value={qStrip} onChange={(e) => setQStrip(e.target.value)} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4"
                checked={includeExpiredStrip}
                onChange={(e) => setIncludeExpiredStrip(e.target.checked)}
              />
              Incluir vencidos
            </label>
            <div className="ml-auto text-sm opacity-70">
              {stripLots.isLoading ? "Carregando…" : `${stripLots.data?.data.length ?? 0} itens`}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th className="py-2 pr-2">Lote</th>
                  <th className="py-2 pr-2">Agente</th>
                  <th className="py-2 pr-2">Validade</th>
                  <th className="py-2 pr-2">Marca</th>
                  <th className="py-2 pr-2">Observações</th>
                </tr>
              </thead>
              <tbody>
                {(stripLots.data?.data ?? []).map((r: TestStripLot) => (
                  <tr key={r.id} className="border-b last:border-b-0">
                    <td className="py-2 pr-2">{r.lotNumber}</td>
                    <td className="py-2 pr-2">{r.agent}</td>
                    <td className="py-2 pr-2">
                      <span className={isExpired(r.expiryAt) ? "text-red-600 font-medium" : ""}>
                        {fmtBR(r.expiryAt)}
                      </span>
                    </td>
                    <td className="py-2 pr-2">{r.brand || "—"}</td>
                    <td className="py-2 pr-2">{r.notes || "—"}</td>
                  </tr>
                ))}
                {!stripLots.isLoading && (stripLots.data?.data?.length ?? 0) === 0 && (
                  <tr>
                    <td className="py-4 text-center text-muted-foreground" colSpan={5}>
                      Nenhum lote encontrado
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

/* --------------------- helper de erro curto --------------------- */
function FormErr({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <div className="text-xs text-red-600 mt-1">{msg}</div>;
}
