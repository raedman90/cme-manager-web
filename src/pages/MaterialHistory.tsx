// src/pages/MaterialHistory.tsx
import { useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { getMaterialHistory } from "@/api/history";
import type { MaterialHistoryEvent } from "@/types/history";
import MaterialTimeline from "@/components/materials/MaterialTimeline";
import { Button } from "@/components/ui/button";
import { toCSV, downloadCSV, type CsvHeader } from "@/utils/csv";

// Paleta simples (ajuste se quiser aderir 100% ao seu tema)
const BRAND = { r: 6, g: 95, b: 70 };            // verde-primário
const BRAND_SOFT = { r: 234, g: 250, b: 245 };   // fundo suave
const TEXT_ON_BRAND = { r: 255, g: 255, b: 255 };

const STAGE_BG: Record<string, [number, number, number]> = {
  RECEBIMENTO:   [219, 234, 254], // azul claro
  LAVAGEM:       [224, 242, 254], // ciano claro
  DESINFECCAO:   [254, 240, 199], // âmbar claro
  ESTERILIZACAO: [254, 226, 226], // vermelho claro
  ARMAZENAMENTO: [209, 250, 229], // esmeralda claro
};

function toRGB(obj: { r: number; g: number; b: number }): [number, number, number] {
  return [obj.r, obj.g, obj.b];
}

function fmtBR(iso: string) {
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Fortaleza",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(d);
  } catch {
    return iso;
  }
}

