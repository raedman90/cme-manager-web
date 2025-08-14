import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Download, History, QrCode, Search, Shield, ShieldCheck, RefreshCw, Package2, Boxes, User, CalendarClock, ArrowUpRight } from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";

import { getMaterialHistory, getBatchHistory, resolveByCode} from "@/api/history";
import type { MaterialHistoryEvent, Source, Stage } from "@/types/history";
import ScanCodeDialog from "@/components/common/ScanCodeDialog";

/* =============================================================
   Rastreabilidade — busca por Material ou Lote
   - Resolve código/QR automaticamente (material x lote)
   - Mostra KPIs, timeline unificada (DB+Ledger) e gráfico por etapa
   - Exporta CSV
   - Atalhos para páginas de histórico detalhado
   ============================================================= */

// ---------- helpers ----------
function clsx(...xs: Array<string | false | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function fmtDate(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

const STAGE_LABEL: Record<Stage, string> = {
  RECEBIMENTO: "Recebimento",
  LAVAGEM: "Lavagem",
  DESINFECCAO: "Desinfecção",
  ESTERILIZACAO: "Esterilização",
  ARMAZENAMENTO: "Armazenamento",
};

const STAGE_TONE: Record<Stage, string> = {
  RECEBIMENTO: "bg-slate-100 text-slate-800 border-slate-300",
  LAVAGEM: "bg-sky-100 text-sky-800 border-sky-300",
  DESINFECCAO: "bg-amber-100 text-amber-900 border-amber-300",
  ESTERILIZACAO: "bg-emerald-100 text-emerald-900 border-emerald-300",
  ARMAZENAMENTO: "bg-zinc-100 text-zinc-800 border-zinc-300",
};

function downloadCSV(filename: string, events: MaterialHistoryEvent[]) {
  const header = [
    "data_hora",
    "etapa",
    "responsavel",
    "fonte",
    "txId",
    "cycleId",
    "loteId",
  ];
  const rows = events.map((e) => [
    new Date(e.timestamp).toISOString(),
    STAGE_LABEL[e.stage],
    e.operator ?? "",
    e.source,
    e.txId ?? "",
    e.cycleId ?? "",
    e.batchId ?? "",
  ]);
  const csv = [header, ...rows]
    .map((r) => r.map((c) => `"${String(c).replaceAll('"', '""')}"`).join(";"))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------- query wrappers ----------
function useTraceability(kind: "material" | "batch", id?: string) {
  return useQuery({
    queryKey: ["traceability", kind, id],
    enabled: !!id,
    queryFn: async () => {
      if (kind === "material") {
        const r = await getMaterialHistory(id!);
        return { type: "material" as const, id, label: r.materialId, events: r.events };
      } else {
        const r = await getBatchHistory(id!);
        return { type: "batch" as const, id, label: r.lote?.id ?? id, events: r.events };
      }
    },
  });
}

export default function TraceabilityPage() {
  const [tab, setTab] = useState<"material" | "batch">("material");
  const [code, setCode] = useState("");
  const [resolved, setResolved] = useState<{ type: "material" | "batch"; id: string; code?: string; label?: string } | null>(null);
  const [scanOpen, setScanOpen] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await resolve(code);
  }

  async function resolve(raw: string) {
    const text = raw.trim();
    if (!text) return;
    try {
      const r = await resolveByCode(text); // { type: 'material' | 'lote', id }
      const kind = r.type === "lote" ? "batch" : (r.type as "material" | "batch");
      setTab(kind);
      setResolved({ type: kind, id: r.id, code: r.code ?? text, label: r.label });
    } catch {
      // fallback: Assume que é um ID já conhecido
      setResolved({ type: tab, id: text, code: text });
    }
  }

  const { data, isLoading, isError, refetch, isFetching } = useTraceability(resolved?.type ?? tab, resolved?.id);
  const events: MaterialHistoryEvent[] = useMemo(() => (data?.events ?? []).slice().sort((a, b) => a.timestamp.localeCompare(b.timestamp)), [data]);

  // KPIs
  const verified = events.filter((e) => e.source === ("LEDGER" as Source)).length;
  const last = events[events.length - 1];
  const lastStageLabel = last ? STAGE_LABEL[last.stage] : "—";
  const byStage = useMemo(() => buildChart(events), [events]);

  return (
    <div className="min-h-screen w-full bg-white">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b bg-white/80 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 py-4">
          <div className="flex items-center gap-3">
            <History className="size-6" />
            <h1 className="text-xl font-semibold">Rastreabilidade</h1>
            <span className="ml-auto text-xs text-zinc-500">{resolved?.code || "—"}</span>
          </div>

          {/* Tabs */}
          <div className="mt-4 flex items-center gap-2">
            <button
              className={clsx(
                "rounded-full px-4 py-1.5 text-sm border",
                tab === "material"
                  ? "bg-emerald-600 text-white border-emerald-600"
                  : "bg-white text-zinc-700 hover:bg-zinc-50 border-zinc-300"
              )}
              onClick={() => setTab("material")}
            >
              Por Material
            </button>
            <button
              className={clsx(
                "rounded-full px-4 py-1.5 text-sm border",
                tab === "batch"
                  ? "bg-emerald-600 text-white border-emerald-600"
                  : "bg-white text-zinc-700 hover:bg-zinc-50 border-zinc-300"
              )}
              onClick={() => setTab("batch")}
            >
              Por Lote
            </button>
          </div>

          {/* Search */}
          <form onSubmit={submit} className="mt-4 flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[260px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-zinc-400" />
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder={tab === "material" ? "Código/ID do material (QR/Code128)" : "Código/ID do lote"}
                className="w-full rounded-xl border border-zinc-300 bg-white px-10 py-2 text-sm outline-none focus:border-emerald-500"
              />
            </div>
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
            >
              <History className="size-4" /> Buscar
            </button>
            <button
              type="button"
              onClick={() => setScanOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
            >
              <QrCode className="size-4" /> Escanear
            </button>
            <button
              type="button"
              onClick={() => refetch()}
              className="inline-flex items-center gap-2 rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
            >
              <RefreshCw className={clsx("size-4", isFetching && "animate-spin")} /> Atualizar
            </button>
          </form>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-7xl px-4 py-6 space-y-6">
        <HeaderSummary
          tab={tab}
          resolved={resolved}
          lastStageLabel={lastStageLabel}
          count={events.length}
          verified={verified}
        />

        {/* KPIs */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard title="Eventos" value={events.length} icon={<CalendarClock className="size-5" />} />
          <KpiCard title="Última etapa" value={lastStageLabel} icon={<History className="size-5" />} />
          <KpiCard title="Validados (Ledger)" value={`${verified}`} icon={<ShieldCheck className="size-5" />} />
          <KpiCard title="Banco (DB)" value={`${events.length - verified}`} icon={<Shield className="size-5" />} />
        </div>

        {/* Chart */}
        <div className="rounded-2xl border border-zinc-200 p-4">
          <div className="mb-3 flex items-center gap-2">
            <History className="size-4" />
            <h3 className="text-sm font-semibold">Distribuição por etapa</h3>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byStage}>
                <XAxis dataKey="label" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip />
                <Legend />
                <Bar dataKey="qtd" name="Eventos" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Timeline + Actions */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2 rounded-2xl border border-zinc-200 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History className="size-4" />
                <h3 className="text-sm font-semibold">Linha do tempo</h3>
              </div>
              <div className="flex items-center gap-2">
                {resolved?.type === "material" && (
                  <Link
                    to={`/materials/${encodeURIComponent(resolved.id)}/history`}
                    className="inline-flex items-center gap-1 rounded-xl border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-50"
                  >
                    Abrir detalhado <ArrowUpRight className="size-3" />
                  </Link>
                )}
                {resolved?.type === "batch" && (
                  <Link
                    to={`/lotes/${encodeURIComponent(resolved.id)}/history`}
                    className="inline-flex items-center gap-1 rounded-xl border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-50"
                  >
                    Abrir detalhado <ArrowUpRight className="size-3" />
                  </Link>
                )}
                <button
                  onClick={() => downloadCSV(`trace-${resolved?.type ?? tab}-${resolved?.id ?? "vazio"}.csv`, events)}
                  className="inline-flex items-center gap-2 rounded-xl border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-50"
                >
                  <Download className="size-4" /> Exportar CSV
                </button>
              </div>
            </div>

            {isLoading ? (
              <div className="py-12 text-center text-sm text-zinc-500">Carregando...</div>
            ) : isError ? (
              <div className="py-12 text-center text-sm text-red-600">Erro ao carregar histórico.</div>
            ) : events.length === 0 ? (
              <div className="py-12 text-center text-sm text-zinc-500">Sem eventos para exibir.</div>
            ) : (
              <ul className="relative ml-3 border-l border-zinc-200">
                {events
                  .slice()
                  .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                  .map((e, i) => (
                    <li key={`${e.timestamp}-${e.txId ?? i}`} className="relative pl-5 py-3">
                      <span className="absolute -left-1.5 top-3 size-3 rounded-full bg-emerald-600 ring-4 ring-white" />
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={clsx(
                            "rounded-full border px-2 py-0.5 text-xs font-medium",
                            STAGE_TONE[e.stage]
                          )}
                        >
                          {STAGE_LABEL[e.stage]}
                        </span>
                        <span className="text-xs text-zinc-500">{fmtDate(e.timestamp)}</span>
                        <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-700">
                          {e.source === ("LEDGER" as Source) ? (
                            <>
                              <ShieldCheck className="size-3" /> Ledger
                            </>
                          ) : (
                            <>
                              <Shield className="size-3" /> DB
                            </>
                          )}
                        </span>
                      </div>
                      <div className="mt-1 text-sm text-zinc-800">{e.cycleId ? `Ciclo: ${e.cycleId}` : "—"}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
                        <span className="inline-flex items-center gap-1"><User className="size-3" /> Responsável: {e.operator || "—"}</span>
                        {e.txId && (
                          <span className="inline-flex items-center gap-1"><ShieldCheck className="size-3" /> txId: {e.txId}</span>
                        )}
                        {e.batchId && (
                          <span className="inline-flex items-center gap-1">Lote: {e.batchId}</span>
                        )}
                      </div>
                    </li>
                  ))}
              </ul>
            )}
          </div>

          {/* Sidebar */}
          <aside className="rounded-2xl border border-zinc-200 p-4 space-y-3">
            <div className="flex items-center gap-2">
              {tab === "material" ? <Package2 className="size-4" /> : <Boxes className="size-4" />}
              <h3 className="text-sm font-semibold">Identificação</h3>
            </div>

            {resolved?.type === "material" && (
              <div className="rounded-xl border border-zinc-200 p-3">
                <div className="text-sm font-medium">Material</div>
                <div className="text-xs text-zinc-500">ID: {resolved.id}</div>
              </div>
            )}
            {resolved?.type === "batch" && (
              <div className="rounded-xl border border-zinc-200 p-3">
                <div className="text-sm font-medium">Lote</div>
                <div className="text-xs text-zinc-500">ID: {resolved.id}</div>
              </div>
            )}

            <div className="rounded-xl border border-zinc-200 p-3">
              <div className="flex items-center gap-2 text-xs text-zinc-600">
                <Shield className="size-4" />
                <span>
                  Eventos do <b>Ledger</b> aparecem com selo de verificação. Itens sem selo são do banco local.
                </span>
              </div>
            </div>

            <div className="rounded-xl border border-zinc-200 p-3 text-xs text-zinc-500">
              Dica: na criação do ciclo, escaneie o QR do crachá do responsável para preencher o campo <b>Responsável</b> automaticamente.
            </div>
          </aside>
        </div>
      </div>

      {/* Scanner Dialog (reutiliza o componente padrão do app) */}
      <ScanCodeDialog
        open={scanOpen}
        onOpenChange={setScanOpen}
        onResult={(value) => {
          setScanOpen(false);
          setCode(value);
          resolve(value);
        }}
      />
    </div>
  );
}

// ---------- chart data ----------
function buildChart(events: MaterialHistoryEvent[]) {
  const base: Record<Stage, number> = {
    RECEBIMENTO: 0,
    LAVAGEM: 0,
    DESINFECCAO: 0,
    ESTERILIZACAO: 0,
    ARMAZENAMENTO: 0,
  };
  for (const e of events) base[e.stage] = (base[e.stage] ?? 0) + 1;
  return (Object.keys(base) as Stage[]).map((k) => ({ label: STAGE_LABEL[k], qtd: base[k] }));
}

function KpiCard({ title, value, icon }: { title: string; value: React.ReactNode; icon: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-zinc-200 p-4">
      <div className="flex items-center gap-2 text-xs text-zinc-500">{icon}<span>{title}</span></div>
      <div className="mt-2 text-2xl font-semibold text-zinc-900">{value}</div>
    </div>
  );
}

function HeaderSummary({
  tab,
  resolved,
  lastStageLabel,
  count,
  verified,
}: {
  tab: "material" | "batch";
  resolved: { type: "material" | "batch"; id: string } | null;
  lastStageLabel: string;
  count: number;
  verified: number;
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          {tab === "material" ? <Package2 className="size-4" /> : <Boxes className="size-4" />}
          <h2 className="text-base font-semibold">
            {resolved ? (tab === "material" ? "Material" : "Lote") : "Informe um código para consultar"}
          </h2>
        </div>
        <div className="ml-auto text-xs text-zinc-500 flex items-center gap-3">
          <span>ID: <b>{resolved?.id ?? "—"}</b></span>
          <span>Eventos: <b>{count}</b></span>
          <span>Última etapa: <b>{lastStageLabel}</b></span>
          <span>Ledger: <b>{verified}</b></span>
        </div>
      </div>
    </div>
  );
}
