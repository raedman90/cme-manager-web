import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, keepPreviousData } from "@tanstack/react-query";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";

import ScanCodeDialog from "@/components/common/ScanCodeDialog";

import { listMaterials } from "@/api/materials";
import type { ListMaterialsResponse, Material } from "@/types/material";

import { listBatches } from "@/api/batches";
import type { ListBatchesResponse, Batch } from "@/types/batch";

// API de usuários (TECH) + verificação do crachá
import { listTechUsers, verifyBadge } from "@/api/users";

/* ----------------------------- helpers ----------------------------- */
const STAGES = ["RECEBIMENTO", "LAVAGEM", "DESINFECCAO", "ESTERILIZACAO", "ARMAZENAMENTO"] as const;

/* ----------------------------- schema ----------------------------- */
const schema = z
  .object({
    materialId: z.string().optional().or(z.literal("")),
    loteId: z.string().optional().or(z.literal("")),
    etapa: z.string().min(3, "Informe a etapa"),
    operatorUserId: z.string().min(1, "Selecione o responsável (técnico)"),
    responsavel: z.string().min(1, "Verifique o crachá (QR) do responsável"),
    observacoes: z.string().optional().or(z.literal("")),
  })
  .superRefine((val, ctx) => {
    const hasMaterial = !!(val.materialId && val.materialId.trim());
    const hasLote = !!(val.loteId && val.loteId.trim());
    if (!hasMaterial && !hasLote) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["loteId"], message: "Selecione um lote OU um material." });
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["materialId"], message: "Selecione um material OU um lote." });
    }
  });

export type CycleFormValues = z.output<typeof schema>;

