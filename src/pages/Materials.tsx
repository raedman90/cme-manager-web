import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient, keepPreviousData, useQueries } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import MaterialForm, { type MaterialFormValues } from "@/components/materials/MaterialForm";
import { createMaterial, deleteMaterial, listMaterials, updateMaterial } from "@/api/materials";
import type { Material } from "@/types/material";
import { useDebounce } from "@/hooks/useDebounce";
import { getMaterialColumns } from "@/components/materials/columns";
import MaterialsTable from "@/components/materials/MaterialsTable";
import type { SortingState, OnChangeFn, RowSelectionState } from "@tanstack/react-table";
import type { ListMaterialsParams } from "@/types/material";
import TableSkeleton from "@/components/common/TableSkeleton";
import { downloadCSV, toCSV } from "@/utils/csv";
import ImportCSVDialog from "@/components/materials/ImportCSVDialog";
import type { CsvHeader } from "@/utils/csv";
import { z } from "zod";
import { useUrlState } from "@/hooks/useUrlState";
import { getBatchHistory, getMaterialHistory, resolveByCode } from "@/api/history";
import ScanCodeDialog from "@/components/common/ScanCodeDialog";
import MaterialReconcileDialog from "@/components/reconcile/MaterialReconcileDialog";
import ReconcileDialog from "@/components/history/ReconcileDialog";
import { reconcileMaterial } from "@/api/reconcile";
import HistoryDialog from "@/components/history/HistoryDialog";
import { applyReconcileMaterial } from "@/api/reconcile";

/* -------------------- sort seguro (front) -------------------- */
const MATERIAL_SORT_FIELDS = ["name", "code", "active", "createdAt", "updatedAt"] as const satisfies Readonly<Array<keyof Material>>;
type MaterialSort = (typeof MATERIAL_SORT_FIELDS)[number];
function toSortField(v: string | undefined): MaterialSort | undefined {
  return MATERIAL_SORT_FIELDS.includes(v as any) ? (v as MaterialSort) : undefined;
}

/* -------------------- Filtros <-> URL -------------------- */
const filtersSchema = z.object({
  q: z.string().default(""),
  page: z.number().int().min(1).default(1),
  perPage: z.number().int().min(5).max(100).default(10),
  active: z.enum(["all", "true", "false"]).default("all"),
  sort: z.string().optional(),               // string na URL
  order: z.enum(["asc", "desc"]).optional(),
});
const filtersDefaults = filtersSchema.parse({});

// ✅ adicione tipos locais compatíveis
type Stage = "RECEBIMENTO" | "LAVAGEM" | "DESINFECCAO" | "ESTERILIZACAO" | "ARMAZENAMENTO";

type MaterialEvent = {
  timestamp: string;
  stage: Stage;
  operator: string | null;
  source: "LEDGER" | "DB";
  txId: string | null;
  cycleId: string;
  batchId: string | null;
};

type DialogEntry = Omit<MaterialEvent, "source"> & { source: "fabric" | "db" };

// ✅ helper de conversão para o HistoryDialog
function toDialogEntries(evts: MaterialEvent[]): DialogEntry[] {
  return (evts ?? []).map((e) => ({
    ...e,
    source: e.source === "LEDGER" ? "fabric" : "db",
  }));
}

