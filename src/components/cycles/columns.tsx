import type { ColumnDef } from "@tanstack/react-table";
import type { Cycle } from "@/types/cycle";
import { Button } from "@/components/ui/button";

function fmt(dt?: string | null) {
  if (!dt) return "—";
  const d = new Date(dt);
  if (Number.isNaN(d.getTime())) return String(dt);
  return d.toLocaleString("pt-BR", { timeZone: "America/Fortaleza" });
}

const STAGES = ["RECEBIMENTO","LAVAGEM","DESINFECCAO","ESTERILIZACAO","ARMAZENAMENTO"] as const;

export type RowAction = {
  onEdit: (row: Cycle) => void;
  onDelete: (row: Cycle) => void;
  onChangeStage: (row: Cycle, etapa: string) => void; // abre o modal avançado
};

export function getCycleColumns(actions: RowAction): ColumnDef<Cycle>[] {
  return [
    {
      accessorKey: "etapa",
      header: "Etapa",
      enableSorting: true,
      cell: ({ row }) => (
        <select
          className="rounded-md border bg-background px-2 py-1 text-xs"
          value={String(row.original.etapa || "RECEBIMENTO")}
          onChange={(e) => actions.onChangeStage(row.original, e.target.value)}
        >
          {STAGES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      ),
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
          <Button variant="outline" size="sm" onClick={() => actions.onEdit(row.original)}>Editar</Button>
          <Button variant="destructive" size="sm" onClick={() => actions.onDelete(row.original)}>Remover</Button>
        </div>
      ),
    },
  ];
}
