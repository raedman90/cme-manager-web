import { jsPDF } from "jspdf";

export type Entry = {
  source: "fabric" | "db";
  stage: string;
  timestamp: string;
  operator?: string | null;
  loteId?: string | null;
  materialId?: string | null;
};

export async function exportHistoryPdf(title: string, entries: Entry[]) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const M = 48;
  let y = M;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(title, M, y);
  y += 18;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);

  if (!entries.length) {
    doc.text("Sem eventos.", M, y);
    return doc.save("historico.pdf");
  }

  const fmt = (s: string) => {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? s : d.toLocaleString("pt-BR");
    };

  entries.forEach((e, i) => {
    if (y > 760) { doc.addPage(); y = M; }
    doc.text(`• ${e.stage} — ${fmt(e.timestamp)} [${e.source === "fabric" ? "Blockchain" : "Banco"}]`, M, y); y += 14;
    if (e.operator) { doc.text(`   Responsável: ${e.operator}`, M, y); y += 12; }
    if (e.loteId)   { doc.text(`   Lote: ${e.loteId}`, M, y); y += 12; }
    if (e.materialId){doc.text(`   Material: ${e.materialId}`, M, y); y += 12; }
    y += 4;
  });

  doc.save("historico.pdf");
}
