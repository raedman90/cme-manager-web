import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import type { ListMaterialsResponse } from "@/types/material";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

import QRCode from "react-qr-code";
import JsBarcode from "jsbarcode";
import { jsPDF } from "jspdf";

import ScanCodeDialog from "@/components/common/ScanCodeDialog";
import { listMaterials } from "@/api/materials";
import type { Material } from "@/types/material";

// você pode trocar por um generator específico de lote se quiser
import { generateMaterialCode as generateBatchCode } from "@/utils/ids";

/* ------------------------------ schema ------------------------------ */
const schema = z.object({
  name: z.string().min(2, "Informe o nome do lote"),
  code: z.string().min(3, "Informe o código"),
  note: z.string().optional().or(z.literal("")),
  materialIds: z.array(z.string()).default([]),
});
export type BatchFormValues = z.output<typeof schema>;
type BatchFormInput = z.input<typeof schema>;

/* ------------------------------ helpers ----------------------------- */
async function svgToPng(svgEl: SVGSVGElement, scale = 3): Promise<string> {
  let { width, height } = svgEl.getBoundingClientRect();
  if (!width || !height) { width = 256; height = 256; }
  const xml = new XMLSerializer().serializeToString(svgEl);
  const img = new Image(); img.crossOrigin = "anonymous";
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.floor(width * scale));
  canvas.height = Math.max(1, Math.floor(height * scale));
  const ctx = canvas.getContext("2d")!;
  await new Promise<void>((res, rej) => {
    img.onload = () => { ctx.drawImage(img, 0, 0, canvas.width, canvas.height); res(); };
    img.onerror = rej;
    img.src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(xml)))}`;
  });
  return canvas.toDataURL("image/png");
}

/* ------------------------------ componente -------------------------- */
export default function BatchForm({
  defaultValues,
  submitting,
  onSubmit,
}: {
  defaultValues?: Partial<{
    id: string;
    name: string;
    code: string;
    materialIds: string[];
    // ↓↓↓ aceite null
    materials?: Array<{ id: string; name: string; code: string | null }>;
  }>;
  submitting?: boolean;
  onSubmit: (values: BatchFormValues) => Promise<void> | void;
}) {
  const form = useForm<BatchFormInput>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: defaultValues?.name ?? "",
      code: defaultValues?.code ?? "",
      note: "",
      materialIds: defaultValues?.materialIds ?? [],
    },
  });

  // quando defaultValues mudar (abrir em modo edição), garanta que materialIds entra no form
  useEffect(() => {
    if (defaultValues?.materialIds) {
      form.setValue("materialIds", defaultValues.materialIds, { shouldDirty: false });
    }
    if (defaultValues?.name != null) {
      form.setValue("name", defaultValues.name, { shouldDirty: false });
    }
    if (defaultValues?.code != null) {
      form.setValue("code", defaultValues.code, { shouldDirty: false });
    }
  }, [defaultValues?.materialIds, defaultValues?.name, defaultValues?.code]); // eslint-disable-line

  const codeValue = useWatch({ control: form.control, name: "code" });
  const nameValue = useWatch({ control: form.control, name: "name" });
  const materialIds = useWatch({
    control: form.control,
    name: "materialIds",
    defaultValue: [] as string[],
  });

  const qrBoxRef = useRef<HTMLDivElement | null>(null);
  const barcodeRef = useRef<SVGSVGElement | null>(null);

  const [scanBatchOpen, setScanBatchOpen] = useState(false); // scanner do CÓDIGO DO LOTE
  const [scanMatOpen, setScanMatOpen] = useState(false);     // scanner para ADICIONAR MATERIAL

  // cache simples de materiais conhecidos para exibir nomes nos chips
  const [knownMaterials, setKnownMaterials] = useState<
    Record<string, { id: string; name: string; code: string | null }>
  >(() => {
    const map: Record<string, { id: string; name: string; code: string | null }> = {};
    (defaultValues?.materials ?? []).forEach((m) => { map[m.id] = m; });
    return map;
  });

  useEffect(() => {
    if (codeValue && barcodeRef.current) {
      try {
        JsBarcode(barcodeRef.current, codeValue, { format: "CODE128", displayValue: true, fontSize: 12, height: 44, margin: 10 });
      } catch {}
    } else if (barcodeRef.current) {
      barcodeRef.current.innerHTML = "";
    }
  }, [codeValue]);

  async function handleSavePdf() {
    if (!codeValue) return alert("Gere/Informe o código primeiro.");
    const qrSvg = qrBoxRef.current?.querySelector("svg") as SVGSVGElement | null;
    const barSvg = barcodeRef.current;
    if (!qrSvg || !barSvg) return;

    const [qrPng, barPng] = await Promise.all([svgToPng(qrSvg, 3), svgToPng(barSvg, 3)]);
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const M = 48, pageW = doc.internal.pageSize.getWidth(), contentW = pageW - M * 2;
    let y = M;

    doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.text("Etiqueta de Lote", M, y); y += 18;
    doc.setFont("helvetica", "normal"); doc.setFontSize(12);
    doc.text(`Nome: ${nameValue || "—"}`, M, y); y += 16;
    doc.text(`Código: ${codeValue}`, M, y); y += 24;

    const qrSize = 220;
    doc.addImage(qrPng, "PNG", M, y, qrSize, qrSize);

    const gap = 24, rightX = M + qrSize + gap, rightW = contentW - qrSize - gap;
    if (rightW >= 360) {
      const barH = 90; doc.addImage(barPng, "PNG", rightX, y + (qrSize - barH) / 2, rightW, barH); y += qrSize;
    } else {
      y += qrSize + 16; const barH = 90; doc.addImage(barPng, "PNG", M, y, contentW, barH); y += barH;
    }

    y += 24; doc.setFontSize(10); doc.setTextColor(120);
    doc.text(`Materiais vinculados: ${(materialIds?.length ?? 0)}`, M, y); y += 14;
    doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")}`, M, y);

    const file = `lote_${String(codeValue).replace(/[^\w.-]+/g, "_")}.pdf`;
    doc.save(file);
  }

  /* ---------------------- seleção de materiais ---------------------- */
  const [search, setSearch] = useState("");
  const debouncedSearch = useMemo(() => search.trim(), [search]);

  const { data: mats } = useQuery<ListMaterialsResponse>({
    queryKey: ["materials", { q: debouncedSearch || undefined, page: 1, perPage: 10, active: "true" }],
    queryFn: () =>
      listMaterials({
        q: debouncedSearch || undefined,
        page: 1,
        perPage: 10,
        active: "true" as any,
      }),
    placeholderData: keepPreviousData,
  });

  const results: Material[] = mats?.data ?? [];

  // sempre que vierem resultados, atualiza o cache de conhecidos
  useEffect(() => {
    if (!results?.length) return;
    setKnownMaterials((prev) => {
      const copy = { ...prev };
      results.forEach((m) => {
        copy[m.id] = { id: m.id, name: m.name, code: m.code ?? null };
      });
      return copy;
    });
  }, [results]);

  const selectedSet = new Set(materialIds ?? []);

  function toggleMaterial(id: string) {
    const current = new Set(materialIds ?? []);
    if (current.has(id)) current.delete(id);
    else current.add(id);
    form.setValue("materialIds", Array.from(current), { shouldDirty: true });
  }

  function clearSelection() {
    form.setValue("materialIds", [], { shouldDirty: true });
  }

  // adicionar material a partir de um CÓDIGO (escaneado ou digitado)
  async function addMaterialByCode(scanned: string) {
    const code = (scanned ?? "").trim();
    if (!code) return;

    // 1) tenta achar nos resultados atuais
    let found = results.find((m) => (m.code || "").trim() === code);

    // 2) se não achou, consulta a API
    if (!found) {
      const res = await listMaterials({ q: code, page: 1, perPage: 25, active: "true" as any });
      // procurar match EXATO no campo code
      found = res.data.find((m) => (m.code || "").trim() === code);
    }

    if (!found) {
      alert(`Material com código "${code}" não encontrado.`);
      return;
    }

    // adiciona (se ainda não estiver)
    if (!selectedSet.has(found.id)) {
      toggleMaterial(found.id);
    }

    // garante que temos nome para o chip
    setKnownMaterials((prev) => ({ ...prev, [found!.id]: { id: found!.id, name: found!.name, code: found!.code } }));
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(async (values) => {
          const parsed = schema.parse(values);
          await onSubmit(parsed);
        })}
        className="space-y-4"
      >
        {/* Nome do lote */}
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nome do lote</FormLabel>
              <FormControl><Input placeholder="Ex.: Lote Roupas 12/08 (manhã)" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Código / QR / Barcode / PDF / Scan */}
        <FormField
          control={form.control}
          name="code"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Código do lote</FormLabel>
              <div className="flex flex-wrap gap-2">
                <Input placeholder="Ex.: LOT-20250811-XXXX" {...field} />
                <Button type="button" variant="outline" onClick={() => field.onChange(generateBatchCode())}>Gerar</Button>
                <Button type="button" variant="outline" onClick={() => setScanBatchOpen(true)}>Escanear</Button>
                <Button type="button" variant="outline" onClick={handleSavePdf} disabled={!codeValue}>Salvar PDF</Button>
              </div>

              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex items-center justify-center border rounded p-3" ref={qrBoxRef}>
                  {codeValue ? <QRCode value={codeValue} size={120} /> : <span className="text-xs text-muted-foreground">QR Code</span>}
                </div>
                <div className="flex items-center justify-center border rounded p-3">
                  {codeValue ? <svg ref={barcodeRef} /> : <span className="text-xs text-muted-foreground">Código de barras</span>}
                </div>
              </div>

              <FormMessage />
            </FormItem>
          )}
        />

        {/* (Opcional) observações */}
        <FormField
          control={form.control}
          name="note"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Observações</FormLabel>
              <FormControl><Textarea placeholder="Notas sobre o lote (opcional)" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Seleção de materiais */}
        <FormField
          control={form.control}
          name="materialIds"
          render={() => (
            <FormItem>
              <FormLabel>Materiais do lote</FormLabel>
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  <Input
                    placeholder="Buscar materiais (nome/código)"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-64"
                  />
                  <Button type="button" variant="outline" onClick={() => setScanMatOpen(true)}>
                    Adicionar por SCAN
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={clearSelection}
                    disabled={(materialIds?.length ?? 0) === 0}
                  >
                    Limpar
                  </Button>
                </div>

                {/* resultados de busca */}
                <div className="max-h-56 overflow-auto border rounded">
                  {results.length === 0 ? (
                    <div className="p-3 text-sm text-muted-foreground">Sem resultados</div>
                  ) : results.map((m: Material) => (
                    <label key={m.id} className="flex items-center gap-2 px-3 py-2 border-b last:border-b-0 cursor-pointer">
                      <input
                        type="checkbox"
                        className="size-4"
                        checked={selectedSet.has(m.id)}
                        onChange={() => toggleMaterial(m.id)}
                      />
                      <div className="text-sm">
                        <div className="font-medium">{m.name}</div>
                        <div className="text-xs opacity-70">{m.code}</div>
                      </div>
                    </label>
                  ))}
                </div>

                {/* selecionados */}
                <div className="flex flex-wrap gap-2">
                  {(materialIds ?? []).map((id) => {
                    const m = knownMaterials[id];
                    return (
                      <span key={id} className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs">
                        {m?.name ?? id}
                        <button type="button" onClick={() => toggleMaterial(id)} className="opacity-70 hover:opacity-100">×</button>
                      </span>
                    );
                  })}
                  {(materialIds?.length ?? 0) === 0 && (
                    <span className="text-xs text-muted-foreground">Nenhum material selecionado</span>
                  )}
                </div>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end gap-2">
          <Button type="submit" disabled={submitting}>{submitting ? "Salvando…" : "Salvar"}</Button>
        </div>
      </form>

      {/* Scanner para o CÓDIGO DO LOTE */}
      <ScanCodeDialog
        open={scanBatchOpen}
        onOpenChange={setScanBatchOpen}
        onResult={(code) => form.setValue("code", code, { shouldDirty: true })}
      />

      {/* Scanner para ADICIONAR MATERIAL */}
      <ScanCodeDialog
        open={scanMatOpen}
        onOpenChange={setScanMatOpen}
        onResult={(code) => {
          addMaterialByCode(code);
        }}
      />
    </Form>
  );
}
