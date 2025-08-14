import type { ColumnDef } from "@tanstack/react-table";
import type { Material } from "@/types/material";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export type RowActions = {
  onEdit: (row: Material) => void;
  onDelete: (row: Material) => void;
  // NOVO (opcional)
  onShowHistory?: (row: Material) => void;
  onReconcile?: (row: Material) => void;
};

function StatusBadge({ active }: { active?: boolean }) {
  if (active === undefined) return <Badge variant="secondary">—</Badge>;
  return active ? <Badge variant="default">Ativo</Badge> : <Badge variant="secondary">Inativo</Badge>;
}

export function getMaterialColumns(actions: RowActions): ColumnDef<Material>[] {
  return [
    { accessorKey: "name", header: "Nome", cell: ({ row }) => row.original.name || "—", enableSorting: true },
    { accessorKey: "code", header: "Código", cell: ({ row }) => row.original.code || "—", enableSorting: true },
    { accessorKey: "reprocessamentos", header: "Reprocess.", cell: ({ row }) => row.original.reprocessamentos ?? 0 },
    { id: "status", header: "Status", cell: ({ row }) => <StatusBadge active={row.original.active} /> },
    {
      id: "actions",
      header: "",
      enableSorting: false,
      cell: ({ row }) => {
        const m = row.original;
        return (
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={() => actions.onEdit(m)}>Editar</Button>
            <Button variant="destructive" size="sm" onClick={() => actions.onDelete(m)}>Remover</Button>
            {actions.onShowHistory && (
              <Button variant="outline" size="sm" onClick={() => actions.onShowHistory!(m)}>
                Histórico
              </Button>
            )}
            {actions.onReconcile && (
              <Button variant="outline" size="sm" onClick={() => actions.onReconcile!(m)}>
                Reconciliar
              </Button>
            )}
          </div>
        );
      },
    },
  ];
}
