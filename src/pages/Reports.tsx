import { useMemo, useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { listCycles } from "@/api/cycles";
import type { Cycle, ListCyclesParams } from "@/types/cycle";
import { toCSV, downloadCSV } from "@/utils/csv";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

/* -------------------------------------------------------------------------------------------------
 * Relatórios (PDF/CSV) — Ciclos com filtros por data/etapa/material/lote
 * ------------------------------------------------------------------------------------------------- */

const STAGES = ["RECEBIMENTO", "LAVAGEM", "DESINFECCAO", "ESTERILIZACAO", "ARMAZENAMENTO"] as const;

function fmtBR(s?: string | null) {
  if (!s) return "";
  const d = new Date(s);
  return Number.isNaN(d.getTime())
    ? String(s)
    : new Intl.DateTimeFormat("pt-BR", {
        timeZone: "America/Fortaleza",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(d);
}

export default function Reports() {
  // ----------------------- filtros de relatório -----------------------
  const [dateFrom, setDateFrom] = useState<string>(""); // YYYY-MM-DD
  const [dateTo, setDateTo] = useState<string>(""); // YYYY-MM-DD
  const [stage, setStage] = useState<"ALL" | (typeof STAGES)[number]>("ALL");
  const [q, setQ] = useState(""); // busca por material/lote/código
  const [perPage, setPerPage] = useState(25);
  const [page, setPage] = useState(1);

  // --------------------------- consulta (preview) ---------------------------
  const params: ListCyclesParams = useMemo(() => {
    const p: any = { page, perPage };
    if (q.trim()) p.q = q.trim();
    if (stage !== "ALL") p.etapa = stage;
    if (dateFrom) p.startDate = new Date(dateFrom).toISOString();
    if (dateTo) {
      // incluir o dia "to" inteiro — soma 23:59:59
      const d = new Date(dateTo);
      d.setHours(23, 59, 59, 999);
      p.endDate = d.toISOString();
    }
    return p as ListCyclesParams;
  }, [page, perPage, q, stage, dateFrom, dateTo]);

  const { data, isLoading, isFetching, isError, error } = useQuery({
    queryKey: ["reports-cycles", params],
    queryFn: () => listCycles(params as any),
    placeholderData: keepPreviousData,
    staleTime: 20_000,
  });

  const rows = (data?.data ?? []) as (Cycle & {
    materialName?: string | null;
    materialCode?: string | null;
    loteNumero?: string | null;
  })[];
  const total = Number(data?.total ?? rows.length);
  const totalPages = Math.max(1, Math.ceil(total / perPage));

  // --------------------------- resumo rápido ---------------------------
  const byStage = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const r of rows) acc[r.etapa] = (acc[r.etapa] ?? 0) + 1;
    return acc;
  }, [rows]);

  // --------------------------- exportações ---------------------------
  async function exportCSV() {
    // varre todas as páginas respeitando os filtros atuais
    const BATCH = 500;
    let pageExp = 1;
    const acc: any[] = [];
    while (true) {
      const res = await listCycles({ ...(params as any), page: pageExp, perPage: BATCH });
      acc.push(...(res.data ?? []));
      if ((res.data ?? []).length < BATCH) break;
      if (acc.length >= Number(res.total ?? acc.length)) break;
      pageExp++;
    }

    type Row = Cycle & {
      materialName?: string | null;
      materialCode?: string | null;
      loteNumero?: string | null;
      timestamp_iso?: string;
      timestamp_br?: string;
    };

    const out: Row[] = (acc as any[]).map((c: any) => ({
      ...c,
      timestamp_iso: c.timestamp ? new Date(c.timestamp).toISOString() : "",
      timestamp_br: fmtBR(c.timestamp),
    }));

    const csv = toCSV(out, [
      { key: "id", label: "cycle_id" },
      { key: "etapa", label: "etapa" },
      { key: "responsavel", label: "responsavel" },
      { key: "materialName", label: "material_nome" },
      { key: "materialCode", label: "material_codigo" },
      { key: "loteNumero", label: "lote_numero" },
      { key: "timestamp_iso", label: "timestamp_iso" },
      { key: "timestamp_br", label: "timestamp_br" },
    ]);

    const range = [dateFrom || "(início)", dateTo || "(agora)"];
    downloadCSV(`relatorio_ciclos_${range.join("_a_")}.csv`, csv);
  }

  async function exportPDF() {
    // coleta tudo igual ao CSV
    const BATCH = 500;
    let pageExp = 1;
    const acc: any[] = [];
    while (true) {
      const res = await listCycles({ ...(params as any), page: pageExp, perPage: BATCH });
      acc.push(...(res.data ?? []));
      if ((res.data ?? []).length < BATCH) break;
      if (acc.length >= Number(res.total ?? acc.length)) break;
      pageExp++;
    }

    const doc = new jsPDF({ unit: "pt", format: "a4" });

    // Cores do sistema (aproximações): primary = teal, secondary = slate
    const PRIMARY = [14, 165, 233]; // #0ea5e9 (azul-ciano)
    const SECONDARY = [15, 118, 110]; // #0f766e (teal escuro)

    // Cabeçalho
    doc.setFillColor(PRIMARY[0], PRIMARY[1], PRIMARY[2]);
    doc.rect(0, 0, doc.internal.pageSize.getWidth(), 64, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.text("Relatório de Ciclos", 36, 40);

    // Subtítulo com filtros
    doc.setTextColor(55, 65, 81); // slate-700
    doc.setFontSize(10);
    const sub1 = `Período: ${dateFrom || "(início)"} → ${dateTo || "(agora)"}`;
    const sub2 = `Etapa: ${stage === "ALL" ? "Todas" : stage} · Busca: ${q || "(vazio)"}`;
    doc.text(sub1, 36, 80);
    doc.text(sub2, 36, 96);

    // Tabela
    const body = (acc as any[]).map((c: any) => [
      c.id,
      c.etapa,
      c.responsavel || "—",
      c.materialName || "—",
      c.materialCode || "—",
      c.loteNumero || "—",
      fmtBR(c.timestamp),
    ]);

    autoTable(doc, {
      head: [["Cycle ID", "Etapa", "Responsável", "Material", "Código", "Lote", "Data/Hora"]],
      body,
      startY: 112,
      styles: { fontSize: 9, cellPadding: 5 },
      headStyles: { fillColor: PRIMARY as any, textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [245, 248, 250] },
      columnStyles: {
        0: { cellWidth: 150 }, // Cycle ID — largo para não cortar
        1: { cellWidth: 90 },
        2: { cellWidth: 120 },
        3: { cellWidth: 140 },
        4: { cellWidth: 100 },
        5: { cellWidth: 90 },
        6: { cellWidth: 110 },
      },
      didDrawPage: (d) => {
        // footer com numeração
        const pageSize = doc.internal.pageSize;
        const pageWidth = pageSize.getWidth();
        const pageHeight = pageSize.getHeight();
        const pageNumber = doc.getNumberOfPages();
        doc.setFontSize(9);
        doc.setTextColor(100);
        doc.text(`Página ${pageNumber}`, pageWidth - 72, pageHeight - 24, { align: "right" });
      },
      margin: { left: 36, right: 36 },
      pageBreak: "auto",
    });

    const file = `relatorio_ciclos_${dateFrom || "inicio"}_a_${dateTo || "agora"}.pdf`;
    doc.save(file);
  }

  // --------------------------- UI ---------------------------
  return (
    <section className="space-y-4">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Relatórios</h2>
          <p className="text-sm opacity-80">Geração de PDF/CSV com filtros por data, etapa, material e lote.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCSV} disabled={isFetching}>Gerar CSV</Button>
          <Button onClick={exportPDF} disabled={isFetching}>Gerar PDF</Button>
        </div>
      </header>

      {/* Filtros */}
      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3 lg:grid-cols-4">
          <div>
            <label className="text-xs block mb-1">De</label>
            <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} />
          </div>
          <div>
            <label className="text-xs block mb-1">Até</label>
            <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} />
          </div>
          <div>
            <label className="text-xs block mb-1">Etapa</label>
            <select
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={stage}
              onChange={(e) => { setStage(e.target.value as any); setPage(1); }}
            >
              <option value="ALL">Todas</option>
              {STAGES.map((s) => (<option key={s} value={s}>{s}</option>))}
            </select>
          </div>
          <div>
            <label className="text-xs block mb-1">Buscar (material, lote, código…)</label>
            <Input placeholder="Ex.: Pinça, MAT-123, lote 42" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
          </div>
          <div>
            <label className="text-xs block mb-1">Itens por página</label>
            <select
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={perPage}
              onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }}
            >
              {[10, 25, 50, 100].map((n) => (<option key={n} value={n}>{n}/página</option>))}
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Resumo */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Resumo</CardTitle>
          <div className="text-sm text-muted-foreground">
            {isLoading ? "Carregando…" : `Página ${page} de ${totalPages} · ${total} itens`}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {isError && (
            <div className="text-red-500 text-sm">Erro ao carregar: {(error as any)?.message ?? "—"}</div>
          )}

          <div className="flex flex-wrap gap-2">
            {STAGES.map((s) => (
              <Badge key={s} variant="secondary" className="text-xs">
                {s}: <span className="font-semibold ml-1">{byStage[s] ?? 0}</span>
              </Badge>
            ))}
          </div>

          <Separator />

          {/* Prévia (tabela simples) */}
          <div className="rounded-md border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-3 py-2">Cycle ID</th>
                  <th className="text-left px-3 py-2">Etapa</th>
                  <th className="text-left px-3 py-2">Responsável</th>
                  <th className="text-left px-3 py-2">Material</th>
                  <th className="text-left px-3 py-2">Código</th>
                  <th className="text-left px-3 py-2">Lote</th>
                  <th className="text-left px-3 py-2">Data/Hora</th>
                </tr>
              </thead>
              <tbody>
                {(rows.length === 0 && !isLoading) ? (
                  <tr><td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">Nenhum resultado</td></tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="px-3 py-2 font-mono text-xs">{r.id}</td>
                      <td className="px-3 py-2">{r.etapa}</td>
                      <td className="px-3 py-2">{(r as any).responsavel || "—"}</td>
                      <td className="px-3 py-2">{(r as any).materialName || "—"}</td>
                      <td className="px-3 py-2 font-mono text-xs">{(r as any).materialCode || "—"}</td>
                      <td className="px-3 py-2">{(r as any).loteNumero || "—"}</td>
                      <td className="px-3 py-2">{fmtBR((r as any).timestamp)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* paginação */}
          <div className="flex items-center justify-between mt-3">
            <div className="text-xs text-muted-foreground">
              {isLoading ? "Carregando…" : `${rows.length} mostrados`}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Anterior</Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Próxima</Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