/* ----------------------------- component ----------------------------- */
export default function CycleForm({
  defaultValues,
  submitting,
  onSubmit,
}: {
  defaultValues?: Partial<{ id: string; materialId: string; loteId?: string; etapa: string; responsavel: string; observacoes?: string; operatorUserId?: string }>;
  submitting?: boolean;
  onSubmit: (values: CycleFormValues) => Promise<void> | void;
}) {
  const { toast } = useToast();

  const form = useForm<CycleFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      materialId: defaultValues?.materialId ?? "",
      loteId: defaultValues?.loteId ?? "",
      etapa: (defaultValues?.etapa as any) ?? "RECEBIMENTO",
      operatorUserId: defaultValues?.operatorUserId ?? "",
      responsavel: defaultValues?.responsavel ?? "",
      observacoes: defaultValues?.observacoes ?? "",
    },
  });

  // watchers
  const loteId = useWatch({ control: form.control, name: "loteId" });
  const materialId = useWatch({ control: form.control, name: "materialId" });
  const operatorUserId = useWatch({ control: form.control, name: "operatorUserId" });

  // ✅ verificação obrigatória do crachá via QR
  const [verified, setVerified] = useState(false);

  /* ---------------------- MATERIAL: busca/scan --------------------- */
  const [materialSearch, setMaterialSearch] = useState("");
  const debouncedMatQ = useMemo(() => materialSearch.trim(), [materialSearch]);
  const [scanMatOpen, setScanMatOpen] = useState(false);

  const { data: mats } = useQuery<ListMaterialsResponse>({
    queryKey: ["materials", { q: debouncedMatQ || undefined, page: 1, perPage: 10, active: "true" }],
    queryFn: () =>
      listMaterials({
        q: debouncedMatQ || undefined,
        page: 1,
        perPage: 10,
        active: "true" as any,
      }),
    placeholderData: keepPreviousData,
    enabled: !loteId,
  });

  const matResults: Material[] = mats?.data ?? [];
  const selectedMat = useMemo(() => matResults.find((m) => m.id === materialId), [matResults, materialId]);

  async function handleScanMaterial(code: string) {
    const res = await listMaterials({ q: code, page: 1, perPage: 10, active: "true" as any });
    const byCode = (res.data ?? []).find((m) => (m.code || "").toLowerCase() === code.toLowerCase());
    if (byCode) {
      form.setValue("materialId", byCode.id, { shouldDirty: true, shouldValidate: true });
      toast({ title: "Material selecionado", description: `${byCode.name} (${byCode.code})` });
    } else if (res.data.length === 1) {
      form.setValue("materialId", res.data[0].id, { shouldDirty: true, shouldValidate: true });
      toast({ title: "Material selecionado", description: `${res.data[0].name} (${res.data[0].code})` });
    } else {
      toast({ title: "Não encontrado", description: "Não foi possível identificar o material pelo código.", variant: "destructive" });
    }
  }

  /* ------------------------ LOTE: busca/scan ----------------------- */
  const [batchSearch, setBatchSearch] = useState("");
  const debouncedBatchQ = useMemo(() => batchSearch.trim(), [batchSearch]);
  const [scanBatchOpen, setScanBatchOpen] = useState(false);

  const { data: batches } = useQuery<ListBatchesResponse>({
    queryKey: ["batches", { q: debouncedBatchQ || undefined, page: 1, perPage: 10 }],
    queryFn: () =>
      listBatches({
        q: debouncedBatchQ || undefined,
        page: 1,
        perPage: 10,
      }),
    placeholderData: keepPreviousData,
  });

  const batchResults: Batch[] = batches?.data ?? [];
  const selectedBatch = useMemo(() => batchResults.find((b) => b.id === loteId), [batchResults, loteId]);

  async function handleScanBatch(code: string) {
    const res = await listBatches({ q: code, page: 1, perPage: 10 });
    const byCode = (res.data ?? []).find((b: any) => (b.code || "").toLowerCase() === code.toLowerCase());
    if (byCode) {
      form.setValue("loteId", byCode.id, { shouldDirty: true, shouldValidate: true });
      toast({ title: "Lote selecionado", description: `${byCode.name || "—"} (${byCode.code})` });
    } else if (res.data.length === 1) {
      form.setValue("loteId", res.data[0].id, { shouldDirty: true, shouldValidate: true });
      toast({ title: "Lote selecionado", description: `${res.data[0].name || "—"} (${res.data[0].code})` });
    } else {
      toast({ title: "Não encontrado", description: "Não foi possível identificar o lote pelo código.", variant: "destructive" });
    }
  }

  // Se lote selecionado, limpamos material e desabilitamos UI de material
  useEffect(() => {
    if (loteId) {
      form.setValue("materialId", "", { shouldDirty: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loteId]);

  /* -------------------- RESPONSÁVEL (TECH + QR) ------------------- */
  const { data: techs } = useQuery({
    queryKey: ["users-tech"],
    queryFn: () => listTechUsers(),
    staleTime: 60_000,
  });

  // ao trocar o TECH manualmente, forçamos nova verificação do crachá
  useEffect(() => {
    form.setValue("responsavel", "", { shouldDirty: true, shouldValidate: true });
    setVerified(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [operatorUserId]);

  const [scanOpOpen, setScanOpOpen] = useState(false);
  async function handleScanOperator(code: string) {
    try {
      const u = await verifyBadge(code); // backend valida badge e garante TECH
      form.setValue("operatorUserId", u.id, { shouldDirty: true, shouldValidate: true });
      form.setValue("responsavel", u.badgeCode, { shouldDirty: true, shouldValidate: true });
      setVerified(true);
      toast({ title: "Crachá verificado", description: `${u.name} · ${u.badgeCode}` });
    } catch (e: any) {
      setVerified(false);
      toast({ title: "Crachá inválido", description: e?.response?.data?.message || "Não reconhecido.", variant: "destructive" });
    }
  }

  /* --------------------------- SUBMIT ------------------------------ */
  async function submit(values: CycleFormValues) {
    if (!verified) {
      toast({ title: "Verifique o crachá", description: "Escaneie o QR do responsável antes de confirmar.", variant: "destructive" });
      return;
    }

    await onSubmit({
      ...values,
      // normaliza campos vazios
      loteId: values.loteId ? values.loteId : undefined,
      materialId: values.materialId ? values.materialId : undefined,
    });
  }

  /* --------------------------- render ------------------------------ */
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(submit)} className="space-y-5">
        {/* LOTE (preferencial) */}
        <FormField
          control={form.control}
          name="loteId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Lote (preferencial)</FormLabel>
              <div className="flex flex-wrap gap-2">
                <Input
                  placeholder="Buscar lote por nome/código"
                  value={batchSearch}
                  onChange={(e) => setBatchSearch(e.target.value)}
                  className="flex-1 min-w-[220px]"
                />
                <Button type="button" variant="outline" onClick={() => setScanBatchOpen(true)}>
                  Escanear lote
                </Button>
                {field.value && (
                  <Button type="button" variant="outline" onClick={() => form.setValue("loteId", "", { shouldDirty: true })}>
                    Limpar
                  </Button>
                )}
              </div>

              <div className="mt-2 max-h-48 overflow-auto rounded border">
                {batchResults.length === 0 && debouncedBatchQ ? (
                  <div className="p-3 text-sm text-muted-foreground">Sem resultados</div>
                ) : (
                  batchResults.map((b) => (
                    <label
                      key={b.id}
                      className={`flex items-center gap-2 px-3 py-2 border-b last:border-b-0 cursor-pointer ${
                        field.value === b.id ? "bg-muted/50" : ""
                      }`}
                    >
                      <input
                        type="radio"
                        name="batch"
                        className="size-4"
                        checked={field.value === b.id}
                        onChange={() => form.setValue("loteId", b.id, { shouldDirty: true, shouldValidate: true })}
                      />
                      <div className="text-sm">
                        <div className="font-medium">{b.name || "—"}</div>
                        <div className="text-xs opacity-70">{b.code}</div>
                      </div>
                    </label>
                  ))
                )}
              </div>

              <div className="text-xs mt-2 opacity-80">
                Selecionado: {selectedBatch ? `${selectedBatch.name || "—"} (${selectedBatch.code})` : "—"}
              </div>

              <FormMessage />
            </FormItem>
          )}
        />

        {/* MATERIAL (unitário) — desabilitado se tiver lote */}
        <FormField
          control={form.control}
          name="materialId"
          render={() => (
            <FormItem>
              <FormLabel>Material (se não houver lote)</FormLabel>
              <div className="flex flex-wrap gap-2">
                <Input
                  placeholder="Buscar por nome/código"
                  value={materialSearch}
                  onChange={(e) => setMaterialSearch(e.target.value)}
                  className="flex-1 min-w-[220px]"
                  disabled={!!loteId}
                />
                <Button type="button" variant="outline" onClick={() => setScanMatOpen(true)} disabled={!!loteId}>
                  Escanear material
                </Button>
              </div>

              <div className={`mt-2 max-h-48 overflow-auto rounded border ${loteId ? "opacity-50 pointer-events-none" : ""}`}>
                {matResults.length === 0 && debouncedMatQ ? (
                  <div className="p-3 text-sm text-muted-foreground">Sem resultados</div>
                ) : (
                  matResults.map((m) => (
                    <label
                      key={m.id}
                      className={`flex items-center gap-2 px-3 py-2 border-b last:border-b-0 cursor-pointer ${
                        materialId === m.id ? "bg-muted/50" : ""
                      }`}
                    >
                      <input
                        type="radio"
                        name="material"
                        className="size-4"
                        checked={materialId === m.id}
                        onChange={() => form.setValue("materialId", m.id, { shouldDirty: true, shouldValidate: true })}
                        disabled={!!loteId}
                      />
                      <div className="text-sm">
                        <div className="font-medium">{m.name}</div>
                        <div className="text-xs opacity-70">{m.code}</div>
                      </div>
                    </label>
                  ))
                )}
              </div>

              {loteId ? (
                <div className="text-xs mt-2 text-muted-foreground">
                  Um lote está selecionado — o ciclo será criado para <b>todos os materiais do lote</b>.
                </div>
              ) : (
                <div className="text-xs mt-2 opacity-80">Selecionado: {selectedMat ? `${selectedMat.name} (${selectedMat.code})` : "—"}</div>
              )}

              <FormMessage />
            </FormItem>
          )}
        />

        {/* ETAPA */}
        <FormField
          control={form.control}
          name="etapa"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Etapa</FormLabel>
              <FormControl>
                <select
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={String(field.value)}
                  onChange={(e) => field.onChange(e.target.value)}
                >
                  {STAGES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* RESPONSÁVEL (TECH) + verificação via QR */}
        <FormField
          control={form.control}
          name="operatorUserId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Responsável (Técnico)</FormLabel>
              <div className="flex gap-2">
                <FormControl>
                  <select
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    value={String(field.value)}
                    onChange={(e) => field.onChange(e.target.value)}
                  >
                    <option value="" disabled>
                      Selecione o técnico
                    </option>
                    {(techs ?? []).map((u: any) => (
                      <option key={u.id} value={u.id}>
                        {u.name} {u.badgeCode ? `· ${u.badgeCode}` : ""}
                      </option>
                    ))}
                  </select>
                </FormControl>
                <Button type="button" variant="outline" onClick={() => setScanOpOpen(true)}>
                  Escanear crachá
                </Button>
              </div>
              <div className="text-xs text-muted-foreground">
                O QR do crachá define e valida o <code>responsavel</code> (badgeCode).
              </div>
              {verified ? (
                <div className="mt-1">
                  <Badge variant="default">Crachá verificado</Badge>
                </div>
              ) : (
                <div className="mt-1">
                  <Badge variant="secondary">Pendente de verificação</Badge>
                </div>
              )}
              <FormMessage />
            </FormItem>
          )}
        />

        {/* OBS */}
        <FormField
          control={form.control}
          name="observacoes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Observações</FormLabel>
              <FormControl>
                <Textarea placeholder="Opcional" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => history.back()}>
            Cancelar
          </Button>
          <Button type="submit" disabled={submitting || !verified} title={!verified ? "Verifique o crachá antes" : ""}>
            {submitting ? "Salvando…" : "Confirmar"}
          </Button>
        </div>
      </form>

      {/* Scanners */}
      <ScanCodeDialog open={scanMatOpen} onOpenChange={setScanMatOpen} onResult={(code) => handleScanMaterial(code)} />
      <ScanCodeDialog open={scanBatchOpen} onOpenChange={setScanBatchOpen} onResult={(code) => handleScanBatch(code)} />
      <ScanCodeDialog open={scanOpOpen} onOpenChange={setScanOpOpen} onResult={(code) => handleScanOperator(code)} />
    </Form>
  );
}
