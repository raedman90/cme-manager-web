// src/components/cycles/StageMetaDialog.tsx
import * as React from "react";
import { z } from "zod";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  attachDisinfectionMeta,
  attachSterilizationMeta,
  attachStorageMeta,
  attachWashMeta,
  type Stage,
  getStageEventMeta,
  type StageKind,
} from "@/api/stageMeta";
import { downloadCSV, toCSV } from "@/utils/csv";
import { listSolutionLots, listTestStripLots, type SolutionLot, type TestStripLot } from "@/api/lots";
import { useQuery } from "@tanstack/react-query";

/* -------------------------- helpers -------------------------- */

function toISO(local?: string) {
  if (!local) return undefined;
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}
function toNum(v: string | number | undefined): number | undefined {
  if (v === "" || v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/* -------------------------- schemas por etapa -------------------------- */

const washSchema = z.object({
  method: z.enum(["MANUAL", "ULTRASSONICA", "TERMO_DESINFECCAO"]),
  detergent: z.string().optional(),
  timeMin: z.preprocess((v) => toNum(v as any), z.number().positive().optional()),
  tempC: z.preprocess((v) => toNum(v as any), z.number().optional()),
  notes: z.string().optional(),
})
// (opcional) mensagem customizada quando vazio/indefinido:
.refine((v) => !!v.method, { message: "Informe o método" });

const disinfectionSchema = z
  .object({
    agent: z.enum(["PERACETICO", "HIPOCLORITO", "OPA", "QUATERNARIO", "ALCOOL70", "OUTRO"]),
    concentration: z.string().optional(),
    contactMin: z.preprocess((v) => toNum(v as any),
      z.number().int("Use minutos inteiros").positive("Contato (min) obrigatório")
    ),
    solutionLotId: z.string().optional(),
    testStripLot: z.string().optional(),
    testStripResult: z.enum(["PASS", "FAIL", "NA"]).optional(),
    activationTime: z
      .string()
      .regex(/^\d{2}:\d{2}$/, "Hora no formato HH:MM")
      .optional(),
    activationLevel: z.enum(["ATIVO_2","ATIVO_1","INATIVO","NAO_REALIZADO"]).optional(),
    testStripExpiry: z.string().optional(), // "YYYY-MM-DD"
    measuredTempC: z.preprocess((v) => toNum(v as any),
      z.number().min(0, "Temp. mínima 0°C").max(150, "Temp. máxima 150°C").optional()
    ),
    ph: z.preprocess((v) => toNum(v as any),
      z.number().min(0, "pH mínimo 0").max(14, "pH máximo 14").optional()
    ),
    notes: z.string().optional(),
  })
  .superRefine((val, ctx) => {
    if (["PERACETICO", "OPA", "HIPOCLORITO"].includes(val.agent) && !val.concentration) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Concentração é obrigatória para o agente escolhido",
        path: ["concentration"],
      });
    }const hasTestInfo = !!(val.testStripLot || val.testStripResult || val.activationTime);
    if (hasTestInfo && !val.activationLevel) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Selecione a classificação do resultado (legenda).",
        path: ["activationLevel"],
      });
    }
    // Fita com validade: se lote informado, validade deve existir e não estar expirada
    if (val.testStripLot) {
      if (!val.testStripExpiry) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Informe a validade da fita.", path: ["testStripExpiry"] });
      } else {
        const today = new Date(); today.setHours(0,0,0,0);
        const exp = new Date(val.testStripExpiry);
        if (!isNaN(exp.getTime()) && exp < today) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Fita vencida.", path: ["testStripExpiry"] });
        }
      }
    }
  });

const sterilizationSchema = z.object({
  method: z.enum(["STEAM_134", "STEAM_121", "H2O2", "ETO", "OUTRO"]),
  autoclaveId: z.string().optional(),
  program: z.string().optional(),
  exposureMin: z.preprocess((v) => toNum(v as any), z.number().positive().optional()),
  tempC: z.preprocess((v) => toNum(v as any), z.number().optional()),
  ci: z.enum(["PASS", "FAIL", "NA"]).optional(),
  bi: z.enum(["PASS", "FAIL", "NA"]).optional(),
  loadId: z.string().optional(),
  notes: z.string().optional(),
})
.refine((v) => !!v.method, { message: "Informe o método" });