export default function MaterialHistory() {
  // ✅ Hooks SEMPRE no topo, sem early return antes deles
  const { id } = useParams<{ id: string }>();
  const materialId = id ?? "";
  const enabled = materialId.length > 0;

  const { data, isLoading, isError, refetch, isFetching, error } = useQuery({
    queryKey: ["materialHistory", materialId],
    queryFn: () => getMaterialHistory(materialId),
    enabled, // não quebra a ordem de hooks; só evita o fetch
    placeholderData: keepPreviousData,
    staleTime: 10_000,
  });

  // Normaliza e ordena eventos com tipagem explícita
  const events = useMemo<MaterialHistoryEvent[]>(() => {
    const raw: MaterialHistoryEvent[] = Array.isArray((data as any)?.events)
      ? ((data as any).events as MaterialHistoryEvent[])
      : [];
    return raw.slice().sort(
      (a: MaterialHistoryEvent, b: MaterialHistoryEvent) =>
        a.timestamp.localeCompare(b.timestamp)
    );
  }, [data]);

  // Label do material
  const mat = (data as any)?.material;
  const effectiveMaterialId = (data as any)?.materialId ?? materialId;
  const materialLabel =
    (mat?.name || mat?.code)
      ? `${mat?.name ?? ""}${mat?.code ? ` (${mat.code})` : ""}`.trim()
      : effectiveMaterialId;

  const codeOrId = (mat?.code ?? effectiveMaterialId ?? "material").replace(/[^\w\-]+/g, "_");

  // ✅ As decisões de render vêm DEPOIS dos hooks
  if (!enabled) {
    return <div className="p-4 text-sm text-muted-foreground">ID do material ausente.</div>;
  }

  if (isLoading && !data) {
    return <div className="p-4">Carregando histórico…</div>;
  }

  if (isError) {
    return (
      <div className="p-4 space-y-2">
        <div>Erro ao carregar histórico.</div>
        <pre className="text-xs text-muted-foreground bg-muted/40 p-2 rounded">
          {(error as any)?.message ?? ""}
        </pre>
        <Button asChild variant="secondary"><Link to="/materials/history">Voltar</Link></Button>
      </div>
    );
  }

  // ===== Export CSV
  type Row = {
    data_hora: string;
    timestamp_iso: string;
    etapa: string;
    fonte: string;
    responsavel: string;
    txId: string;
    cycleId: string;
    lote: string;
  };
  const csvHeaders: CsvHeader<Row>[] = [
    { key: "data_hora", label: "data_hora" },
    { key: "timestamp_iso", label: "timestamp_iso" },
    { key: "etapa", label: "etapa" },
    { key: "fonte", label: "fonte" },
    { key: "responsavel", label: "responsavel" },
    { key: "txId", label: "txId" },
    { key: "cycleId", label: "cycleId" },
    { key: "lote", label: "lote" },
  ];

  function handleExportCSV() {
    const rows: Row[] = events.map((e) => ({
      data_hora: fmtBR(e.timestamp),
      timestamp_iso: new Date(e.timestamp).toISOString(),
      etapa: e.stage,
      fonte: e.source,
      responsavel: e.operator ?? "",
      txId: e.txId ?? "",
      cycleId: e.cycleId ?? "",
      lote: e.batchId ?? "",
    }));
    const csv = toCSV(rows, csvHeaders);
    const date = new Date().toISOString().slice(0, 10);
    downloadCSV(`historico_material_${codeOrId}_${date}.csv`, csv);
  }

  // ===== Export PDF (jsPDF + autoTable)
  async function handleExportPDF() {
  try {
    const { jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;

    // A4 landscape dá mais espaço pros IDs longos
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 32;

    // Cabeçalho colorido
    doc.setFillColor(...toRGB(BRAND));
    doc.rect(0, 0, pageWidth, 80, "F"); // faixa no topo
    doc.setTextColor(...toRGB(TEXT_ON_BRAND));
    doc.setFontSize(16);
    doc.text("Histórico do Material", margin, 34);
    doc.setFontSize(10);

    const mat = (data as any)?.material;
    const materialLabel =
      (mat?.name || mat?.code)
        ? `${mat?.name ?? ""}${mat?.code ? ` (${mat.code})` : ""}`.trim()
        : ((data as any)?.materialId ?? "—");

    doc.text(`Material: ${materialLabel}`, margin, 54);
    doc.text(`Eventos: ${events.length}`, margin, 70);

    // Fundo suave para separar header da tabela
    doc.setFillColor(...toRGB(BRAND_SOFT));
    doc.rect(0, 80, pageWidth, 18, "F");

    // Cabeçalho da tabela
    const head = [["Data/Hora", "Etapa", "Fonte", "Responsável", "txId", "cycleId", "Lote"]];

    // Linhas
    const body = events.map((e) => [
      fmtBR(e.timestamp),
      e.stage,
      e.source,
      e.operator ?? "—",
      e.txId ?? "—",
      e.cycleId ?? "—",
      e.batchId ?? "—",
    ]);

    autoTable(doc, {
      startY: 100,
      head,
      body,
      theme: "striped",
      styles: {
        fontSize: 9,
        cellPadding: 5,
        overflow: "linebreak",   // 👈 permite quebrar linha (não corta)
        cellWidth: "wrap",       // 👈 ajusta largura com quebra
        valign: "middle",
      },
      headStyles: {
        fillColor: toRGB(BRAND),
        textColor: toRGB(TEXT_ON_BRAND),
        fontStyle: "bold",
      },
      alternateRowStyles: { fillColor: [248, 250, 252] }, // cinza bem suave
      tableWidth: "auto",
      margin: { left: margin, right: margin },

      // Larguras pensadas para caber no A4 paisagem (área útil ~ 842-64 = 778pt)
      columnStyles: {
        0: { cellWidth: 120 }, // Data/Hora
        1: { cellWidth: 100 }, // Etapa
        2: { cellWidth: 70 },  // Fonte
        3: { cellWidth: 150 }, // Responsável
        4: { cellWidth: 160 }, // txId
        5: { cellWidth: 160 }, // cycleId (↑ mais espaço)
        6: { cellWidth: 80 },  // Lote
      },

      // Cores por etapa e rodapé de página
      didParseCell: (hookData) => {
        // pinta a célula da coluna "Etapa" conforme a etapa
        if (hookData.section === "body" && hookData.column.index === 1) {
          const etapa = String(hookData.cell.raw || "");
          const bg = STAGE_BG[etapa];
          if (bg) {
            hookData.cell.styles.fillColor = bg;
          }
        }
      },
      didDrawPage: (hookData) => {
        // Rodapé com número da página
        const str = `Página ${doc.getCurrentPageInfo().pageNumber}`;
        doc.setFontSize(9);
        doc.setTextColor(120);
        doc.text(str, pageWidth - margin, doc.internal.pageSize.getHeight() - 14, { align: "right" });
      },
    });

    // Nome do arquivo
    const matCode = (mat?.code ?? (data as any)?.materialId ?? "material").replace(/[^\w\-]+/g, "_");
    doc.save(`historico_material_${matCode}.pdf`);
  } catch (e) {
    // fallback simples: imprime a página (o usuário pode salvar como PDF)
    window.print();
  }
}

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">Histórico do Material</h1>
          <div className="text-sm text-muted-foreground">
            Material: <code className="bg-muted/60 px-1 rounded">{materialLabel}</code>
            <span className="mx-2">•</span>
            Eventos: <strong>{events.length}</strong>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? "Atualizando…" : "Atualizar"}
          </Button>
          <Button variant="outline" onClick={handleExportCSV} disabled={events.length === 0}>
            Exportar CSV
          </Button>
          <Button onClick={handleExportPDF} disabled={events.length === 0}>
            Exportar PDF
          </Button>
          <Button asChild variant="secondary"><Link to="/materials/history">Voltar</Link></Button>
        </div>
      </div>

      <MaterialTimeline events={events} />
    </div>
  );
}
