// src/components/cycles/StageMetaDialog.tsx
import * as React from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  attachDisinfectionMeta,
  attachSterilizationMeta,
  attachStorageMeta,
  attachWashMeta,
  type Stage,
} from "@/api/stageMeta";

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
    contactMin: z.preprocess(
      (v) => toNum(v as any),
      z.number().positive("Contato (min) obrigatório")
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
    measuredTempC: z.preprocess((v) => toNum(v as any), z.number().optional()),
    ph: z.preprocess((v) => toNum(v as any), z.number().optional()),
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

  async function submit(values: any) {
    try {
      if (!isMetaStage) {
        toast({
          title: "Etapa sem metadados",
          description: "A etapa RECEBIMENTO não possui metadados para anexar.",
        });
        return;
      }
      if (stage === "LAVAGEM") {
        const { notes, ...meta } = values;
        await attachWashMeta(cycleId, meta, notes);
      } else if (stage === "DESINFECCAO") {
        const { notes, ...meta } = values;
        await attachDisinfectionMeta(cycleId, meta, notes);
      } else if (stage === "ESTERILIZACAO") {
        const { notes, ...meta } = values;
        await attachSterilizationMeta(cycleId, meta, notes);
      } else if (stage === "ARMAZENAMENTO") {
        const { notes, expiresAtLocal, ...rest } = values;
        await attachStorageMeta(
          cycleId,
          { ...rest, expiresAt: toISO(expiresAtLocal) },
          notes
        );
      } else {
        return;
      }

      toast({ title: "Metadados anexados" });
      onOpenChange(false);
      form.reset({});
      onSaved?.();
    } catch (e: any) {
      toast({
        title: "Falha ao anexar metadados",
        description: e?.response?.data?.message || e?.message || "Erro",
        variant: "destructive",
      });
    }
  }

  /* -------------------------- render dos campos -------------------------- */
  const RenderFields = React.useCallback(() => {
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

    if (stage === "DESINFECCAO") {
      return (
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
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
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="solutionLotId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Lote da solução</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Opcional"
                    value={field.value ?? ""}
                    onChange={(e) => field.onChange(e.target.value)}
                  />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="testStripLot"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Lote fita teste</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Opcional"
                    value={field.value ?? ""}
                    onChange={(e) => field.onChange(e.target.value)}
                  />
                </FormControl>
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
                  >
                    <option value="">—</option>
                    <option value="PASS">Aprovado</option>
                    <option value="FAIL">Reprovado</option>
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
  }, [form.control, stage]);

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) form.reset({});
      }}
    >
      <DialogContent className="sm:max-w-[720px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Metadados — {stage}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form className="space-y-4" onSubmit={form.handleSubmit(submit)}>
            <RenderFields />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              {isMetaStage && <Button type="submit">Salvar metadados</Button>}
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