const storageSchema = z.object({
  location: z.string().optional(),
  shelfPolicy: z.enum(["TIME", "EVENT"]).optional(),
  expiresAtLocal: z.string().optional(), // datetime-local (convertido no submit)
  integrityOk: z.boolean().optional(),
  notes: z.string().optional(),
});

/* -------------------------- props -------------------------- */

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  cycleId: string;
  stage: Stage;
  onSaved?: () => void;
};

/* -------------------------- component -------------------------- */

export default function StageMetaDialog({ open, onOpenChange, cycleId, stage, onSaved }: Props) {
  const { toast } = useToast();
  const META_STAGES: Stage[] = ["LAVAGEM", "DESINFECCAO", "ESTERILIZACAO", "ARMAZENAMENTO"];
  const isMetaStage = React.useMemo(() => META_STAGES.includes(stage), [stage]);
  const [locked, setLocked] = React.useState(false);
  const [loadingPrefill, setLoadingPrefill] = React.useState(false);
  const [hasExisting, setHasExisting] = React.useState(false);
  const [risk, setRisk] = React.useState<null | { level: "warning" | "danger"; msg: string }>(null);

  // escolhe schema conforme etapa
  const schema = React.useMemo(() => {
    switch (stage) {
      case "LAVAGEM":
        return washSchema;
      case "DESINFECCAO":
        return disinfectionSchema;
      case "ESTERILIZACAO":
        return sterilizationSchema;
      case "ARMAZENAMENTO":
        return storageSchema;
      default:
        return z.object({ notes: z.string().optional() }).partial();
    }
  }, [stage]);

  // como o schema é dinâmico, mantemos o tipo do form amplo (any) para evitar conflitos de tipos no JSX
  const form = useForm<any>({
    resolver: zodResolver(schema),
    defaultValues: {},
    mode: "onSubmit",
  });

  // ---------- DESINFECÇÃO: carregar lotes conforme o agente selecionado ----------
  const agentVal = useWatch({ control: form.control, name: "agent" });
  const solutionLotIdVal = useWatch({ control: form.control, name: "solutionLotId" });
  const stripLotIdVal = useWatch({ control: form.control, name: "testStripLot" });
  const solLots = useQuery({
    queryKey: ["solution-lots", agentVal, open],
    queryFn: () => listSolutionLots({ agent: agentVal, limit: 50 }),
    enabled: open && stage === "DESINFECCAO" && !!agentVal,
  });
  const stripLots = useQuery({
    queryKey: ["strip-lots", agentVal, open],
    queryFn: () => listTestStripLots({ agent: agentVal, limit: 50 }),
    enabled: open && stage === "DESINFECCAO" && !!agentVal,
  });

  // Limpa lotes quando o agente muda (apenas na DESINFECCAO)
  React.useEffect(() => {
    if (!open || stage !== "DESINFECCAO") return;
    form.setValue("solutionLotId", "", { shouldDirty: true, shouldValidate: false });
    form.setValue("testStripLot", "", { shouldDirty: true, shouldValidate: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentVal]);

  // Limpa lotes quando o agente muda (apenas na DESINFECCAO)
  React.useEffect(() => {
    if (!open || stage !== "DESINFECCAO") return;
    form.setValue("solutionLotId", "", { shouldDirty: true, shouldValidate: false });
    form.setValue("testStripLot", "", { shouldDirty: true, shouldValidate: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentVal]);

  // Ao selecionar Lote da SOLUÇÃO → sugerir concentração (se vazia)
  React.useEffect(() => {
    if (!open || stage !== "DESINFECCAO") return;
    if (!solutionLotIdVal) return;
    const lot = (solLots.data?.data ?? []).find((l: SolutionLot) => l.id === solutionLotIdVal);
    if (!lot?.concentrationLabel) return;
    const curr = form.getValues().concentration;
    if (!curr) {
      form.setValue("concentration", lot.concentrationLabel, { shouldDirty: true, shouldValidate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [solutionLotIdVal, solLots.data, open, stage]);

  // Ao selecionar Lote da FITA → sugerir validade (YYYY-MM-DD)
  React.useEffect(() => {
    if (!open || stage !== "DESINFECCAO") return;
    if (!stripLotIdVal) return;
    const lot = (stripLots.data?.data ?? []).find((l: TestStripLot) => l.id === stripLotIdVal);
    if (!lot?.expiryAt) return;
    const iso = new Date(lot.expiryAt);
    if (!Number.isNaN(iso.getTime())) {
      form.setValue("testStripExpiry", iso.toISOString().slice(0, 10), { shouldDirty: true, shouldValidate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stripLotIdVal, stripLots.data, open, stage]);

  function warnExpiry(iso?: string) {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    const days = Math.round((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (days < 0) return <span className="text-xs text-red-600">Vencido em {d.toLocaleDateString("pt-BR")}</span>;
    if (days <= 7) return <span className="text-xs text-yellow-700">Vence em {d.toLocaleDateString("pt-BR")}</span>;
    return <span className="text-xs text-muted-foreground">Val.: {d.toLocaleDateString("pt-BR")}</span>;
  }
  // Map stage -> kind
  const kind = React.useMemo<StageKind | null>(() => {
    if (stage === "LAVAGEM") return "wash";
    if (stage === "DESINFECCAO") return "disinfection";
    if (stage === "ESTERILIZACAO") return "sterilization";
    if (stage === "ARMAZENAMENTO") return "storage";
    return null;
  }, [stage]);

  // Prefill ao abrir
  React.useEffect(() => {
    (async () => {
      if (!open || !isMetaStage || !kind) return;
      setLoadingPrefill(true);
      try {
        const res = await getStageEventMeta(cycleId, kind);
        const d = res?.detail;
        if (!d) {
          form.reset({});
          setLocked(false);
          setHasExisting(false);
          setRisk(null);
          return;
        }
        // Normaliza por etapa
        if (stage === "DESINFECCAO") {
          const nowHM = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
          form.reset({
            agent: d.agent ?? "",
            concentration: d.concentration ?? "",
            contactMin: d.contactMin ?? "",
            solutionLotId: d.solutionLotId ?? "",
            testStripLot: d.testStripLot ?? "",
            testStripResult: d.testStripResult ?? "",
            activationTime: d.activationTime ?? nowHM,
            activationLevel: d.activationLevel ?? "",
            testStripExpiry: d.testStripExpiry ? String(d.testStripExpiry).slice(0,10) : "",
            measuredTempC: d.measuredTempC ?? "",
            ph: d.ph ?? "",
            notes: res?.meta?.disinfection?.notes ?? "",
          });
        } else if (stage === "LAVAGEM") {
          form.reset({
            method: d.method ?? "",
            detergent: d.detergent ?? "",
            timeMin: d.timeMin ?? "",
            tempC: d.tempC ?? "",
          });
        } else if (stage === "ESTERILIZACAO") {
          form.reset({
            method: d.method ?? "",
            autoclaveId: d.autoclaveId ?? "",
            program: d.program ?? "",
            exposureMin: d.exposureMin ?? "",
            tempC: d.tempC ?? "",
            ci: d.ci ?? "",
            bi: d.bi ?? "",
            loadId: d.loadId ?? "",
            notes: res?.meta?.sterilization?.notes ?? "",
          });
        } else if (stage === "ARMAZENAMENTO") {
          form.reset({
            location: d.location ?? "",
            shelfPolicy: d.shelfPolicy ?? "",
            expiresAtLocal: d.expiresAt ? String(d.expiresAt).slice(0,16) : "",
            integrityOk: d.integrityOk ?? false,
            notes: res?.meta?.storage?.notes ?? "",
          });
        }
        setLocked(true);
        setHasExisting(true);
        // Avaliar risco com base no dado carregado
        if (stage === "DESINFECCAO") {
          if (d.testStripResult === "FAIL") {
            setRisk({ level: "danger", msg: "Fita teste REPROVADA. Realizar nova diluição antes de prosseguir." });
          } else if (d.activationLevel === "INATIVO" || d.activationLevel === "NAO_REALIZADO") {
            setRisk({ level: "warning", msg: "Classificação indica solução inativa ou teste não realizado." });
          } else {
            setRisk(null);
          }
        } else {
          setRisk(null);
        }
      } catch (err: any) {
        // 404 => sem StageEvent/meta para essa etapa
        form.reset({});
        setLocked(false);
        setHasExisting(false);
        setRisk(null);
      } finally {
        setLoadingPrefill(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, cycleId, stage, kind]);

  async function submit(values: any) {
    try {
      if (!isMetaStage) {
        toast({
          title: "Etapa sem metadados",
          description: "A etapa RECEBIMENTO não possui metadados para anexar.",
        });
        return;
      }
      // Se já existe e está travado, nada a fazer
      if (locked) return;
      const force = hasExisting; // se já existe (envia ?force=1)

      if (stage === "LAVAGEM") {
        const { notes, ...meta } = values;
        await attachWashMeta(cycleId, meta, notes, { force });
      } else if (stage === "DESINFECCAO") {
        const { notes, ...meta } = values;
        await attachDisinfectionMeta(cycleId, meta, notes, { force });
      } else if (stage === "ESTERILIZACAO") {
        const { notes, ...meta } = values;
        await attachSterilizationMeta(cycleId, meta, notes, { force });
      } else if (stage === "ARMAZENAMENTO") {
        const { notes, expiresAtLocal, ...rest } = values;
        await attachStorageMeta(
          cycleId,
          { ...rest, expiresAt: toISO(expiresAtLocal) },
          notes,
          { force }
        );
      } else {
        return;
      }

      toast({ title: "Metadados anexados" });
      onOpenChange(false);
      form.reset({});
      onSaved?.();
    } catch (e: any) {
      if (e?.response?.status === 409) {
        setLocked(true);
        setHasExisting(true);
        toast({
          title: "Já preenchido",
          description: "Esta etapa já possui metadados. Clique em Editar para alterar.",
        });
        return;
      }
      toast({
        title: "Falha ao anexar metadados",
        description: e?.response?.data?.message || e?.message || "Erro",
        variant: "destructive",
      });
    }
  }
  // Exportar CSV do registro atual (prefill ou form)
  function handleExportCSV() {
    const v = form.getValues() || {};
    const now = new Date();
    const filename = `meta_${stage.toLowerCase()}_${now.toISOString().slice(0,10)}.csv`;
    const row = { stage, ...v };
    // headers simples: chaves do objeto atual
    const headers = Object.keys(row).map((k) => ({ key: k as keyof typeof row, label: k }));
    const csv = toCSV([row] as any[], headers as any);
    downloadCSV(filename, csv);
  }

  /* -------------------------- render dos campos -------------------------- */
  const RenderFields = () => {
    if (!isMetaStage) {
      return (
        <div className="py-6">
          <p className="text-sm text-muted-foreground">
            A etapa <strong>RECEBIMENTO</strong> não possui metadados. Prossiga o ciclo para etapas
            como <em>LAVAGEM</em>, <em>DESINFECCAO</em>, <em>ESTERILIZACAO</em> ou <em>ARMAZENAMENTO</em>.
          </p>
        </div>
      );
    }
    if (stage === "LAVAGEM") {
      return (
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
          <FormField
            control={form.control}
            name="method"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Método</FormLabel>
                <FormControl>
                  <select
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    value={field.value ?? ""}
                    onChange={(e) => field.onChange(e.target.value)}
                    disabled={locked}
                   >
                    <option value="">—</option>
                    <option value="MANUAL">Manual</option>
                    <option value="ULTRASSONICA">Ultrassônica</option>
                    <option value="TERMO_DESINFECCAO">Termo-desinfecção</option>
                  </select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="detergent"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Detergente</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Opcional"
                    value={field.value ?? ""}
                    onChange={(e) => field.onChange(e.target.value)}
                    disabled={locked} 
                  />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="timeMin"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Tempo (min)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    inputMode="numeric"
                    value={field.value ?? ""}
                    onChange={(e) => field.onChange(e.target.value)}
                    disabled={locked}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="tempC"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Temperatura (°C)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    inputMode="numeric"
                    value={field.value ?? ""}
                    onChange={(e) => field.onChange(e.target.value)}
                    disabled={locked}
                  />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
              <FormItem className="sm:col-span-2 md:col-span-3">
                <FormLabel>Observações</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Opcional"
                    value={field.value ?? ""}
                    onChange={(e) => field.onChange(e.target.value)}
                    disabled={locked}
                  />
                </FormControl>
              </FormItem>
            )}
          />
        </div>
      );
    }

    if (stage === "DESINFECCAO") {
      return (
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
         {risk && (
            <div className="sm:col-span-2 md:col-span-3">
              <Alert variant={risk.level === "danger" ? "destructive" : "default"}>
                <AlertTitle>{risk.level === "danger" ? "Atenção crítica" : "Atenção"}</AlertTitle>
                <AlertDescription>{risk.msg}</AlertDescription>
              </Alert>
            </div>
          )}
           {/* Horário do teste */}
          <FormField
            control={form.control}
            name="activationTime"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Horário do teste</FormLabel>
                <FormControl>
                  <Input
                    type="time"
                    value={field.value ?? ""}
                    onChange={(e) => field.onChange(e.target.value)}
                    disabled={locked}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="agent"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Agente</FormLabel>
                <FormControl>
                  <select
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    value={field.value ?? ""}
                    onChange={(e) => field.onChange(e.target.value)}
                    disabled={locked}
                  >
                    <option value="">—</option>
                    <option value="PERACETICO">Peracético</option>
                    <option value="HIPOCLORITO">Hipoclorito</option>
                    <option value="OPA">OPA</option>
                    <option value="QUATERNARIO">Quaternário</option>
                    <option value="ALCOOL70">Álcool 70%</option>
                    <option value="OUTRO">Outro</option>
                  </select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="concentration"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Concentração</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Ex.: 0,2% / 2000 ppm"
                    value={field.value ?? ""}
                    onChange={(e) => field.onChange(e.target.value)}
                    disabled={locked}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="contactMin"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Contato (min)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    inputMode="numeric"
                    value={field.value ?? ""}
                    onChange={(e) => field.onChange(e.target.value)}
                    disabled={locked}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          {/* Lote da solução (agora na DESINFECCAO) */}
          <FormField
            control={form.control}
            name="solutionLotId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Lote da solução</FormLabel>
                <FormControl>
                  <select
                    key={`solution-${agentVal || "none"}`}
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    {...field}
                    value={field.value ?? ""}
                    disabled={locked || !agentVal || solLots.isLoading}
                  >
                    <option value="">—</option>
                    {(solLots.data?.data ?? []).map((l: SolutionLot) => (
                      <option key={l.id} value={l.id}>
                        {l.lotNumber}{l.brand ? ` · ${l.brand}` : ""}
                      </option>
                    ))}
                  </select>
                </FormControl>
                {!!field.value && (
                  <div className="mt-1 text-xs">
                    {warnExpiry((solLots.data?.data ?? []).find(l => l.id === field.value)?.expiryAt)}{" "}
                    <span className="text-muted-foreground">
                      {(solLots.data?.data ?? []).find(l => l.id === field.value)?.concentrationLabel || ""}
                    </span>
                  </div>
                )}
                {!solLots.isLoading && (solLots.data?.data?.length ?? 0) === 0 && agentVal && (
                  <div className="mt-1 text-xs text-muted-foreground">
                    Nenhum lote ativo para {agentVal}. Cadastre em “Insumos”.
                  </div>
                )}
              </FormItem>
            )}
          />
          {/* Lote fita teste */}
          <FormField
            control={form.control}
            name="testStripLot"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Lote fita teste</FormLabel>
                <FormControl>
                  <select
                    key={`strip-${agentVal || "none"}`}
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    {...field}
                    value={field.value ?? ""}
                    disabled={locked || !agentVal || stripLots.isLoading}
                  >
                    <option value="">—</option>
                    {(stripLots.data?.data ?? []).map((l: TestStripLot) => (
                      <option key={l.id} value={l.id}>
                        {l.lotNumber}{l.brand ? ` · ${l.brand}` : ""}
                      </option>
                    ))}
                  </select>
                </FormControl>

                {!!field.value && (
                  <div className="mt-1">
                    {warnExpiry((stripLots.data?.data ?? []).find(l => l.id === field.value)?.expiryAt)}
                  </div>
                )}
              </FormItem>
            )}
          />
          {/* Validade da fita */}
          <FormField
            control={form.control}
            name="testStripExpiry"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Validade da fita</FormLabel>
                <FormControl>
                  <Input
                    type="date"
                    value={field.value ?? ""}
                    onChange={(e) => field.onChange(e.target.value)}
                    disabled={locked}
                  />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="testStripResult"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Resultado fita</FormLabel>
                <FormControl>
                  <select
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    value={field.value ?? ""}
                    onChange={(e) => field.onChange(e.target.value)}
                    disabled={locked}
                  >
                    <option value="">—</option>
                    <option value="PASS">Aprovado</option>
                    <option value="FAIL">Reprovado</option>
                    <option value="NA">N/A</option>
                  </select>
                </FormControl>
              </FormItem>
            )}
          />
          {/* Classificação (legenda do impresso) */}
          <FormField
            control={form.control}
            name="activationLevel"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Classificação (legenda)</FormLabel>
                <FormControl>
                  <select
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    value={field.value ?? ""}
                    onChange={(e) => field.onChange(e.target.value)}
                    disabled={locked}
                  >
                    <option value="">—</option>
                    <option value="ATIVO_2">ATIVO a 2% — Desinf. alto nível</option>
                    <option value="ATIVO_1">ATIVO a 1% — Nova diluição</option>
                    <option value="INATIVO">INATIVO — Nova diluição</option>
                    <option value="NAO_REALIZADO">NÃO REALIZADO — Falta de insumo</option>
                  </select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="measuredTempC"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Temp. medida (°C)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    inputMode="numeric"
                    value={field.value ?? ""}
                    onChange={(e) => field.onChange(e.target.value)}
                    disabled={locked}
                  />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="ph"
            render={({ field }) => (
              <FormItem>
                <FormLabel>pH</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    inputMode="numeric"
                    value={field.value ?? ""}
                    onChange={(e) => field.onChange(e.target.value)}
                    disabled={locked}
                  />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
              <FormItem className="sm:col-span-2 md:col-span-3">
                <FormLabel>Observações</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Opcional"
                    value={field.value ?? ""}
                    onChange={(e) => field.onChange(e.target.value)}
                  />
                </FormControl>
              </FormItem>
            )}
          />
        </div>
      );
    }

    if (stage === "ESTERILIZACAO") {
      return (
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
          <FormField
            control={form.control}
            name="method"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Método</FormLabel>
                <FormControl>
                  <select
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    value={field.value ?? ""}
                    onChange={(e) => field.onChange(e.target.value)}
                    disabled={locked}
                  >
                    <option value="">—</option>
                    <option value="STEAM_134">Vapor 134°C</option>
                    <option value="STEAM_121">Vapor 121°C</option>
                    <option value="H2O2">Peróxido de hidrogênio</option>
                    <option value="ETO">ETO</option>
                    <option value="OUTRO">Outro</option>
                  </select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="autoclaveId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Autoclave</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Identificação do equipamento"
                    value={field.value ?? ""}
                    onChange={(e) => field.onChange(e.target.value)}
                    disabled={locked}
                  />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="program"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Programa</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Ex.: Prg Rápido"
                    value={field.value ?? ""}
                    onChange={(e) => field.onChange(e.target.value)}
                    disabled={locked}
                  />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="exposureMin"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Exposição (min)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    inputMode="numeric"
                    value={field.value ?? ""}
                    onChange={(e) => field.onChange(e.target.value)}
                    disabled={locked}
                  />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="tempC"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Temperatura (°C)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    inputMode="numeric"
                    value={field.value ?? ""}
                    onChange={(e) => field.onChange(e.target.value)}
                    disabled={locked}
                  />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="ci"
            render={({ field }) => (
              <FormItem>
                <FormLabel>CI</FormLabel>
                <FormControl>
                  <select
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    value={field.value ?? ""}
                    onChange={(e) => field.onChange(e.target.value)}
                    disabled={locked}
                  >
                    <option value="">—</option>
                    <option value="PASS">PASS</option>
                    <option value="FAIL">FAIL</option>
                    <option value="NA">N/A</option>
                  </select>
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="bi"
            render={({ field }) => (
              <FormItem>
                <FormLabel>BI</FormLabel>
                <FormControl>
                  <select
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    value={field.value ?? ""}
                    onChange={(e) => field.onChange(e.target.value)}
                    disabled={locked}
                  >
                    <option value="">—</option>
                    <option value="PASS">PASS</option>
                    <option value="FAIL">FAIL</option>
                    <option value="NA">N/A</option>
                  </select>
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="loadId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Carga/Load</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Identificador da carga"
                    value={field.value ?? ""}
                    onChange={(e) => field.onChange(e.target.value)}
                    disabled={locked}
                  />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
              <FormItem className="sm:col-span-2 md:col-span-3">
                <FormLabel>Observações</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Opcional"
                    value={field.value ?? ""}
                    onChange={(e) => field.onChange(e.target.value)}
                  />
                </FormControl>
              </FormItem>
            )}
          />
        </div>
      );
    }

    // ARMAZENAMENTO
    if (stage === "ARMAZENAMENTO") {
      return (
      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
        <FormField
          control={form.control}
          name="location"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Local</FormLabel>
              <FormControl>
                <Input
                  placeholder="Ex.: Sala 3 - Prateleira B"
                  value={field.value ?? ""}
                  onChange={(e) => field.onChange(e.target.value)}
                  disabled={locked}
                />
              </FormControl>
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="shelfPolicy"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Política</FormLabel>
              <FormControl>
                <select
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={field.value ?? ""}
                  onChange={(e) => field.onChange(e.target.value)}
                  disabled={locked}
                >
                  <option value="">—</option>
                  <option value="TIME">Por tempo</option>
                  <option value="EVENT">Por evento</option>
                </select>
              </FormControl>
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="expiresAtLocal"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Validade (data/hora)</FormLabel>
              <FormControl>
                <Input
                  type="datetime-local"
                  value={field.value ?? ""}
                  onChange={(e) => field.onChange(e.target.value)}
                  disabled={locked}
                />
              </FormControl>
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="integrityOk"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Integridade do pacote</FormLabel>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={!!field.value}
                  onChange={(e) => field.onChange(e.target.checked)}
                  disabled={locked}
                />
                <span className="text-sm text-muted-foreground">Sem violação / embalagem íntegra</span>
              </div>
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem className="sm:col-span-2 md:col-span-3">
              <FormLabel>Observações</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Opcional"
                  value={field.value ?? ""}
                  onChange={(e) => field.onChange(e.target.value)}
                />
              </FormControl>
            </FormItem>
          )}
        />
      </div>
      );
    }
    return null;
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        // proteger contra perda de alterações
        if (!v && form.formState.isDirty && !confirm("Descartar alterações não salvas?")) return;
        onOpenChange(v);
        if (!v) form.reset({});
      }}
    >
      <DialogContent className="sm:max-w-[720px] max-h-[85vh] overflow-y-auto">
        <DialogTitle className="flex flex-wrap items-center gap-2">
            <span>Metadados — {stage}</span>
            {loadingPrefill && <span className="text-xs text-muted-foreground">carregando…</span>}
            {hasExisting && !loadingPrefill && (
              <span className="rounded bg-muted px-2 py-0.5 text-xs">já preenchido</span>
            )}
            {/* Resumo (apenas DESINFECCAO) */}
            {stage === "DESINFECCAO" && form.getValues()?.agent && (
              <span className="ml-auto flex gap-2">
                <span className="rounded px-2 py-0.5 text-xs border">
                  Agente: {form.getValues().agent}
                </span>
                {form.getValues().testStripResult && (
                  <span className="rounded px-2 py-0.5 text-xs border">
                    Fita: {form.getValues().testStripResult}
                  </span>
                )}
                {form.getValues().activationLevel && (
                  <span className="rounded px-2 py-0.5 text-xs border">
                    Class.: {form.getValues().activationLevel}
                  </span>
                )}
              </span>
            )}
          </DialogTitle>

        <Form {...form}>
          <form className="space-y-4" onSubmit={form.handleSubmit(submit)}>
            <RenderFields />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
             {isMetaStage && !loadingPrefill && (
                locked ? (
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" onClick={handleExportCSV}>
                      Exportar CSV
                    </Button>
                    <Button
                      type="button"
                      onClick={() => {
                        if (confirm("Editar metadados desta etapa?")) setLocked(false);
                      }}
                    >
                      Editar
                    </Button>
                  </div>
                ) : (
                  <Button type="submit" disabled={!form.formState.isDirty}>
                    Salvar metadados
                  </Button>
                )
              )}
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
