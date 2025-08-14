import { useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { downloadCSV, toCSV } from "@/utils/csv";
import { createCycle } from "@/api/cycles";
import { listMaterials } from "@/api/materials";
import type { ListMaterialsResponse, Material } from "@/types/material";

/** -------------------- Schema da linha do CSV -------------------- **/
const rowSchema = z.object({
  // você pode informar materialId (UUID) OU materialCode (código do material)
  materialId: z.string().optional().or(z.literal("")),
  materialCode: z.string().optional().or(z.literal("")),
  etapa: z.string().min(3, "Etapa obrigatória"),
  responsavel: z.string().min(1, "Responsável obrigatório"),
  observacoes: z.string().optional().or(z.literal("")),
});
type RowInput = z.input<typeof rowSchema>;

type ImportError = { row: number; message: string };

/** Normaliza etapa (aceita com/sem acento, minúsculas, etc.) */
function normalizeStage(v: any): string | undefined {
  const raw = String(v ?? "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, ""); // remove acentos

  const map: Record<string, string> = {
    RECEBIMENTO: "RECEBIMENTO",
    LAVAGEM: "LAVAGEM",
    DESINFECCAO: "DESINFECCAO",
    DESINFECACAO: "DESINFECCAO",
    ESTERILIZACAO: "ESTERILIZACAO",
    ARMAZENAMENTO: "ARMAZENAMENTO",
  };
  return map[raw];
}

/** Resolve materialId quando vier apenas materialCode */
async function resolveMaterialIdByCode(code: string): Promise<string | null> {
  // busca só ativos; ajuste se precisar
  const res: ListMaterialsResponse = await listMaterials({
    q: code,
    page: 1,
    perPage: 10,
    active: "true" as any,
  });

  const items = res?.data ?? [];
  // tenta match estrito pelo campo code
  const exact = items.find((m: Material) => (m.code || "").toLowerCase() === code.toLowerCase());
  if (exact) return exact.id;

  // se só veio 1 resultado, aceita (cautela: pode ser nome igual)
  if (items.length === 1) return items[0].id;

  return null;
}

export default function ImportCyclesCSVDialog({
  open,
  onOpenChange,
  onImported,
}: {
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
      { key: "materialId", label: "materialId" },
      { key: "materialCode", label: "materialCode" },
      { key: "etapa", label: "etapa" }, // RECEBIMENTO | LAVAGEM | DESINFECCAO | ESTERILIZACAO | ARMAZENAMENTO
      { key: "responsavel", label: "responsavel" },
      { key: "observacoes", label: "observacoes" },
    ];
    // exemplo usando materialCode (sem UUID)
    return toCSV(
      [
        {
          materialId: "",
          materialCode: "MAT-2025-0001",
          etapa: "ESTERILIZACAO",
          responsavel: "Maria",
          observacoes: "Carga manhã",
        },
      ],
      headers
    );
  }, []);

  function resetAll() {
    setFile(null);
    setRows([]);
    setErrors([]);
    setProcessed(0);
    setParsing(false);
    setImporting(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  function handleTemplateDownload() {
    downloadCSV("cycles_template.csv", templateCSV);
  }

  function handleParse() {
    if (!file) return;
    setParsing(true);
    setErrors([]);

    Papa.parse<RowInput>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
      complete: (res) => {
        const parsed: RowInput[] = (res.data || []).map((r: any) => ({
          materialId: r.materialId?.toString() ?? "",
          materialCode: r.materialCode?.toString() ?? "",
          etapa: r.etapa?.toString() ?? "",
          responsavel: r.responsavel?.toString() ?? "",
          observacoes: r.observacoes?.toString() ?? "",
        }));

        // valida campos obrigatórios (schema)
        const errs: ImportError[] = [];
        parsed.forEach((row, idx) => {
          const check = rowSchema.safeParse(row);
          if (!check.success) {
            errs.push({
              row: idx + 2, // +2 por causa do header
              message: check.error.issues.map((i) => i.message).join(", "),
            });
          }
        });

        setRows(parsed);
        setErrors(errs);
        setParsing(false);

        if (errs.length)
          toast({
            title: "Erros no CSV",
            description: `${errs.length} linha(s) com problemas.`,
            variant: "destructive",
          });
        else toast({ title: "CSV carregado", description: `${parsed.length} linha(s) lidas.` });
      },
      error: (e) => {
        setParsing(false);
        toast({ title: "Falha ao ler CSV", description: e.message, variant: "destructive" });
      },
    });
  }

  async function importAll() {
    if (!rows.length) return;
    setImporting(true);
    setProcessed(0);

    // normaliza estapas antes
    const prepared = rows.map((r, i) => {
      const etapa = normalizeStage(r.etapa);
      return { ...r, etapa: etapa ?? "", __row: i + 2 };
    });

    const valid = prepared.filter((r) => r.etapa && (r.materialId || r.materialCode) && r.responsavel);
    const errs: ImportError[] = [];

    let i = 0;
    const CONCURRENCY = 4;

    const runNext = async (): Promise<void> => {
      if (i >= valid.length) return;
      const row = valid[i++];
      try {
        // resolve materialId (preferir o fornecido)
        let materialId = (row.materialId || "").trim();
        if (!materialId && row.materialCode) {
          const resolved = await resolveMaterialIdByCode(row.materialCode);
          if (!resolved) throw new Error(`Material não encontrado para code "${row.materialCode}"`);
          materialId = resolved;
        }

        await createCycle({
          materialId,
          etapa: row.etapa!,
          responsavel: row.responsavel!,
          observacoes: row.observacoes || undefined,
        });
      } catch (e: any) {
        errs.push({
          row: row.__row as number,
          message: e?.response?.data?.message || e?.message || "Erro ao criar",
        });
      } finally {
        setProcessed((p) => p + 1);
        if (i < valid.length) await runNext();
      }
    };

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, valid.length) }, () => runNext()));

    setErrors((prev) => [...prev, ...errs]);
    setImporting(false);

    if (errs.length === 0) {
      toast({ title: "Importação concluída", description: `${valid.length} registro(s) importados.` });
      onImported?.();
      onOpenChange(false);
      resetAll();
    } else {
      toast({
        title: "Importação concluída com erros",
        description: `${valid.length - errs.length} ok · ${errs.length} falharam`,
        variant: "destructive",
      });
      onImported?.();
    }
  }

  const percent = total ? Math.round((processed / total) * 100) : 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) resetAll();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Importar CSV de Ciclos</DialogTitle>
          <DialogDescription>
            Colunas aceitas: <code>materialId</code> (ou <code>materialCode</code>),{" "}
            <code>etapa</code>, <code>responsavel</code>, <code>observacoes</code>.<br />
            Etapas: RECEBIMENTO, LAVAGEM, DESINFECCAO, ESTERILIZACAO, ARMAZENAMENTO.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <Button variant="outline" onClick={handleTemplateDownload}>
              Baixar modelo
            </Button>
          </div>

          <div className="flex gap-2">
            <Button onClick={handleParse} disabled={!file || parsing}>
              Ler CSV
            </Button>
            <Button onClick={importAll} disabled={!rows.length || parsing || importing}>
              {importing ? "Importando…" : "Importar"}
            </Button>
          </div>

          {(parsing || importing || processed > 0) && (
            <div className="space-y-2">
              <Progress value={percent} />
              <div className="text-xs opacity-70">
                {processed}/{total} processados
              </div>
            </div>
          )}

          {errors.length > 0 && (
            <div className="max-h-36 overflow-auto rounded-md border p-2 text-xs">
              {errors.map((e, i) => (
                <div key={i} className="text-red-500">
                  Linha {e.row}: {e.message}
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
