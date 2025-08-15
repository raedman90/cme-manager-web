import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";

import MedicalNameCombobox from "@/components/materials/MedicalNameCombobox";
import CategoryCombobox from "@/components/materials/CategoryCombobox";
import ScanCodeDialog from "@/components/common/ScanCodeDialog";
import { generateMaterialCode } from "@/utils/ids";

import QRCode from "react-qr-code";
import JsBarcode from "jsbarcode";
import type { Material } from "@/types/material";

// PDF
import { jsPDF } from "jspdf";

/* -------------------------------- Schema -------------------------------- */
// (compatível com zod antigo)
const VALID_TYPES = ["crítico", "semicrítico", "não crítico"] as const;
const CME_CATEGORIES = [
  "Geral",
  "Instrumental Cirúrgico",
  "Caixas Cirúrgicas",
  "Laparoscopia",
  "Ortopedia/Trauma",
  "Otorrino",
  "Oftalmologia",
  "Ginecologia/Obstetrícia",
  "Urologia",
  "Endoscopia",
  "Anestesia",
  "Clínica/Enfermagem",
  "Curativos/Ataduras",
  "Odontologia",
  "Materiais Termossensíveis",
  "Esterilização/Controle",
  "Estocagem/Embalagem",
  "Pronto Atendimento",
  "Implantes/Consignado",
] as const;

const schema = z.object({
  name: z.string().min(2, "Informe o nome"),
  code: z.string().optional().or(z.literal("")),
  description: z.string().optional().or(z.literal("")),
  active: z.boolean().default(true),

  // NOVOS CAMPOS OBRIGATÓRIOS
    category: z
    .string()
    .nonempty("Informe a categoria")
    .refine((v) => (CME_CATEGORIES as readonly string[]).includes(v as any), { message: "Categoria inválida" }),
  type: z
    .string()
    .nonempty("Informe o tipo")
    .refine((v) => (VALID_TYPES as readonly string[]).includes(v as any), { message: "Tipo inválido" }),

  // Validade obrigatória 'YYYY-MM-DD'
  expiry: z
    .string()
    .nonempty("Informe a validade")
    .refine((v) => !Number.isNaN(new Date(v).getTime()), { message: "Data inválida" }),
});

type MaterialFormInput = z.input<typeof schema>;
export type MaterialFormValues = z.output<typeof schema>;

/* ------------------------------ Helpers PDF ------------------------------ */
async function svgToPngDataUrl(svgEl: SVGSVGElement, scale = 2): Promise<string> {
  let { width, height } = svgEl.getBoundingClientRect();
  if (!width || !height) {
    const wAttr = svgEl.getAttribute("width");
    const hAttr = svgEl.getAttribute("height");
    width = wAttr ? parseFloat(wAttr) : 256;
    height = hAttr ? parseFloat(hAttr) : 256;
  }

  const xml = new XMLSerializer().serializeToString(svgEl);
  const svg64 = window.btoa(unescape(encodeURIComponent(xml)));
  const imgSrc = `data:image/svg+xml;base64,${svg64}`;

  const img = new Image();
  img.crossOrigin = "anonymous";
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.floor(width * scale));
  canvas.height = Math.max(1, Math.floor(height * scale));

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas não suportado");

  await new Promise<void>((resolve, reject) => {
    img.onload = () => {
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve();
    };
    img.onerror = (e) => reject(e);
    img.src = imgSrc;
  });

  return canvas.toDataURL("image/png");
}

function toDateInput(value?: string) {
  return value ? value.slice(0, 10) : "";
}

