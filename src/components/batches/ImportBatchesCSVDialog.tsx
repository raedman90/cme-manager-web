import { useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { downloadCSV, toCSV } from "@/utils/csv";
import { createBatch } from "@/api/batches";

const rowSchema = z.object({
  name: z.string().optional().or(z.literal("")),
  code: z.string().optional().or(z.literal("")),
  description: z.string().optional().or(z.literal("")),
  status: z.string().optional().or(z.literal("")), // 'open' | 'processing' | 'closed'
});

type RowInput = z.input<typeof rowSchema>;

type ImportError = { row: number; message: string };

function parseStatus(v: any): string | undefined {
  const s = String(v ?? "").trim().toLowerCase();
  if (!s) return undefined;
  if (["open", "aberto"].includes(s)) return "open";
  if (["processing", "processando", "in_process", "em processamento"].includes(s)) return "processing";
  if (["closed", "fechado"].includes(s)) return "closed";
  return undefined; // desconhecido => deixamos undefined
}

export default function ImportBatchesCSVDialog({ open, onOpenChange, onImported }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onImported?: () => void;
}) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<RowInput[]>([]);
  const [errors, setErrors] = useState<ImportError[]>([]);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [processed, setProcessed] = useState(0);
  const total = rows.length;

  const templateCSV = useMemo(() => {
    const headers = [
      { key: "name", label: "name" },
      { key: "code", label: "code" },
      { key: "description", label: "description" },
      { key: "status", label: "status" },
    ];
    return toCSV([{ name: "Lote 01", code: "L-001", description: "Lote piloto", status: "open" }], headers);
  }, []);

  function resetAll() {
    setFile(null); setRows([]); setErrors([]); setProcessed(0); setParsing(false); setImporting(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  function handleTemplateDownload() {
    downloadCSV("batches_template.csv", templateCSV);
  }

  function handleParse() {
    if (!file) return;
    setParsing(true); setErrors([]);

    Papa.parse<RowInput>(file, {
      header: true, skipEmptyLines: true, transformHeader: (h) => h.trim().toLowerCase(),
      complete: (res) => {
        const parsed: RowInput[] = (res.data || []).map((r) => ({
          name: (r as any).name?.toString() ?? "",
          code: (r as any).code?.toString() ?? "",
          description: (r as any).description?.toString() ?? "",
          status: parseStatus((r as any).status),
        }));
        const errs: ImportError[] = [];
        parsed.forEach((row, idx) => {
          const check = rowSchema.safeParse(row);
          if (!check.success) errs.push({ row: idx + 2, message: check.error.issues.map((i) => i.message).join(", ") });
        });
        setRows(parsed); setErrors(errs); setParsing(false);
        if (errs.length) toast({ title: "Erros no CSV", description: `${errs.length} linha(s) com problemas.`, variant: "destructive" });
        else toast({ title: "CSV carregado", description: `${parsed.length} linha(s) lidas.` });
      },
      error: (e) => { setParsing(false); toast({ title: "Falha ao ler CSV", description: e.message, variant: "destructive" }); },
    });
  }

  async function importAll() {
    if (!rows.length) return;
    setImporting(true); setProcessed(0);

    const valid: RowInput[] = [];
    for (const r of rows) {
      const check = rowSchema.safeParse(r);
      if (check.success) valid.push(check.data);
    }

    const CONCURRENCY = 4;
    let i = 0;
    const errs: ImportError[] = [];

    const runNext = async (): Promise<void> => {
      if (i >= valid.length) return;
      const row = valid[i++];
      try {
        await createBatch({ name: row.name || undefined, code: row.code || undefined, description: row.description || undefined, status: row.status || undefined });
      } catch (e: any) {
        errs.push({ row: i + 1, message: e?.response?.data?.message || e?.message || "Erro ao criar" });
      } finally {
        setProcessed((p) => p + 1);
        if (i < valid.length) await runNext();
      }
    };

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, valid.length) }, () => runNext()));

    setErrors((prev) => [...prev, ...errs]); setImporting(false);
    if (errs.length === 0) { toast({ title: "Importação concluída", description: `${valid.length} registro(s) importados.` }); onImported?.(); onOpenChange(false); resetAll(); }
    else { toast({ title: "Importação concluída com erros", description: `${valid.length - errs.length} ok · ${errs.length} falharam`, variant: "destructive" }); onImported?.(); }
  }

  const percent = total ? Math.round((processed / total) * 100) : 0;

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) resetAll(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Importar CSV de Lotes</DialogTitle>
          <DialogDescription>Colunas: <code>name, code, description, status</code>.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <Button variant="outline" onClick={handleTemplateDownload}>Baixar modelo</Button>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleParse} disabled={!file || parsing}>Ler CSV</Button>
            <Button onClick={importAll} disabled={!rows.length || parsing || importing}>{importing ? "Importando…" : "Importar"}</Button>
          </div>
          {(parsing || importing || processed > 0) && (
            <div className="space-y-2">
              <Progress value={percent} />
              <div className="text-xs opacity-70">{processed}/{total} processados</div>
            </div>
          )}
          {errors.length > 0 && (
            <div className="max-h-36 overflow-auto rounded-md border p-2 text-xs">
              {errors.map((e, i) => (<div key={i} className="text-red-500">Linha {e.row}: {e.message}</div>))}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}