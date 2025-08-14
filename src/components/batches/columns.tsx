import type { ColumnDef } from "@tanstack/react-table";
import type { Batch } from "@/types/batch";
import { Button } from "@/components/ui/button";

export type RowActions = {
  onEdit: (row: Batch) => void;
  onDelete: (row: Batch) => void;
  onShowHistory?: (row: Batch) => void; // << novo
  onReconcile?: (row: Batch) => void;
};

export function getBatchColumns(actions: RowActions): ColumnDef<Batch>[] {
  return [
    { accessorKey: "name", header: "Nome", cell: ({ row }) => row.original.name || "—" },
    { accessorKey: "code", header: "Código", cell: ({ row }) => row.original.code || "—" },
    { accessorKey: "materialCount", header: "Materiais", cell: ({ row }) => row.original.materialCount ?? 0 },
    { accessorKey: "createdAt", header: "Criado em", cell: ({ row }) => new Date(row.original.createdAt ?? "").toLocaleString("pt-BR") || "—" },
    {
      id: "actions",
      header: "",
      enableSorting: false,
      cell: ({ row }) => {
        const b = row.original;
        return (
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => actions.onEdit(b)}>Editar</Button>
            <Button variant="destructive" size="sm" onClick={() => actions.onDelete(b)}>Remover</Button>
            {actions.onShowHistory && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  console.log("[UI] Histórico clicado para", b.id); // debug
                  actions.onShowHistory!(b);
                }}
              >
                Histórico
              </Button>
            )}
            {actions.onReconcile && (
              <Button variant="outline" size="sm" onClick={() => actions.onReconcile!(b)}>
                Reconciliar
              </Button>
            )}
          </div>
        );
      },
    },
  ];
}
