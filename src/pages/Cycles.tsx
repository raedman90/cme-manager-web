import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import CycleForm, { type CycleFormValues } from "@/components/cycles/CycleForm";
import { createCycle, deleteCycle, listCycles, updateCycleStage, createCycleForBatch } from "@/api/cycles";
import type { Cycle } from "@/types/cycle";
import { useDebounce } from "@/hooks/useDebounce";
import { getCycleColumns } from "@/components/cycles/columns";
import MaterialsTable from "@/components/materials/MaterialsTable";
import type { SortingState, OnChangeFn, RowSelectionState } from "@tanstack/react-table";
import type { ListCyclesParams } from "@/types/cycle";
import TableSkeleton from "@/components/common/TableSkeleton";
import { downloadCSV, toCSV } from "@/utils/csv";
import ImportCyclesCSVDialog from "@/components/cycles/ImportCyclesCSVDialog";
import type { CsvHeader } from "@/utils/csv";

/** Etapas (apenas p/ filtro/render) */
const STAGES = ["RECEBIMENTO", "LAVAGEM", "DESINFECCAO", "ESTERILIZACAO", "ARMAZENAMENTO"] as const;

/** Campos de sort permitidos (seguro) */
const CYCLE_SORT_FIELDS = ["timestamp", "etapa", "responsavel"] as const;
type CycleSort = (typeof CYCLE_SORT_FIELDS)[number];
function toSortField(v: string | undefined): CycleSort | undefined {
  return CYCLE_SORT_FIELDS.includes(v as any) ? (v as CycleSort) : undefined;
}

