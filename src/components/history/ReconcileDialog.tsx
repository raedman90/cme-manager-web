import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

export default function ReconcileDialog({
  open, onOpenChange, title, data,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  data?: Awaited<ReturnType<any>>; // use tipagem concreta no uso
}) {
  if (!data) return null;

  const exceeded = (data as any).material?.policy?.exceeded ?? false;
  const m = (data as any).material;

  const fmt = (s?: string | null) => {
    if (!s) return "—";
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? s : d.toLocaleString("pt-BR");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {title}
            {exceeded && <Badge variant="destructive">Limite de reprocessamentos excedido</Badge>}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-3">
          {m && (
            <div className="rounded border p-3 text-sm">
              <div><b>Material:</b> {m.name ?? "—"} ({m.code ?? "—"}) · Tipo: {m.type ?? "—"}</div>
              <div>Reprocessamentos → DB: {m.reprocessCount_db} · Ledger: {m.reprocessCount_ledger} · Limite: {m.policy?.limit}</div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded border p-3 text-sm">
              <div className="font-medium mb-1">Ledger</div>
              <div>Eventos: {(data as any).ledger?.count}</div>
              <div>Última etapa: {(data as any).ledger?.lastStage ?? "—"}</div>
              <div>Em: {fmt((data as any).ledger?.lastAt)}</div>
            </div>
            <div className="rounded border p-3 text-sm">
              <div className="font-medium mb-1">Banco</div>
              <div>Eventos: {(data as any).db?.count}</div>
              <div>Última etapa: {(data as any).db?.lastStage ?? "—"}</div>
              <div>Em: {fmt((data as any).db?.lastAt)}</div>
            </div>
          </div>

          <div className="rounded border p-3 text-sm">
            <div className="font-medium mb-2">Somente no Ledger ({(data as any).diffs?.missingInDb?.length})</div>
            <div className="max-h-40 overflow-auto space-y-1">
              {(data as any).diffs?.missingInDb?.map((e: any, i: number) => (
                <div key={i}>• {e.etapa} · {fmt(e.timestamp)} · {e.responsavel ?? "—"}</div>
              ))}
            </div>
          </div>

          <div className="rounded border p-3 text-sm">
            <div className="font-medium mb-2">Somente no Banco ({(data as any).diffs?.missingInLedger?.length})</div>
            <div className="max-h-40 overflow-auto space-y-1">
              {(data as any).diffs?.missingInLedger?.map((e: any, i: number) => (
                <div key={i}>• {e.etapa} · {fmt(e.timestamp)} · {e.responsavel ?? "—"}</div>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
