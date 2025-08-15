// src/components/cycles/columns.ts
import type { ColumnDef } from "@tanstack/react-table";
import type { Cycle } from "@/types/cycle";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { checkStageMeta } from "@/api/stageMeta";
import { CheckCircle2, CircleHelp } from "lucide-react";

function fmt(dt?: string | null) {
  if (!dt) return "—";
  const d = new Date(dt);
  if (Number.isNaN(d.getTime())) return String(dt);
  return d.toLocaleString("pt-BR", { timeZone: "America/Fortaleza" });
}

/** Pill com status dos metadados da etapa (consulta leve via React Query) */
function MetaStatusPill({ cycleId, stage }: { cycleId: string; stage: string }) {
  const enabled = stage !== "RECEBIMENTO" && !!cycleId;
  const { data, isLoading } = useQuery({
    queryKey: ["stageMetaStatus", cycleId, stage],
    queryFn: () => checkStageMeta(cycleId, stage as any),
    enabled,
    staleTime: 30_000,
  });

  if (!enabled) return null;
  if (isLoading) {
    return (
      <span className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs text-muted-foreground">
        …
      </span>
    );
  }
  if (data?.exists) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded border border-emerald-300/60 bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700"
        title="Metadados preenchidos"
      >
        <CheckCircle2 className="h-3 w-3" /> Metadados
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs text-muted-foreground"
      title="Ainda não preenchido"
    >
      <CircleHelp className="h-3 w-3" /> Vazio
    </span>
  );
}


export type RowAction = {
  onEdit: (row: Cycle) => void;
  onDelete: (row: Cycle) => void;
  onOpenMeta: (row: Cycle) => void;      // << novo
};

export function getCycleColumns(actions: RowAction): ColumnDef<Cycle>[] {
  return [
    {
      accessorKey: "etapa",
      header: "Etapa",
      enableSorting: true,
      cell: ({ row }) => <span className="text-sm font-medium">{row.original.etapa}</span>,
    },
    {
      accessorKey: "responsavel",
      header: "Responsável",
      enableSorting: true,
      cell: ({ row }) => row.original.responsavel || "—",
    },
    {
      id: "material",
      header: "Material",
      cell: ({ row }) => {
        const m = row.original;
        const name = m.materialName || "—";
        const code = m.materialCode ? ` (${m.materialCode})` : "";
        return `${name}${code}`;
      },
    },
    {
      accessorKey: "timestamp",
      header: "Data/Hora",
      enableSorting: true,
      cell: ({ row }) => fmt(row.original.timestamp),
    },
    {
      id: "lote",
      header: "Lote",
      cell: ({ row }) => row.original.loteNumero || row.original.loteId || "—",
    },
    {
      id: "actions",
      header: "",
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex justify-end gap-2">
         {/* Badge de status dos metadados */}
         <MetaStatusPill cycleId={row.original.id} stage={row.original.etapa} />
         <Button
            variant="outline"
            size="sm"
            onClick={() => actions.onOpenMeta(row.original)}
            disabled={row.original.etapa === "RECEBIMENTO"}
            title={row.original.etapa === "RECEBIMENTO" ? "Sem metadados na etapa RECEBIMENTO" : undefined}
          >
            Metadados
          </Button>
          <Button variant="outline" size="sm" onClick={() => actions.onEdit(row.original)}>
            Editar
          </Button>
          <Button variant="destructive" size="sm" onClick={() => actions.onDelete(row.original)}>
            Remover
          </Button>
        </div>
      ),
    },
  ];
}
