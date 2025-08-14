import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { getMaterialReconcile, type MaterialReconcile } from "@/api/reconcile";
import { Button } from "@/components/ui/button";

export default function MaterialReconcileDialog({
  open, onOpenChange, materialId, materialLabel,
}: { open: boolean; onOpenChange: (v:boolean)=>void; materialId?: string; materialLabel?: string; }) {
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState<MaterialReconcile | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!open || !materialId) return;
      setLoading(true);
      try {
        const r = await getMaterialReconcile(materialId);
        if (active) setRes(r);
      } finally { if (active) setLoading(false); }
    }
    load();
    return () => { active = false; };
  }, [open, materialId]);

  const pol = res?.policy?.status;
  const polBadge = pol === "exceeded" ? <Badge variant="destructive">Limite estourado</Badge>
    : pol === "near" ? <Badge variant="default">Perto do limite</Badge>
    : pol === "ok" ? <Badge variant="secondary">Dentro do limite</Badge>
    : <Badge variant="secondary">Sem limite</Badge>;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Reconciliar — {materialLabel ?? res?.material?.name ?? "Material"}</DialogTitle>
        </DialogHeader>

        {loading && <div className="text-sm">Carregando…</div>}
        {!loading && res && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2 items-center text-sm">
              <span>DB: <strong>{res.summary.dbCount}</strong></span>
              <span>· Fabric: <strong>{res.summary.fabricCount}</strong></span>
              <span>· Último (DB): <code>{res.summary.lastStageDb ?? "—"}</code></span>
              <span>· Último (Fabric): <code>{res.summary.lastStageFabric ?? "—"}</code></span>
              <span>· {res.summary.equal ? <Badge variant="secondary">Em dia</Badge> : <Badge variant="destructive">Divergente</Badge>}</span>
              <span>· Reprocessos: <strong>{res.material.reprocessCount ?? 0}</strong></span>
              {polBadge}
              {res.policy?.limit != null && <span className="text-xs opacity-70"> (limite: {res.policy.limit})</span>}
            </div>

            <div className="rounded border">
              <div className="px-3 py-2 text-sm font-medium">Diferenças</div>
              {res.diffs.length === 0 ? (
                <div className="px-3 pb-3 text-sm text-muted-foreground">Nenhuma diferença.</div>
              ) : res.diffs.map((d,i) => (
                <div key={i} className="px-3 py-2 border-t text-sm grid grid-cols-2 gap-3">
                  <div>
                    <div className="font-medium">DB</div>
                    {d.db ? (<div>{d.db.stage} · {new Date(d.db.timestamp).toLocaleString("pt-BR")} {d.db.operator ? `· ${d.db.operator}` : ""}</div>) : <div className="text-muted-foreground">—</div>}
                  </div>
                  <div>
                    <div className="font-medium">Fabric</div>
                    {d.fabric ? (<div>{d.fabric.stage} · {new Date(d.fabric.timestamp).toLocaleString("pt-BR")} {d.fabric.operator ? `· ${d.fabric.operator}` : ""}</div>) : <div className="text-muted-foreground">—</div>}
                  </div>
                  <div className="col-span-2 text-xs opacity-70">Tipo: {d.type}</div>
                </div>
              ))}
            </div>

            {/* Botões de ação — apenas visuais por enquanto */}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={()=>onOpenChange(false)}>Fechar</Button>
              {/* Futuro: reconciliar → aplicar writes DB/Fabric */}
              {/* <Button>Sincronizar do Fabric</Button> */}
              {/* <Button variant="secondary">Escrever no Fabric</Button> */}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