export default function Materials() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { state: filters, set: setFilters } = useUrlState(filtersSchema, filtersDefaults);
  const debouncedQ = useDebounce(filters.q, 400);

  const [importOpen, setImportOpen] = useState(false);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [scanOpen, setScanOpen] = useState(false);
  const [materialsMap, setMaterialsMap] = useState<Record<string,string>>({});
  const [recOpen, setRecOpen] = useState(false);
  const [recId, setRecId] = useState<string | undefined>(undefined);
  const [recLabel, setRecLabel] = useState<string | undefined>(undefined);
  const [recTitle, setRecTitle] = useState("");
  const [recData, setRecData] = useState<any>(null);
  const [histOpen, setHistOpen] = useState(false);
  const [histTitle, setHistTitle] = useState("");
  const [histEntries, setHistEntries] = useState<MaterialEvent[]>([]);
  

  // SortingState derivado de sort/order da URL
  const sorting: SortingState = useMemo(
    () => (filters.sort ? [{ id: filters.sort, desc: filters.order === "desc" }] : []),
    [filters.sort, filters.order]
  );

  // Params para API (adapter fará PT-BR)
  const params: ListMaterialsParams = useMemo(
    () => ({
      q: debouncedQ || undefined,
      page: filters.page,
      perPage: filters.perPage,
      active: filters.active === "all" ? undefined : filters.active,
      sort: toSortField(filters.sort), // keyof Material | undefined
      order: filters.sort ? filters.order : undefined,
    }),
    [debouncedQ, filters.page, filters.perPage, filters.active, filters.sort, filters.order]
  );

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["materials", params],
    queryFn: () => listMaterials(params),
    placeholderData: keepPreviousData,
  });

  // Métricas (cards). Respeitam a busca 'q', mas não o filtro 'active' para o total geral
  const counts = useQueries({
    queries: [
      {
        queryKey: ["materials", "metrics", "total", { q: debouncedQ }],
        queryFn: async () => (await listMaterials({ q: debouncedQ || undefined, page: 1, perPage: 1 })).total,
        staleTime: 60_000,
      },
      {
        queryKey: ["materials", "metrics", "active-true", { q: debouncedQ }],
        queryFn: async () => (await listMaterials({ q: debouncedQ || undefined, active: "true", page: 1, perPage: 1 })).total,
        staleTime: 60_000,
      },
      {
        queryKey: ["materials", "metrics", "active-false", { q: debouncedQ }],
        queryFn: async () => (await listMaterials({ q: debouncedQ || undefined, active: "false", page: 1, perPage: 1 })).total,
        staleTime: 60_000,
      },
    ],
  });
  const loadingCounts = counts.some((q) => q.isLoading);
  const totalAll = counts[0].data ?? 0;
  const totalActive = counts[1].data ?? 0;
  const totalInactive = counts[2].data ?? 0;

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Material | null>(null);

  const createMut = useMutation({
    mutationFn: (values: MaterialFormValues) => createMaterial(values),
    onSuccess: () => {
      toast({ title: "Material criado" });
      qc.invalidateQueries({ queryKey: ["materials"] });
      setOpen(false);
    },
    onError: (e: any) => toast({ title: "Erro ao criar", description: e?.response?.data?.message || "—", variant: "destructive" }),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, values }: { id: string; values: MaterialFormValues }) => updateMaterial(id, values),
    onSuccess: () => {
      toast({ title: "Material atualizado" });
      qc.invalidateQueries({ queryKey: ["materials"] });
      setOpen(false);
      setEditing(null);
    },
    onError: (e: any) => toast({ title: "Erro ao atualizar 3", description: e?.response?.data?.message || "—", variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteMaterial(id),
    onSuccess: () => {
      toast({ title: "Material removido" });
      qc.invalidateQueries({ queryKey: ["materials"] });
    },
    onError: (e: any) => toast({ title: "Erro ao remover", description: e?.response?.data?.message || "—", variant: "destructive" }),
  });

  // Seleção e bulk actions
  const items = data?.data ?? [];
  const selectedIds = Object.keys(rowSelection)
    .filter((k) => (rowSelection as any)[k])
    .map((k) => items[Number(k)]?.id)
    .filter(Boolean) as string[];

  const bulkActivate = useMutation({
    mutationFn: async (ids: string[]) => {
      const results = await Promise.allSettled(ids.map((id) => updateMaterial(id, { active: true })));
      const rejected = results.filter((r) => r.status === "rejected").length;
      if (rejected) throw new Error(`${rejected} falharam`);
    },
    onSuccess: () => {
      toast({ title: "Materiais ativados" });
      setRowSelection({});
      qc.invalidateQueries({ queryKey: ["materials"] });
    },
    onError: (e: any) => toast({ title: "Falha na ativação", description: String(e?.message ?? e), variant: "destructive" }),
  });

  const bulkDeactivate = useMutation({
    mutationFn: async (ids: string[]) => {
      const results = await Promise.allSettled(ids.map((id) => updateMaterial(id, { active: false })));
      const rejected = results.filter((r) => r.status === "rejected").length;
      if (rejected) throw new Error(`${rejected} falharam`);
    },
    onSuccess: () => {
      toast({ title: "Materiais inativados" });
      setRowSelection({});
      qc.invalidateQueries({ queryKey: ["materials"] });
    },
    onError: (e: any) => toast({ title: "Falha na inativação", description: String(e?.message ?? e), variant: "destructive" }),
  });

  const bulkDelete = useMutation({
    mutationFn: async (ids: string[]) => {
      const results = await Promise.allSettled(ids.map((id) => deleteMaterial(id)));
      const rejected = results.filter((r) => r.status === "rejected").length;
      if (rejected) throw new Error(`${rejected} falharam`);
    },
    onSuccess: () => {
      toast({ title: "Materiais removidos" });
      setRowSelection({});
      qc.invalidateQueries({ queryKey: ["materials"] });
    },
    onError: (e: any) => toast({ title: "Falha ao remover", description: String(e?.message ?? e), variant: "destructive" }),
  });

  function openCreate() {
    setEditing(null);
    setOpen(true);
  }
  function openEdit(row: Material) {
    setEditing(row);
    setOpen(true);
  }
  async function handleReconcile(m: Material) {
    try {
      const data = await reconcileMaterial(m.id);
      setRecData(data);
      setRecTitle(`Reconciliar — ${m.name} (${m.code ?? "—"})`);
      setRecOpen(true);
    } catch (e:any) {
      toast({ title: "Falha ao reconciliar", description: e?.message || "Erro", variant: "destructive" });
    }
  }

  async function onSubmit(values: MaterialFormValues) {
    if (editing) await updateMut.mutateAsync({ id: editing.id, values });
    else await createMut.mutateAsync(values);
  }

  async function onShowHistory(m: Material) {
    try {
      const res = await getMaterialHistory(m.id);

      // novos endpoints retornam "events"; mantemos fallback para "timeline" por compat
      const events: MaterialEvent[] = (res as any).events ?? (res as any).timeline ?? [];

      setHistEntries(events);
      // usa os dados do próprio material recebido via lista
      setHistTitle(`Histórico — ${m.name} (${m.code ?? "—"})`);
      setHistOpen(true);
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
  // 🔧 helpers (coloque perto dos handlers)
  function normalizeSource(s: any): "fabric" | "db" {
    return String(s).toUpperCase() === "LEDGER" ? "fabric" : "db";
  }
  function pickEvents(payload: any) {
    return (payload?.events ?? payload?.timeline ?? []) as any[];
  }
  async function handleShowHistory(m: Material) {
    // abre já com um título provisório
    setHistTitle(`Histórico — ${m.name ?? "Material"} (${m.code ?? "—"})`);
    setHistEntries([]);
    setHistOpen(true);

    try {
      const res = await getMaterialHistory(m.id);

      // título: usa o que veio do back se existir, senão mantém o do material
      const mat = (res as any).material;
      setHistTitle(
        `Histórico — ${mat?.name ?? m.name ?? "Material"} (${mat?.code ?? m.code ?? "—"})`
      );

      // eventos + conversão de source
      const evts = pickEvents(res).map((e) => ({
        ...e,
        source: normalizeSource(e.source),
      }));
      setHistEntries(evts);
    } catch (e: any) {
      setHistOpen(false);
      toast({
        title: "Falha ao carregar histórico",
        description: e?.response?.data?.error || e?.message || "Erro",
        variant: "destructive",
      });
    }
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
  async function handleScanHistory(code: string) {
    try {
      const resolved = await resolveByCode(code);

      if (resolved.type === "material") {
        const h = await getMaterialHistory(resolved.id);

        const mat = (h as any).material;
        setHistTitle(
          `Histórico — ${mat?.name ?? resolved.label ?? "Material"} (${mat?.code ?? resolved.code ?? "—"})`
        );

        const evts = pickEvents(h).map((e) => ({
          ...e,
          source: normalizeSource(e.source),
        }));
        setHistEntries(evts);
        setHistOpen(true);
        return;
      }

      // else: tratar como LOTE/loteId
      const h = await getBatchHistory(resolved.id);
      const lote = (h as any).lote;
      setHistTitle(
        `Histórico do lote — ${lote?.name ?? resolved.label ?? "Lote"} (${lote?.code ?? resolved.code ?? "—"})`
      );

      const evts = pickEvents(h).map((e) => ({
        ...e,
        source: normalizeSource(e.source),
      }));
      setHistEntries(evts);
      setHistOpen(true);
    } catch (e: any) {
      toast({
        title: "Não encontrado",
        description: e?.response?.data?.error || e?.message || "Falha ao resolver código",
        variant: "destructive",
      });
    }
  }

  async function handleExportCSV() {
    try {
      const BATCH = 500;
      let pageExp = 1;
      const acc: Material[] = [];

      // pagina tudo respeitando os filtros atuais
      while (true) {
        const res = await listMaterials({ ...params, page: pageExp, perPage: BATCH });
        acc.push(...res.data);
        if (acc.length >= (res.total ?? acc.length) || res.data.length === 0) break;
        pageExp++;
      }

      // helpers de data (Fortaleza)
      const fmtDate = (s?: string) => {
        if (!s) return "";
        const d = new Date(s);
        if (Number.isNaN(d.getTime())) return "";
        return new Intl.DateTimeFormat("pt-BR", {
          timeZone: "America/Fortaleza",
          year: "numeric", month: "2-digit", day: "2-digit",
        }).format(d);
      };
      const fmtDateTime = (s?: string) => {
        if (!s) return "";
        const d = new Date(s);
        if (Number.isNaN(d.getTime())) return "";
        return new Intl.DateTimeFormat("pt-BR", {
          timeZone: "America/Fortaleza",
          year: "numeric", month: "2-digit", day: "2-digit",
          hour: "2-digit", minute: "2-digit",
          hour12: false,
        }).format(d);
      };

      // estende o tipo com colunas calculadas (status e datas formatadas)
      type Row = Material & {
        status: string;
        expiry_br: string;
        createdAt_br: string;
        updatedAt_br: string;
      };

      const rows: Row[] = acc.map((m) => ({
        ...m,
        status: m.active ? "Ativo" : "Inativo",
        expiry_br: fmtDate(m.expiry),
        createdAt_br: fmtDateTime(m.createdAt),
        updatedAt_br: fmtDateTime(m.updatedAt),
      }));

      // cabeçalho rico (mantém colunas úteis para reimportar + humanas)
      const headers: CsvHeader<Row>[] = [
        { key: "name", label: "Nome" },
        { key: "code", label: "Código" },
        { key: "category", label: "Categoria" },
        { key: "type", label: "Tipo" },
        { key: "description", label: "Descrição" },
        { key: "reprocessCount", label: "reprocess_count" },
        // técnico + humano
        { key: "active", label: "Ativo (bool)" },
        { key: "status", label: "Status (legível)" },

        // datas: ISO + formatadas BR
        { key: "expiry", label: "Validade (ISO)" },
        { key: "expiry_br", label: "Validade (BR)" },
        { key: "createdAt", label: "Criado em (ISO)" },
        { key: "createdAt_br", label: "Criado em (BR)" },
        { key: "updatedAt", label: "Atualizado em (ISO)" },
        { key: "updatedAt_br", label: "Atualizado em (BR)" },
      ];

      const csv = toCSV(rows, headers);
      const date = new Date().toISOString().slice(0, 10);
      downloadCSV(`materials_${date}.csv`, csv);
    } catch (e: any) {
      toast({
        title: "Falha ao exportar",
        description: e?.message || "Erro desconhecido",
        variant: "destructive",
      });
    }
  }

  const columns = useMemo(
    () =>
      getMaterialColumns({
        onEdit: openEdit,
        onDelete: (row) => { if (confirm("Remover este material?")) deleteMut.mutate(row.id); },
        onShowHistory: handleShowHistory, // << aqui
        onReconcile: handleReconcile, // << novo
      }),
    [deleteMut]
  );

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / filters.perPage));

  const handleSortingChange: OnChangeFn<SortingState> = (updater) => {
    const next = typeof updater === "function" ? updater(sorting) : updater;
    const first = next[0];
    const sortId = first?.id as string | undefined;
    setFilters({
      sort: toSortField(sortId),
      order: first ? (first.desc ? "desc" : "asc") : undefined,
      page: 1,
    });
  };

  const tableColumns = [" ", "Nome", "Código", "Status", "Ações"];



  return (
    <section className="space-y-4">
      {/* Header + filtros */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Materiais</h2>
          <p className="text-sm opacity-80">Cadastro e consulta de materiais do CME.</p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <Input
            placeholder="Buscar por nome ou código"
            value={filters.q}
            onChange={(e) => setFilters({ q: e.target.value, page: 1 })}
            className="w-56"
          />
          <select
            className="rounded-md border bg-background px-2 py-2 text-sm"
            value={filters.active}
            onChange={(e) => setFilters({ active: e.target.value as any, page: 1 })}
          >
            <option value="all">Todos</option>
            <option value="true">Ativos</option>
            <option value="false">Inativos</option>
          </select>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleExportCSV}>Exportar CSV</Button>
            <Button variant="outline" onClick={() => setImportOpen(true)}>Importar CSV</Button>
            <Button variant="outline" onClick={() => setScanOpen(true)}>Escanear histórico</Button>
            <Button onClick={openCreate}>Novo material</Button>
          </div>
        </div>
      </header>

      {/* Métricas */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Total de materiais</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{loadingCounts ? "…" : totalAll}</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Ativos</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{loadingCounts ? "…" : totalActive}</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Inativos</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{loadingCounts ? "…" : totalInactive}</p></CardContent>
        </Card>
      </div>

      {/* DataTable + Skeleton */}
      <Card>
        <CardHeader><CardTitle>Lista de materiais</CardTitle></CardHeader>
        <CardContent>
          {isError && (<div className="text-red-500 text-sm">Erro ao carregar: {(error as any)?.message ?? "—"}</div>)}

          {isLoading && !data ? (
            <TableSkeleton columns={tableColumns} rows={filters.perPage} />
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
              {total > 0 ? (<>Página {filters.page} de {totalPages} · {total} itens</>) : (<>Sem resultados</>)}
            </div>
            <div className="flex items-center gap-2">
              <select
                className="rounded-md border bg-background px-2 py-1 text-sm"
                value={filters.perPage}
                onChange={(e) => setFilters({ perPage: Number(e.target.value), page: 1 })}
              >
                {[5, 10, 20, 50].map((n) => (<option key={n} value={n}>{n}/página</option>))}
              </select>
              <Button
                variant="outline" size="sm"
                disabled={filters.page <= 1}
                onClick={() => setFilters({ page: Math.max(1, filters.page - 1) })}
              >
                Anterior
              </Button>
              <Button
                variant="outline" size="sm"
                disabled={filters.page >= totalPages}
                onClick={() => setFilters({ page: Math.min(totalPages, filters.page + 1) })}
              >
                Próxima
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Dialog Criar/Editar */}
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
        <DialogContent className="sm:max-w-[720px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar material" : "Novo material"}</DialogTitle>
        </DialogHeader>
        <MaterialForm defaultValues={editing ?? undefined} submitting={createMut.isPending || updateMut.isPending} onSubmit={onSubmit} />
      </DialogContent>
      </Dialog>
      {/* Import CSV */}
      <ImportCSVDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={() => qc.invalidateQueries({ queryKey: ["materials"] })}
      />
      <ScanCodeDialog
        open={scanOpen}
        onOpenChange={setScanOpen}
        onResult={handleScanHistory}
      />
      {/* Histórico e Reconciliar */}
      <HistoryDialog
        open={histOpen}
        onOpenChange={setHistOpen}
        title={histTitle}
        entries={toDialogEntries(histEntries)}  // ✅ convertido para "fabric" | "db"
        showMaterial
        materialLabelById={(id) => materialsMap[id]}
      />
      <MaterialReconcileDialog
        open={recOpen}
        onOpenChange={setRecOpen}
        materialId={recId}
        materialLabel={recLabel}
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