/* ------------------------------ Componente ------------------------------- */
export default function MaterialForm({
  defaultValues,
  submitting,
  onSubmit,
}: {
  defaultValues?: Partial<Material>;
  submitting?: boolean;
  onSubmit: (values: MaterialFormValues) => Promise<void> | void;
}) {
  const form = useForm<MaterialFormInput>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: defaultValues?.name ?? "",
      code: defaultValues?.code ?? "",
      description: defaultValues?.description ?? "",
      active: defaultValues?.active ?? true,
      // NOVOS
      category: (defaultValues?.category as any) ?? "Geral",
      type: (defaultValues?.type as any) ?? "não crítico",
      expiry: toDateInput(defaultValues?.expiry) || "",
    },
  });

  const codeValue = useWatch({ control: form.control, name: "code" });
  const nameValue = useWatch({ control: form.control, name: "name" });
  const expiryValue = useWatch({ control: form.control, name: "expiry" });
  const categoryValue = useWatch({ control: form.control, name: "category" });
  const typeValue = useWatch({ control: form.control, name: "type" });

  // refs
  const qrBoxRef = useRef<HTMLDivElement | null>(null);
  const barcodeRef = useRef<SVGSVGElement | null>(null);
  const [scanOpen, setScanOpen] = useState(false);

  // Barcode sempre que "code" muda
  useEffect(() => {
    if (codeValue && barcodeRef.current) {
      try {
        JsBarcode(barcodeRef.current, codeValue, {
          format: "CODE128",
          displayValue: true,
          fontSize: 12,
          height: 40,
          margin: 8,
        });
      } catch {
        // ignora erros de formatação
      }
    } else if (barcodeRef.current) {
      barcodeRef.current.innerHTML = "";
    }
  }, [codeValue]);

  // PDF (QR + Code128 + metadados)
  async function handleSavePdf() {
    if (!codeValue) {
      alert("Informe ou gere um identificador antes de salvar o PDF.");
      return;
    }

    const qrSvg = qrBoxRef.current?.querySelector("svg") as SVGSVGElement | null;
    const barSvg = barcodeRef.current;
    if (!qrSvg || !barSvg) {
      alert("Pré-visualizações ainda não renderizadas. Tente novamente.");
      return;
    }

    const [qrPng, barPng] = await Promise.all([svgToPngDataUrl(qrSvg, 3), svgToPngDataUrl(barSvg, 3)]);
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const margin = 48;
    const pageW = doc.internal.pageSize.getWidth();
    const contentW = pageW - margin * 2;

    let y = margin;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("Etiqueta de Material", margin, y);
    y += 18;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    doc.text(`Nome: ${nameValue || "—"}`, margin, y); y += 16;
    doc.text(`Código: ${codeValue}`, margin, y); y += 16;
    if (categoryValue) { doc.text(`Categoria: ${categoryValue}`, margin, y); y += 16; }
    if (typeValue)     { doc.text(`Tipo: ${typeValue}`, margin, y); y += 16; }
    if (expiryValue)   { doc.text(`Validade: ${expiryValue}`, margin, y); }
    y += 24;

    const qrSize = 220;
    doc.addImage(qrPng, "PNG", margin, y, qrSize, qrSize);

    const gap = 24;
    const rightX = margin + qrSize + gap;
    const rightW = contentW - qrSize - gap;

    if (rightW >= 360) {
      const barH = 90;
      doc.addImage(barPng, "PNG", rightX, y + (qrSize - barH) / 2, rightW, barH);
      y += qrSize;
    } else {
      y += qrSize + 16;
      const barH = 90;
      doc.addImage(barPng, "PNG", margin, y, contentW, barH);
      y += barH;
    }

    y += 24;
    doc.setFontSize(10);
    doc.setTextColor(120);
    const date = new Date().toLocaleString();
    doc.text(`Gerado em ${date}`, margin, y);

    const filenameSafe = String(codeValue).replace(/[^\w.-]+/g, "_");
    doc.save(`material_${filenameSafe}.pdf`);
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
        {/* Nome com sugestões */}
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nome</FormLabel>
              <MedicalNameCombobox
                value={field.value || ""}
                onChange={(val) => field.onChange(val)}
                onSuggestionPicked={(item) => {
                  if (!form.getValues("description") && item.description) {
                    form.setValue("description", item.description, { shouldDirty: true });
                  }
                }}
              />
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Identificador + ações */}
        <FormField
          control={form.control}
          name="code"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Identificador</FormLabel>
              <div className="flex flex-wrap gap-2">
                <Input placeholder="Ex.: MAT-20250810-XXXX" {...field} />
                <Button type="button" variant="outline" onClick={() => field.onChange(generateMaterialCode())}>
                  Gerar
                </Button>
                <Button type="button" variant="outline" onClick={() => setScanOpen(true)}>
                  Escanear
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleSavePdf}
                  disabled={!codeValue}
                  title={codeValue ? "Baixar PDF com QR + Código de barras" : "Informe um código"}
                >
                  Salvar PDF
                </Button>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-4">
                <div className="flex items-center justify-center border rounded p-3" ref={qrBoxRef}>
                  {codeValue ? <QRCode value={codeValue} size={96} /> : <span className="text-xs text-muted-foreground">QR Code</span>}
                </div>
                <div className="flex items-center justify-center border rounded p-3">
                  {codeValue ? <svg ref={barcodeRef} /> : <span className="text-xs text-muted-foreground">Código de barras</span>}
                </div>
              </div>

              <FormMessage />
            </FormItem>
          )}
        />

        {/* Categoria (CME)*/}
        <FormField
          control={form.control}
          name="category"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Categoria</FormLabel>
              <CategoryCombobox
                value={field.value || ""}
                onChange={(v) => field.onChange(v)}
                items={CME_CATEGORIES}
                placeholder="Selecione ou busque…"
                // allowCustom // (descomente para permitir categoria livre)
              />
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Tipo */}
        <FormField
          control={form.control}
          name="type"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Tipo</FormLabel>
              <FormControl>
                <select
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={field.value || ""}
                  onChange={(e) => field.onChange(e.target.value)}
                >
                  <option value="" disabled>Selecione</option>
                  {VALID_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Descrição opcional */}
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Descrição</FormLabel>
              <FormControl>
                <Textarea placeholder="Descrição opcional do material" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Status */}
        <FormField
          control={form.control}
          name="active"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Status</FormLabel>
              <FormControl>
                <select
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={field.value ? "true" : "false"}
                  onChange={(e) => field.onChange(e.target.value === "true")}
                >
                  <option value="true">Ativo</option>
                  <option value="false">Inativo</option>
                </select>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Validade */}
        <FormField
          control={form.control}
          name="expiry"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Validade</FormLabel>
              <FormControl>
                <Input type="date" value={field.value || ""} onChange={(e) => field.onChange(e.target.value)} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end gap-2">
          <Button type="submit" disabled={submitting}>
            {submitting ? "Salvando…" : "Salvar"}
          </Button>
        </div>
      </form>

      {/* Scanner QR/Barcode */}
      <ScanCodeDialog
        open={scanOpen}
        onOpenChange={setScanOpen}
        onResult={(code) => form.setValue("code", code, { shouldDirty: true })}
      />
    </Form>
  );
}
