import * as React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";

export type HistoryEntry = {
  source: "fabric" | "db";
  stage: string;
  timestamp: string; // ISO
  operator?: string | null;
  materialId?: string | null;
  loteId?: string | null;
};

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title?: string;
  entries: HistoryEntry[];
  /** mostra coluna/linha com Material */
  showMaterial?: boolean;
  /** mapeia id do material -> rótulo para exibir (ex.: "Pinça Kelly (MAT-XXXX)") */
  materialLabelById?: (id: string) => string | undefined;
  /** ação opcional (ex.: exportar PDF) */
  onExportPdf?: () => void;
};

function fmtDateTime(s?: string) {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString("pt-BR");
}

function SourceBadge({ source }: { source: "fabric" | "db" }) {
  if (source === "fabric") return <Badge variant="default">Blockchain</Badge>;
  return <Badge variant="secondary">Banco</Badge>;
}

export default function HistoryDialog({
  open,
  onOpenChange,
  title = "Histórico",
  entries,
  showMaterial,
  materialLabelById,
  onExportPdf,
}: Props) {
  // ordena cronologicamente
  const list = React.useMemo(() => {
    return [...(entries || [])].sort((a, b) => {
      const ta = new Date(a.timestamp).getTime();
      const tb = new Date(b.timestamp).getTime();
      return ta - tb;
    });
  }, [entries]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-hidden p-0">
        <DialogHeader className="px-6 pt-6">
          <div className="flex items-center justify-between gap-3">
            <DialogTitle className="text-base sm:text-lg">{title}</DialogTitle>
            {onExportPdf && (
              <Button size="sm" variant="outline" onClick={onExportPdf}>
                Exportar PDF
              </Button>
            )}
          </div>
        </DialogHeader>

        <Separator />

        <ScrollArea className="h-[70vh]">
          <div className="px-6 py-4">
            {list.length === 0 ? (
              <div className="text-sm text-muted-foreground">Sem eventos para exibir.</div>
            ) : (
              <ul className="relative pl-4">
                {/* linha vertical */}
                <div className="absolute left-0 top-0 h-full w-px bg-border" aria-hidden />
                {list.map((e, i) => (
                  <li key={i} className="relative mb-4">
                    {/* marcador */}
                    <div className="absolute -left-[9px] top-1 size-2.5 rounded-full bg-primary" aria-hidden />

                    <div className="flex flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{e.stage || "—"}</span>
                        <SourceBadge source={e.source} />
                        <span className="text-xs text-muted-foreground">{fmtDateTime(e.timestamp)}</span>
                      </div>

                      <div className="text-xs text-muted-foreground">
                        {e.operator && (
                          <span className="mr-3">
                            <span className="font-medium text-foreground">Responsável:</span> {e.operator}
                          </span>
                        )}
                        {showMaterial && e.materialId && (
                          <span className="mr-3">
                            <span className="font-medium text-foreground">Material:</span>{" "}
                            {materialLabelById?.(e.materialId) ?? e.materialId}
                          </span>
                        )}
                        {e.loteId && (
                          <span className="mr-3">
                            <span className="font-medium text-foreground">Lote:</span> {e.loteId}
                          </span>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
