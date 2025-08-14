import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import BatchForm, { type BatchFormValues } from "@/components/batches/BatchForm";
import { createBatch, deleteBatch, listBatches, updateBatch } from "@/api/batches";
import type { Batch } from "@/types/batch";
import { useDebounce } from "@/hooks/useDebounce";
import { getBatchColumns } from "@/components/batches/columns";
import MaterialsTable from "@/components/materials/MaterialsTable";
import type { SortingState, OnChangeFn, RowSelectionState } from "@tanstack/react-table";
import type { ListBatchesParams } from "@/types/batch";
import TableSkeleton from "@/components/common/TableSkeleton";
import { downloadCSV, toCSV } from "@/utils/csv";
import ImportBatchesCSVDialog from "@/components/batches/ImportBatchesCSVDialog";
import type { CsvHeader } from "@/utils/csv";
import { getBatchHistory } from "@/api/history";
import { applyReconcileMaterial, reconcileBatch, reconcileMaterial } from "@/api/reconcile";
import ReconcileDialog from "@/components/history/ReconcileDialog";
import HistoryDialog from "@/components/history/HistoryDialog";

// NEW: ciclo (rodar carga)
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Textarea } from "@/components/ui/textarea";
import { createCycleForBatch } from "@/api/cycles";
import { useCyclesSSE } from "@/hooks/useCyclesSSE";


/* sort seguro (somente campos válidos) */
const BATCH_SORT_FIELDS = ["name", "code", "createdAt", "materialCount"] as const;
type BatchSort = (typeof BATCH_SORT_FIELDS)[number];
function toSortField(v: string | undefined): BatchSort | undefined {
  return BATCH_SORT_FIELDS.includes(v as any) ? (v as BatchSort) : undefined;
}
function toDialogEntries(evts: BatchEvent[]): DialogEntry[] {
  return evts.map((e) => ({
    ...e,
    source: e.source === "LEDGER" ? "fabric" : "db",
  }));
}
type BatchEvent = {
  timestamp: string;
  stage: "RECEBIMENTO" | "LAVAGEM" | "DESINFECCAO" | "ESTERILIZACAO" | "ARMAZENAMENTO";
  operator: string | null;
  source: "LEDGER" | "DB";
  txId: string | null;
  cycleId: string;
  batchId: string | null;
  materialId?: string | null;
};

/* schema do diálogo de ciclo */
const cycleSchema = z.object({
  etapa: z.string().min(3, "Informe a etapa"),
  responsavel: z.string().min(3, "Informe o responsável"),
  observacoes: z.string().optional(),
});
type CycleFormValues = z.infer<typeof cycleSchema>;

type DialogEntry = Omit<BatchEvent, "source"> & { source: "fabric" | "db" };

