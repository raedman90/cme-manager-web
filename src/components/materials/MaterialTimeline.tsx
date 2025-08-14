// src/components/materials/MaterialTimeline.tsx
import { useMemo, useState } from "react";
import type { MaterialHistoryEvent, Source, Stage } from "@/types/history";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Copy, Package, Droplets, ShieldCheck, Flame, Archive, Lock, Database, Clock } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Props = {
  events: MaterialHistoryEvent[];
  className?: string;
};


const STAGE_META: Record<Stage, { label: string; icon: any; color: string }> = {
  RECEBIMENTO:   { label: "Recebimento",   icon: Package,    color: "bg-blue-100 text-blue-800 border-blue-300" },
  LAVAGEM:       { label: "Lavagem",       icon: Droplets,   color: "bg-cyan-100 text-cyan-800 border-cyan-300" },
  DESINFECCAO:   { label: "Desinfecção",   icon: ShieldCheck,color: "bg-amber-100 text-amber-800 border-amber-300" },
  ESTERILIZACAO: { label: "Esterilização", icon: Flame,      color: "bg-red-100 text-red-800 border-red-300" },
  ARMAZENAMENTO: { label: "Armazenamento", icon: Archive,    color: "bg-emerald-100 text-emerald-800 border-emerald-300" },
};

const SOURCE_META: Record<Source, { label: string; icon: any; color: string }> = {
  LEDGER: { label: "Ledger", icon: Lock, color: "text-emerald-700" },
  DB:     { label: "DB",     icon: Database, color: "text-slate-600" },
};

function formatDate(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

export default function MaterialTimeline({ events, className }: Props) {
  const [source, setSource] = useState<Source | "ALL">("ALL");
  const [stage, setStage] = useState<Stage | "ALL">("ALL");
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return events
      .slice()
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
      .filter((e) => (source === "ALL" ? true : e.source === source))
      .filter((e) => (stage === "ALL" ? true : e.stage === stage))
      .filter((e) => {
        if (!query) return true;
        return (
          (e.operator ?? "").toLowerCase().includes(query) ||
          (e.txId ?? "").toLowerCase().includes(query) ||
          e.cycleId.toLowerCase().includes(query) ||
          (e.batchId ?? "").toLowerCase().includes(query)
        );
      });
  }, [events, source, stage, q]);

  
  return (
    <div className={cn("grid gap-4", className)}>
      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Buscar por operador, txId, cycleId, lote…"
          className="w-72"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Select value={source} onValueChange={(v) => setSource(v as any)}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Fonte" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todas as fontes</SelectItem>
            <SelectItem value="LEDGER">Ledger</SelectItem>
            <SelectItem value="DB">DB</SelectItem>
          </SelectContent>
        </Select>
        <Select value={stage} onValueChange={(v) => setStage(v as any)}>
          <SelectTrigger className="w-56"><SelectValue placeholder="Etapa" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todas as etapas</SelectItem>
            {Object.keys(STAGE_META).map((s) => (
              <SelectItem key={s} value={s}>{STAGE_META[s as Stage].label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Timeline */}
      <ol className="relative border-s pl-6">
        {filtered.length === 0 && (
          <div className="text-sm text-muted-foreground py-6">Nenhum evento para os filtros atuais.</div>
        )}

        {filtered.map((e, idx) => {
          const meta = STAGE_META[e.stage as Stage] ?? STAGE_META.RECEBIMENTO;
          const SIcon = meta.icon;
          const SMeta = SOURCE_META[e.source];
          const SrcIcon = SMeta.icon;

          return (
            <li key={`${e.timestamp}-${e.txId ?? idx}`} className="mb-6 ms-4">
              {/* dot */}
              <span className="absolute -start-3 flex h-6 w-6 items-center justify-center rounded-full bg-white ring-8 ring-background border">
                <SIcon className="h-3.5 w-3.5" />
              </span>

              {/* card */}
              <div className="rounded-xl border p-3 bg-white">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={cn("border", meta.color)}>
                      <SIcon className="h-3.5 w-3.5 mr-1" />
                      {meta.label}
                    </Badge>
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      {formatDate(e.timestamp)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className={cn("text-xs flex items-center gap-1", SMeta.color)}>
                      <SrcIcon className="h-3.5 w-3.5" /> {SMeta.label}
                    </span>
                  </div>
                </div>

                <div className="mt-2 grid gap-1 text-sm">
                  <div className="text-muted-foreground">
                    Operador:&nbsp;
                    <span className="text-foreground font-medium">
                      {e.operator ? e.operator : "—"}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-3 items-center">
                    <KeyVal label="txId" value={e.txId ?? "—"} />
                    <KeyVal label="cycleId" value={e.cycleId} />
                    {e.batchId && <KeyVal label="lote" value={e.batchId} />}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function KeyVal({ label, value }: { label: string; value: string }) {
  function copy() {
    navigator.clipboard.writeText(value).then(
      () => toast.success(`${label} copiado!`),
      () => toast.error("Falha ao copiar")
    );
  }
  return (
    <div className="inline-flex items-center gap-1 text-xs">
      <span className="text-muted-foreground">{label}:</span>
      <code className="font-mono text-[11px] bg-muted/60 px-1.5 py-0.5 rounded">{value}</code>
      {value !== "—" && (
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={copy} title="Copiar">
          <Copy className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}
