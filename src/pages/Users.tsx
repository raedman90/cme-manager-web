import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listUsersPaged, deleteUser, type UserDTO } from "@/api/users";
import { Button } from "@/components/ui/button";
import BadgeButton from "@/components/users/BadgeButton";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { keepPreviousData } from "@tanstack/react-query";
import { jsPDF } from "jspdf";
import QRCode from "qrcode";

type SortKey = "name" | "email" | "role" | "createdAt" | "badgeCode";

export default function Users() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [qRaw, setQRaw] = useState("");
  const [q, setQ] = useState("");
  const [role, setRole] = useState<"ADMIN" | "TECH" | "AUDITOR" | undefined>();
  const [sort, setSort] = useState<SortKey>("createdAt");
  const [order, setOrder] = useState<"asc" | "desc">("desc");

  // seleção
  const [selected, setSelected] = useState<Record<string, UserDTO>>({});

  useEffect(() => {
    const t = setTimeout(() => { setQ(qRaw); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [qRaw]);

  const { data, isLoading } = useQuery({
    queryKey: ["users", { page, perPage, q, role, sort, order }],
    queryFn: () => listUsersPaged({ page, perPage, q, role, sort, order }),
    placeholderData: keepPreviousData,
    staleTime: 5000,
  });

  const delMut = useMutation({
    mutationFn: (id: string) => deleteUser(id),
    onSuccess: () => { toast.success("Funcionário removido"); qc.invalidateQueries({ queryKey: ["users"] }); },
    onError: () => toast.error("Erro ao remover"),
  });

  function toggleSort(col: SortKey) {
    if (sort !== col) { setSort(col); setOrder("asc"); return; }
    setOrder(prev => (prev === "asc" ? "desc" : "asc"));
  }

  const showing = useMemo(() => {
    if (!data) return "0–0 de 0";
    const start = (data.page - 1) * data.perPage + 1;
    const end = Math.min(data.page * data.perPage, data.total);
    return `${start}–${end} de ${data.total}`;
  }, [data]);

  const allOnPageSelected = useMemo(() => {
    if (!data?.data?.length) return false;
    return data.data.every(u => !!selected[u.id]);
  }, [data, selected]);

  const selectedArray = useMemo(() => Object.values(selected), [selected]);
  const selectedCount = selectedArray.length;

  function clearSelection() {
    setSelected({});
  }
  function toggleSelectAllOnPage() {
    if (!data?.data) return;
    const next = { ...selected };
    if (allOnPageSelected) {
      // desmarca os da página
      data.data.forEach(u => { delete next[u.id]; });
    } else {
      // marca os da página
      data.data.forEach(u => { next[u.id] = u; });
    }
    setSelected(next);
  }
  function toggleRow(u: UserDTO) {
    setSelected(prev => {
      const n = { ...prev };
      if (n[u.id]) delete n[u.id]; else n[u.id] = u;
      return n;
    });
  }

  // ===== CSV (selecionados) =====
  function exportCSV() {
    if (!selectedCount) return;
    const rows = selectedArray.map(u => ({
      Nome: u.name,
      Email: u.email,
      Cargo: u.role,
      Cracha: u.badgeCode,
      CriadoEm: new Date(u.createdAt).toISOString(),
    }));
    const headers = Object.keys(rows[0] || { Nome: "", Email: "", Cargo: "", Cracha: "", CriadoEm: "" });
    const csv = [
      headers.join(";"),
      ...rows.map(r => headers.map(h => String((r as any)[h]).replace(/;/g, ",")).join(";")),
    ].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }); // BOM p/ Excel
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `funcionarios_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ===== PDF A4 (crachás) =====
  async function printBadgesA4() {
    if (!selectedCount) return;

    // Layout A4 retrato: 210×297mm
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();

    // Tamanho do cartão CR-80
    const CARD_W = 85.6;
    const CARD_H = 54.0;

    // Grid: 2 col x 4 lin
    const M = 10;        // margem externa
    const Gx = 10;       // espaçamento horizontal
    const Gy = 10;       // espaçamento vertical

    const cols = 2;
    const rows = 4;

    // coordenadas pré-calculadas
    const x0 = M;
    const x1 = M + CARD_W + Gx;
    const ys = Array.from({ length: rows }, (_, i) => M + i * (CARD_H + Gy));

    let index = 0;
    for (let i = 0; i < selectedArray.length; i++) {
      const u = selectedArray[i];
      const col = index % cols;
      const row = Math.floor(index / cols) % rows;

      const x = col === 0 ? x0 : x1;
      const y = ys[row];

      // desenha 1 crachá no retângulo (x,y)
      // (reutiliza o estilo do crachá único em landscape)
      await drawSingleBadgeLandscape(doc, u, x, y, CARD_W, CARD_H);

      index++;

      // nova página a cada 8 cartões
      const filled = (i + 1) % (cols * rows) === 0;
      if (filled && i + 1 < selectedArray.length) {
        doc.addPage();
      }
    }

    doc.save(`crachas_${selectedCount}_${new Date().toISOString().slice(0,10)}.pdf`);
  }

  return (
    <div className="space-y-4">
      {/* Barra superior */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="text-xl font-semibold">Funcionários</h1>
        <div className="flex items-center gap-2">
          <Input
            placeholder="Buscar por nome, e-mail ou crachá…"
            value={qRaw}
            onChange={(e) => setQRaw(e.target.value)}
            className="w-64"
          />
          <Select value={role ?? "ALL"} onValueChange={(v) => { setRole(v === "ALL" ? undefined : (v as any)); setPage(1); }}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Cargo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos os cargos</SelectItem>
              <SelectItem value="ADMIN">ADMIN</SelectItem>
              <SelectItem value="TECH">TECH</SelectItem>
              <SelectItem value="AUDITOR">AUDITOR</SelectItem>
            </SelectContent>
          </Select>
          <Select value={String(perPage)} onValueChange={(v) => { setPerPage(Number(v)); setPage(1); }}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10 / pág.</SelectItem>
              <SelectItem value="20">20 / pág.</SelectItem>
              <SelectItem value="50">50 / pág.</SelectItem>
            </SelectContent>
          </Select>
          <Button asChild><Link to="/users/new">Novo funcionário</Link></Button>
        </div>
      </div>

      {/* Barra de ações em lote */}
      {selectedCount > 0 && (
        <div className="flex items-center justify-between rounded-xl border p-3 bg-muted/40">
          <div className="text-sm">
            <strong>{selectedCount}</strong> selecionado(s)
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={exportCSV}>Exportar CSV</Button>
            <Button variant="outline" onClick={printBadgesA4}>Imprimir Crachás (PDF A4)</Button>
            <Button variant="ghost" onClick={clearSelection}>Limpar seleção</Button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/60">
            <tr className="[&>th]:px-3 [&>th]:py-2 text-left">
              <th className="px-3 py-2">
                <input
                  type="checkbox"
                  checked={allOnPageSelected}
                  onChange={toggleSelectAllOnPage}
                />
              </th>
              <Th sort={sort} order={order} k="name" onClick={toggleSort}>Nome</Th>
              <Th sort={sort} order={order} k="email" onClick={toggleSort}>E-mail</Th>
              <Th sort={sort} order={order} k="role" onClick={toggleSort}>Cargo</Th>
              <Th sort={sort} order={order} k="badgeCode" onClick={toggleSort}>Crachá</Th>
              <Th sort={sort} order={order} k="createdAt" onClick={toggleSort}>Criado em</Th>
              <th className="px-3 py-2 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">Carregando…</td></tr>
            )}
            {!isLoading && data?.data.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">Nenhum funcionário encontrado</td></tr>
            )}
            {data?.data.map((u: UserDTO) => {
              const checked = !!selected[u.id];
              return (
                <tr key={u.id} className="border-t [&>td]:px-3 [&>td]:py-2">
                  <td>
                    <input type="checkbox" checked={checked} onChange={() => toggleRow(u)} />
                  </td>
                  <td className="flex items-center gap-2">
                    <img src={u.photoUrl ?? "/brand/avatar-placeholder.png"} alt="" className="w-8 h-8 rounded-full object-cover" />
                    <span className="font-medium">{u.name}</span>
                  </td>
                  <td>{u.email}</td>
                  <td>{u.role}</td>
                  <td className="font-mono text-xs">{u.badgeCode}</td>
                  <td>{new Date(u.createdAt).toLocaleDateString()}</td>
                  <td className="text-right">
                    <div className="flex gap-2 justify-end">
                      <BadgeButton user={u} />
                      <Button asChild variant="secondary" size="sm"><Link to={`/users/${u.id}`}>Editar</Link></Button>
                      <Button variant="destructive" size="sm" onClick={() => delMut.mutate(u.id)}>Excluir</Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Paginação */}
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm text-muted-foreground">{showing}</div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={!data || page <= 1} onClick={() => setPage((p) => p - 1)}>
            Anterior
          </Button>
          <span className="text-sm">{data ? `Pág. ${data.page} de ${data.totalPages}` : "—"}</span>
          <Button
            variant="outline"
            size="sm"
            disabled={!data || page >= (data.totalPages ?? 1)}
            onClick={() => setPage((p) => p + 1)}
          >
            Próxima
          </Button>
        </div>
      </div>
    </div>
  );
}

function Th({
  children, sort, order, k, onClick,
}: { children: React.ReactNode; sort: SortKey; order: "asc"|"desc"; k: SortKey; onClick: (k: SortKey) => void }) {
  const active = sort === k;
  return (
    <th
      className={cn("px-3 py-2 cursor-pointer select-none", active ? "text-[hsl(var(--primary))]" : "")}
      onClick={() => onClick(k)}
      title="Ordenar"
    >
      <div className="inline-flex items-center gap-1">
        {children}
        {active ? (order === "asc" ? "▲" : "▼") : "↕"}
      </div>
    </th>
  );
}

/* ================== helpers ================== */

const BRAND = { r: 16, g: 185, b: 129 };
const TEXT_DARK = { r: 40, g: 40, b: 40 };
const TEXT_MUTED = { r: 90, g: 90, b: 90 };

async function urlToDataURL(url: string): Promise<string> {
  const res = await fetch(url, { cache: "no-store" });
  const blob = await res.blob();
  return new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
}

// Desenha um crachá landscape no retângulo (x,y,CARD_W,CARD_H)
async function drawSingleBadgeLandscape(doc: jsPDF, user: UserDTO, x: number, y: number, CARD_W: number, CARD_H: number) {
  const M = 3; // margem interna
  const innerW = CARD_W - M * 2;
  const innerH = CARD_H - M * 2;

  // moldura
  doc.setDrawColor(220);
  doc.roundedRect(x + M, y + M, innerW, innerH, 2, 2);

  // header
  const headerH = 12;
  doc.setFillColor(BRAND.r, BRAND.g, BRAND.b);
  doc.setDrawColor(BRAND.r, BRAND.g, BRAND.b);
  doc.roundedRect(x + M, y + M, innerW, headerH, 2, 2, "F");

  // título
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("CME Manager", x + M + 3, y + M + headerH / 2 + 2.5);

  // área conteúdo
  const contentY = y + M + headerH + 2;

  // QR à direita
  const QR_BOX = 22;
  const QR_PAD = 1.6;
  const QR_INNER = QR_BOX - QR_PAD * 2;
  const qrBoxX = x + CARD_W - M - QR_BOX;
  const qrBoxY = contentY;

  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(210);
  doc.roundedRect(qrBoxX, qrBoxY, QR_BOX, QR_BOX, 2, 2, "FD");

  const qrDataUrl = await QRCode.toDataURL(user.badgeCode, { errorCorrectionLevel: "H", margin: 0, width: 500 });
  doc.addImage(qrDataUrl, "PNG", qrBoxX + QR_PAD, qrBoxY + QR_PAD, QR_INNER, QR_INNER, undefined, "FAST");

  // foto embaixo à esquerda
  const photoSize = 20;
  const photoX = x + M + 2;
  const photoY = y + CARD_H - M - photoSize - 2;

  doc.setDrawColor(210);
  doc.setFillColor(255, 255, 255);
  doc.rect(photoX - 0.5, photoY - 0.5, photoSize + 1, photoSize + 1, "FD");

  if (user.photoUrl) {
    try {
      const photoData = await urlToDataURL(user.photoUrl);
      try { doc.addImage(photoData, "JPEG", photoX, photoY, photoSize, photoSize, undefined, "FAST"); }
      catch { doc.addImage(photoData, "PNG",  photoX, photoY, photoSize, photoSize, undefined, "FAST"); }
    } catch {
      doc.setFontSize(6.5); doc.setTextColor(TEXT_MUTED.r, TEXT_MUTED.g, TEXT_MUTED.b);
      doc.text("(Foto)", photoX + 6.5, photoY + photoSize / 2, { baseline: "middle" });
    }
  } else {
    doc.setFontSize(6.5); doc.setTextColor(TEXT_MUTED.r, TEXT_MUTED.g, TEXT_MUTED.b);
    doc.text("(Foto)", photoX + 6.5, photoY + photoSize / 2, { baseline: "middle" });
  }

  // texto entre foto e QR
  const textX = photoX + photoSize + 3;
  const textRight = qrBoxX - 3;
  const textW = Math.max(10, textRight - textX);
  let ty = contentY + 2.5;

  doc.setTextColor(TEXT_DARK.r, TEXT_DARK.g, TEXT_DARK.b);
  doc.setFont("helvetica", "bold");
  let nameFont = 10.5;
  let lines = doc.splitTextToSize(user.name, textW);
  if (lines.length > 2) nameFont = 9.8;
  doc.setFontSize(nameFont);
  doc.text(lines, textX, ty);
  ty += 4.6 + (lines.length - 1) * 4.2;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(TEXT_MUTED.r, TEXT_MUTED.g, TEXT_MUTED.b);
  doc.text(`Cargo: ${user.role}`, textX, ty);
  ty += 4;

  doc.setFontSize(7.8);
  doc.text(`ID: ${user.badgeCode}`, textX, ty);

  // rodapé (pequeno)
  doc.setFontSize(6.8);
  doc.setTextColor(TEXT_MUTED.r, TEXT_MUTED.g, TEXT_MUTED.b);
  doc.text("Validação: QR → assinatura de etapas", qrBoxX, y + CARD_H - M - 4.2);
}