export default function Batches() {
  const { toast } = useToast();
  const qc = useQueryClient();
  useCyclesSSE(() => {
    // invalida a lista para refletir mudanças
    qc.invalidateQueries({ queryKey: ["cycles"] });
  });

  // filtros/estado
  const [q, setQ] = useState("");
  const debouncedQ = useDebounce(q, 400);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [importOpen, setImportOpen] = useState(false);
  const [histOpen, setHistOpen] = useState(false);
  const [recOpen, setRecOpen] = useState(false);
  const [recTitle, setRecTitle] = useState("");
  const [recData, setRecData] = useState<any>(null);
  const [histEntries, setHistEntries] = useState<BatchEvent[]>([]);
  const [materialsMap, setMaterialsMap] = useState<Record<string, string>>({});
  const [histTitle, setHistTitle] = useState("");

  // sorting seguro
  const [sorting, setSorting] = useState<SortingState>([]);
  const sort: ListBatchesParams["sort"] = toSortField(sorting[0]?.id as string | undefined) ?? undefined;
  const order: ListBatchesParams["order"] = sorting.length ? (sorting[0].desc ? "desc" : "asc") : undefined;

  const params: ListBatchesParams = useMemo(
    () => ({ q: debouncedQ || undefined, page, perPage, sort, order }),
    [debouncedQ, page, perPage, sort, order]
  );

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["batches", params],
    queryFn: () => listBatches(params),
    placeholderData: keepPreviousData,
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Batch | null>(null);

  // seleção/bulk actions
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const items = data?.data ?? [];
  const selectedIds = Object.keys(rowSelection)
    .filter((k) => (rowSelection as any)[k])
    .map((k) => items[Number(k)]?.id)
    .filter(Boolean) as string[];

  // mutations lote
  const createMut = useMutation({
    mutationFn: (values: BatchFormValues) =>
      createBatch({ ...values, name: values.name, code: values.code, materialIds: values.materialIds }),
    onSuccess: () => {
      toast({ title: "Lote criado" });
      qc.invalidateQueries({ queryKey: ["batches"] });
      setOpen(false);
    },
    onError: (e: any) =>
      toast({ title: "Erro ao criar", description: e?.response?.data?.message || "—", variant: "destructive" }),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, values }: { id: string; values: BatchFormValues }) =>
      updateBatch(id, { ...values, name: values.name, code: values.code, materialIds: values.materialIds }),
    onSuccess: () => {
      toast({ title: "Lote atualizado" });
      qc.invalidateQueries({ queryKey: ["batches"] });
      setOpen(false);
      setEditing(null);
    },
    onError: (e: any) =>
      toast({ title: "Erro ao atualizar 1", description: e?.response?.data?.message || "—", variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteBatch(id),
    onSuccess: () => {
      toast({ title: "Lote removido" });
      qc.invalidateQueries({ queryKey: ["batches"] });
    },
    onError: (e: any) =>
      toast({ title: "Erro ao remover", description: e?.response?.data?.message || "—", variant: "destructive" }),
  });

  const bulkDelete = useMutation({
    mutationFn: async (ids: string[]) => {
      const results = await Promise.allSettled(ids.map((id) => deleteBatch(id)));
      const rejected = results.filter((r) => r.status === "rejected").length;
      if (rejected) throw new Error(`${rejected} falharam`);
    },
    onSuccess: () => {
      toast({ title: "Lotes removidos" });
      setRowSelection({});
      qc.invalidateQueries({ queryKey: ["batches"] });
    },
    onError: (e: any) =>
      toast({ title: "Falha ao remover", description: String(e?.message ?? e), variant: "destructive" }),
  });

  function openCreate() {
    setEditing(null);
    setOpen(true);
  }
  function openEdit(row: Batch) {
    setEditing(row);
    setOpen(true);
  }
  async function handleApplyReconcile() {
    try {
      if (!recData?.material?.id) return;
      const res = await applyReconcileMaterial(recData.material.id);
      toast({ title: "Correções aplicadas", description: `${res.inserted} evento(s) inserido(s)` });
      // refaz o reconcile para atualizar tela
      const refreshed = await reconcileMaterial(recData.material.id);
      setRecData(refreshed);
      // invalida listas que mudam contadores
      qc.invalidateQueries({ queryKey: ["materials"] });
      qc.invalidateQueries({ queryKey: ["cycles"] });
    } catch (e:any) {
      toast({ title: "Falha ao aplicar", description: e?.message || "Erro", variant: "destructive" });
    }
  }

  async function onSubmit(values: BatchFormValues) {
    if (editing) await updateMut.mutateAsync({ id: editing.id, values });
    else await createMut.mutateAsync(values);
  }
  async function onShowBatchHistory(b: Batch) {
    console.log("[handler] onShowBatchHistory", b.id); // debug
    setHistTitle(`Histórico do lote — ${b.name ?? "—"} (${b.code ?? "—"})`);
    setHistEntries([]); setMaterialsMap({});
    setHistOpen(true); // abre já

    try {
    const res = await getBatchHistory(b.id);

    const map: Record<string, string> = {};
    (res.materials ?? []).forEach((m: any) => {
      map[m.id] = `${m.name ?? "—"} (${m.code ?? "—"})`;
    });

    setHistTitle(
      `Histórico do lote — ${res.lote?.name ?? b.name ?? "—"} (${res.lote?.code ?? b.code ?? "—"})`
    );
    setMaterialsMap(map);

    // ✅ a API agora retorna "events"
    setHistEntries((res as any).events ?? []);
    } catch (e: any) {
      console.error(e);
      setHistOpen(false);
      toast({
        title: "Falha ao carregar histórico",
        description: e?.response?.data?.error || e?.message || "Erro",
        variant: "destructive",
      });
    }
  }
  async function handleReconcileBatch(b: Batch) {
    try {
      const data = await reconcileBatch(b.id);
      // Você pode abrir um resumo por lote ou escolher um item pra detalhar.
      setRecData(data); // mostraremos o JSON agregado; ou abra um drawer personalizado
      setRecTitle(`Reconciliar lote — ${b.name ?? "—"} (${b.code ?? "—"})`);
      setRecOpen(true);
    } catch (e:any) {
      toast({ title: "Falha ao reconciliar", description: e?.message || "Erro", variant: "destructive" });
    }
  }


  // export CSV rico
  async function handleExportCSV() {
    try {
      const BATCH = 500;
      let pageExp = 1;
      const acc: Batch[] = [];
      while (true) {
        const res = await listBatches({ ...params, page: pageExp, perPage: BATCH });
        acc.push(...res.data);
        if (acc.length >= (res.total ?? acc.length) || res.data.length === 0) break;
        pageExp++;
      }

      const fmtDateTime = (s?: string) => {
        if (!s) return "";
        const d = new Date(s);
        if (Number.isNaN(d.getTime())) return "";
        return new Intl.DateTimeFormat("pt-BR", {
          timeZone: "America/Fortaleza",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }).format(d);
      };

      type Row = Batch & { createdAt_br: string; updatedAt_br: string };
      const rows: Row[] = acc.map((b) => ({
        ...b,
        createdAt_br: fmtDateTime(b.createdAt),
        updatedAt_br: fmtDateTime(b.updatedAt ?? ""),
      }));

      const headers: CsvHeader<Row>[] = [
        { key: "name", label: "Nome" },
        { key: "code", label: "Código (numero)" },
        { key: "materialCount", label: "Qtd Materiais" },
        { key: "createdAt", label: "Criado em (ISO)" },
        { key: "createdAt_br", label: "Criado em (BR)" },
        { key: "updatedAt", label: "Atualizado em (ISO)" },
        { key: "updatedAt_br", label: "Atualizado em (BR)" },
      ];

      const csv = toCSV(rows, headers);
      const date = new Date().toISOString().slice(0, 10);
      downloadCSV(`lotes_${date}.csv`, csv);
    } catch (e: any) {
      toast({ title: "Falha ao exportar", description: e?.message || "Erro desconhecido", variant: "destructive" });
    }
  }

  const columns = useMemo(
    () =>
      getBatchColumns({
        onEdit: openEdit,
        onDelete: (row) => { if (confirm("Remover este lote?")) deleteMut.mutate(row.id); },
        onShowHistory: onShowBatchHistory, // << AQUI
        onReconcile: handleReconcileBatch,
      }),
    [deleteMut, onShowBatchHistory, handleReconcileBatch] 
  );

  const total = data?.total ?? items.length ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / perPage));

  const handleSortingChange: OnChangeFn<SortingState> = (updater) => {
    const next = typeof updater === "function" ? updater(sorting) : updater;
    const first = next[0];
    const sortId = toSortField(first?.id as string | undefined);
    setSorting(sortId ? [{ id: sortId, desc: !!first?.desc }] : []);
    setPage(1);
  };

  const tableColumns = [" ", "Nome", "Código", "Materiais", "Criado em", "Ações"]; // skeleton

  // métricas simples
  const avgMaterials = items.length
    ? Math.round(items.reduce((sum, b) => sum + (b.materialCount || 0), 0) / items.length)
    : 0;

  /* ---------------- Diálogo de Rodar Ciclo ---------------- */
  const [cycleOpen, setCycleOpen] = useState(false);
  const [cycleBatchId, setCycleBatchId] = useState<string | null>(null);

  const cycleForm = useForm<CycleFormValues>({
    resolver: zodResolver(cycleSchema),
    defaultValues: { etapa: "ESTERILIZACAO", responsavel: "", observacoes: "" },
  });

  const runCycleMut = useMutation({
    mutationFn: async (values: CycleFormValues) => {
      if (!cycleBatchId) throw new Error("Lote não selecionado");
      return createCycleForBatch(cycleBatchId, values);
    },
    onSuccess: (res: any) => {
      toast({ title: "Ciclo disparado", description: `Registros criados: ${res?.count ?? 0}` });
      setCycleOpen(false);
      setCycleBatchId(null);
      cycleForm.reset();
      // se quiser, revalida lotes
      // qc.invalidateQueries({ queryKey: ["batches"] });
    },
    onError: (e: any) =>
      toast({ title: "Falha ao rodar ciclo", description: e?.response?.data?.message || String(e), variant: "destructive" }),
  });

  return (
    <section className="space-y-4">
      {/* Header + filtros */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Lotes</h2>
          <p className="text-sm opacity-80">Gerencie lotes e vinculação de materiais.</p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <Input
            placeholder="Buscar por nome/código"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            className="w-56"
          />
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleExportCSV}>
              Exportar CSV
            </Button>
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              Importar CSV
            </Button>
            <Button onClick={openCreate}>Novo lote</Button>
          </div>
        </div>
      </header>

      {/* Toolbar seleção */}
      {(selectedIds.length > 0 || selectedIds.length === 1) && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2 text-sm">
          <span className="font-medium">Selecionados: {selectedIds.length}</span>
          <div className="ml-auto flex gap-2">
            {/* Rodar ciclo (apenas quando 1 selecionado) */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (selectedIds.length !== 1) return;
                setCycleBatchId(selectedIds[0]);
                setCycleOpen(true);
              }}
              disabled={selectedIds.length !== 1}
              title={selectedIds.length === 1 ? "Rodar ciclo para este lote" : "Selecione apenas um lote"}
            >
              Rodar ciclo
            </Button>

            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                if (confirm(`Remover ${selectedIds.length} lotes?`)) bulkDelete.mutate(selectedIds);
              }}
              disabled={bulkDelete.isPending}
            >
              Remover
            </Button>
          </div>
        </div>
      )}

      {/* Métricas */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Total de lotes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{isLoading ? "…" : total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Média de materiais</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{isLoading ? "…" : avgMaterials}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Última atualização</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{new Date().toLocaleDateString("pt-BR")}</p>
          </CardContent>
        </Card>
      </div>

      {/* DataTable */}
      <Card>
        <CardHeader>
          <CardTitle>Lista de lotes</CardTitle>
        </CardHeader>
        <CardContent>
          {isError && <div className="text-red-500 text-sm">Erro ao carregar: {(error as any)?.message ?? "—"}</div>}

          {isLoading && !data ? (
            <TableSkeleton columns={tableColumns} rows={perPage} />
          ) : (
            <MaterialsTable
              columns={columns}
              data={items}
              sorting={sorting}
              onSortingChange={handleSortingChange}
              selectable
              rowSelection={rowSelection}
              onRowSelectionChange={setRowSelection}
            />
          )}

          {/* Paginação */}
          <div className="flex items-center justify-between mt-4 gap-3">
            <div className="text-sm opacity-70">
              {total > 0 ? (
                <>
                  Página {page} de {totalPages} · {total} itens
                </>
              ) : (
                <>Sem resultados</>
              )}
            </div>
            <div className="flex items-center gap-2">
              <select
                className="rounded-md border bg-background px-2 py-1 text-sm"
                value={perPage}
                onChange={(e) => {
                  setPerPage(Number(e.target.value));
                  setPage(1);
                }}
              >
                {[5, 10, 20, 50].map((n) => (
                  <option key={n} value={n}>
                    {n}/página
                  </option>
                ))}
              </select>
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                Anterior
              </Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                Próxima
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Dialog Criar/Editar */}
      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) setEditing(null);
        }}
      >
        <DialogContent className="sm:max-w-[720px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar lote" : "Novo lote"}</DialogTitle>
          </DialogHeader>
          <BatchForm
            defaultValues={{
              id: editing?.id,
              name: editing?.name ?? "",
              code: editing?.code ?? "",
              materialIds: editing?.materials?.map((m) => m.id) ?? [],
              materials: editing?.materials, // aceita code: string | null
            }}
            submitting={createMut.isPending || updateMut.isPending}
            onSubmit={onSubmit}
          />
        </DialogContent>
      </Dialog>

      {/* Dialog Rodar Ciclo */}
      <Dialog
        open={cycleOpen}
        onOpenChange={(v) => {
          setCycleOpen(v);
          if (!v) {
            setCycleBatchId(null);
            cycleForm.reset();
          }
        }}
      >
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Rodar ciclo para o lote</DialogTitle>
          </DialogHeader>

          <form
            className="space-y-3"
            onSubmit={cycleForm.handleSubmit((values) => runCycleMut.mutate(values))}
          >
            <div className="grid gap-2">
              <label className="text-sm font-medium">Etapa</label>
              <select
                className="rounded-md border bg-background px-3 py-2 text-sm"
                {...cycleForm.register("etapa")}
              >
                <option value="RECEBIMENTO">Recebimento</option>
                <option value="LAVAGEM">Lavagem</option>
                <option value="DESINFECCAO">Desinfecção</option>
                <option value="ESTERILIZACAO">Esterilização</option>
                <option value="ARMAZENAMENTO">Armazenamento</option>
              </select>
              <small className="text-xs text-muted-foreground">
                Dica: para recall, o lote impresso costuma ser o da <b>Esterilização</b>.
              </small>
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-medium">Responsável</label>
              <Input placeholder="Nome do responsável" {...cycleForm.register("responsavel")} />
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-medium">Observações</label>
              <Textarea placeholder="Opcional" {...cycleForm.register("observacoes")} />
            </div>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setCycleOpen(false);
                  setCycleBatchId(null);
                }}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={runCycleMut.isPending || !cycleBatchId}>
                {runCycleMut.isPending ? "Processando…" : "Confirmar"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>         
      {/* Import CSV */}
      <ImportBatchesCSVDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={() => qc.invalidateQueries({ queryKey: ["batches"] })}
      />
      <HistoryDialog
        open={histOpen}
        onOpenChange={setHistOpen}
        title={histTitle}
        entries={toDialogEntries(histEntries)}
        showMaterial
        materialLabelById={(id) => materialsMap[id]}
      />
      <ReconcileDialog open={recOpen} onOpenChange={setRecOpen} title={recTitle} data={recData} />
      {/* Banner flutuante para aplicar correções */}
      {recOpen && recData?.diffs?.missingInDb?.length > 0 && (
        <div className="fixed bottom-6 right-6 z-[60] flex items-center gap-2 rounded-lg border bg-background/95 p-3 shadow-lg">
          <div className="text-sm">
            Eventos somente no ledger: <b>{recData.diffs.missingInDb.length}</b>
          </div>
          <Button size="sm" onClick={handleApplyReconcile}>
            Aplicar correções
          </Button>
        </div>
      )}
    </section>
  );
}