export default function Cycles() {
  const { toast } = useToast();
  const qc = useQueryClient();

  // filtros/estado
  const [q, setQ] = useState("");
  const debouncedQ = useDebounce(q, 400);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);

  // filtro de etapa
  const [stageFilter, setStageFilter] = useState<"all" | typeof STAGES[number]>("all");

  // import dialog
  const [importOpen, setImportOpen] = useState(false);

  // sorting seguro
  const [sorting, setSorting] = useState<SortingState>([]);
  const sort: ListCyclesParams["sort"] = toSortField(sorting[0]?.id as string | undefined) ?? undefined;
  const order: ListCyclesParams["order"] = sorting.length ? (sorting[0].desc ? "desc" : "asc") : undefined;

  const params: ListCyclesParams = useMemo(
    () => ({
      q: debouncedQ || undefined,
      page,
      perPage,
      etapa: stageFilter === "all" ? undefined : stageFilter,
      sort,
      order,
    }) as any,
    [debouncedQ, page, perPage, stageFilter, sort, order]
  );

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["cycles", params],
    queryFn: () => listCycles(params as any),
    placeholderData: keepPreviousData,
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Cycle | null>(null);

  // criar
  const createMut = useMutation({
    mutationFn: (values: CycleFormValues) => createCycle(values as any),
    onSuccess: () => {
      toast({ title: "Ciclo criado" });
      qc.invalidateQueries({ queryKey: ["cycles"] });
      setOpen(false);
    },
    onError: (e: any) =>
      toast({ title: "Erro ao criar", description: e?.response?.data?.message || "—", variant: "destructive" }),
  });

  // editar = atualizar etapa/responsável/obs (se seu CycleForm enviar params, repasso também)
  const updateStageMut = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: any }) => updateCycleStage(id, dto),
    onSuccess: () => {
      toast({ title: "Ciclo atualizado" });
      qc.invalidateQueries({ queryKey: ["cycles"] });
      setOpen(false);
      setEditing(null);
    },
    onError: (e: any) =>
      toast({ title: "Erro ao atualizar 2", description: e?.response?.data?.message || "—", variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteCycle(id),
    onSuccess: () => {
      toast({ title: "Ciclo cancelado" });
      qc.invalidateQueries({ queryKey: ["cycles"] });
    },
    onError: (e: any) =>
      toast({ title: "Erro ao cancelar", description: e?.response?.data?.message || "—", variant: "destructive" }),
  });

  // seleção (mantemos para futuras ações em massa; sem trocar etapa aqui)
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const items = data?.data ?? [];

  function openCreate() { setEditing(null); setOpen(true); }
  function openEdit(row: Cycle) { setEditing(row); setOpen(true); }

  /* ----------------------------- submit do form ---------------------------- */
  async function onSubmit(values: CycleFormValues) {
    const hasLote = !!values.loteId;

    // EDITAR
    if (editing) {
      const dto: any = {
        etapa: values.etapa,
        responsavel: values.responsavel,
        observacoes: values.observacoes,
      };

      // Se o seu CycleForm fornecer params (ex.: lavagem/desinfecção/esterilização),
      // eles serão encaminhados e o backend não reclamará dos obrigatórios.
      if ((values as any).params) dto.params = (values as any).params;

      await updateStageMut.mutateAsync({ id: editing.id, dto });
      return;
    }

    // CRIAR
    if (hasLote) {
      await createCycleForBatch(values.loteId!, {
        etapa: values.etapa,
        responsavel: values.responsavel,
        observacoes: values.observacoes,
      } as any);
      toast({ title: "Ciclos criados para o lote" });
    } else {
      await createCycle({
        materialId: values.materialId!,
        etapa: values.etapa,
        responsavel: values.responsavel,
        observacoes: values.observacoes,
      } as any);
      toast({ title: "Ciclo criado" });
    }

    await qc.invalidateQueries({ queryKey: ["cycles"] });
    setOpen(false);
  }

  // export CSV (com nomes extras vindos da API)
  async function handleExportCSV() {
    try {
      const BATCH = 500;
      let pageExp = 1;
      const acc: Cycle[] = [];
      while (true) {
        const res = await listCycles({ ...(params as any), page: pageExp, perPage: BATCH });
        acc.push(...(res.data ?? []));
        if (acc.length >= (res.total ?? acc.length) || (res.data ?? []).length === 0) break;
        pageExp++;
      }

      const fmtISO = (s?: string | null) => (s ? new Date(s).toISOString() : "");
      const fmtBR = (s?: string | null) =>
        s && !Number.isNaN(new Date(s).getTime())
          ? new Intl.DateTimeFormat("pt-BR", {
              timeZone: "America/Fortaleza",
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            }).format(new Date(s))
          : "";

      type Row = Cycle & {
        materialName?: string | null;
        materialCode?: string | null;
        loteNumero?: string | null;
        timestamp_br?: string;
        timestamp_iso?: string;
      };

      const rows: Row[] = acc.map((c: any) => ({
        ...c,
        timestamp_iso: fmtISO(c.timestamp),
        timestamp_br: fmtBR(c.timestamp),
      }));

      const headers: CsvHeader<Row>[] = [
        { key: "id", label: "id" },
        { key: "etapa", label: "etapa" },
        { key: "responsavel", label: "responsavel" },
        { key: "observacoes", label: "observacoes" },
        { key: "materialName", label: "material_nome" },
        { key: "materialCode", label: "material_codigo" },
        { key: "loteNumero", label: "lote_numero" },
        { key: "timestamp_iso", label: "timestamp_iso" },
        { key: "timestamp_br", label: "timestamp_br" },
      ];

      const csv = toCSV(rows, headers);
      const date = new Date().toISOString().slice(0, 10);
      downloadCSV(`ciclos_${date}.csv`, csv);
    } catch (e: any) {
      toast({ title: "Falha ao exportar", description: e?.message || "Erro desconhecido", variant: "destructive" });
    }
  }

  // ⚠️ Removemos avanço de etapa na lista: ao tentar, só avisa para usar “Editar”
  const columns = useMemo(
    () =>
      getCycleColumns({
        onEdit: openEdit,
        onDelete: (row) => {
          if (confirm("Cancelar este ciclo?")) deleteMut.mutate(row.id);
        },
        onChangeStage: () => {
          toast({
            title: "Avanço de etapa desativado aqui",
            description: "Use o botão Editar para mudar a etapa (com os metadados exigidos).",
          });
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deleteMut, toast]
  );

  const total = data?.total ?? (data?.data?.length ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / perPage));

  const handleSortingChange: OnChangeFn<SortingState> = (updater) => {
    const next = typeof updater === "function" ? updater(sorting) : updater;
    const first = next[0];
    const sortId = toSortField(first?.id as string | undefined);
    setSorting(sortId ? [{ id: sortId, desc: !!first?.desc }] : []);
    setPage(1);
  };

  // métricas simples
  const totalToday = items.filter((c: any) => {
    if (!c.timestamp) return false;
    const d = new Date(c.timestamp);
    const now = new Date();
    return d.toDateString() === now.toDateString();
  }).length;

  return (
    <section className="space-y-4">
      {/* Header + filtros */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Ciclos</h2>
          <p className="text-sm opacity-80">Acompanhe etapas por material e por lote, com atualização rápida.</p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <Input
            placeholder="Buscar por material/lote/responsável"
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1); }}
            className="w-56"
          />
          <select
            className="rounded-md border bg-background px-2 py-2 text-sm"
            value={stageFilter}
            onChange={(e) => { setStageFilter(e.target.value as any); setPage(1); }}
          >
            <option value="all">Todas as etapas</option>
            {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleExportCSV}>Exportar CSV</Button>
            <Button variant="outline" onClick={() => setImportOpen(true)}>Importar CSV</Button>
            <Button onClick={openCreate}>Novo ciclo</Button>
          </div>
        </div>
      </header>

      {/* Métricas simples */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardHeader><CardTitle>Total de ciclos</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{isLoading ? "…" : total}</p></CardContent></Card>
        <Card><CardHeader><CardTitle>Hoje</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{isLoading ? "…" : totalToday}</p></CardContent></Card>
        <Card><CardHeader><CardTitle>Filtro etapa</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{stageFilter === "all" ? "Todas" : stageFilter}</p></CardContent></Card>
      </div>

      {/* DataTable */}
      <Card>
        <CardHeader><CardTitle>Lista de ciclos</CardTitle></CardHeader>
        <CardContent>
          {isError && (<div className="text-red-500 text-sm">Erro ao carregar: {(error as any)?.message ?? "—"}</div>)}

          {isLoading && !data ? (
            <TableSkeleton columns={[" ", "Etapa", "Responsável", "Material", "Data/Hora", "Lote", "Ações"]} rows={perPage} />
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
              {total > 0 ? (<>Página {page} de {totalPages} · {total} itens</>) : (<>Sem resultados</>)}
            </div>
            <div className="flex items-center gap-2">
              <select
                className="rounded-md border bg-background px-2 py-1 text-sm"
                value={perPage}
                onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }}
              >
                {[5, 10, 20, 50].map((n) => (<option key={n} value={n}>{n}/página</option>))}
              </select>
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Anterior</Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Próxima</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Dialog Criar/Editar */}
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
        <DialogContent className="sm:max-w-[720px] max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Editar ciclo" : "Novo ciclo"}</DialogTitle></DialogHeader>
          <CycleForm
            defaultValues={{
              id: editing?.id,
              materialId: (editing as any)?.materialId ?? "",
              loteId: (editing as any)?.loteId ?? "",
              etapa: (editing as any)?.etapa ?? "RECEBIMENTO",
              responsavel: (editing as any)?.responsavel ?? "",
              observacoes: (editing as any)?.observacoes ?? "",
            }}
            submitting={createMut.isPending || updateStageMut.isPending}
            onSubmit={onSubmit}
          />
        </DialogContent>
      </Dialog>

      {/* Import CSV */}
      <ImportCyclesCSVDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={() => qc.invalidateQueries({ queryKey: ["cycles"] })}
      />
    </section>
  );
}
