import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getAlertCounts, listAlerts, ackAlert, resolveAlert } from "@/api/alerts";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Bell } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAlertsSSE } from "@/hooks/useAlertsSSE";
import AlertDetailsDrawer from "@/components/alerts/AlertDetailsDrawer";
import { useAuth } from "@/hooks/useAuth"; // se existir

export default function AlertsBell() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [detailOpen, setDetailOpen] = React.useState(false);
  const [selected, setSelected] = React.useState<any | null>(null);
  useAlertsSSE(true);
  const counts = useQuery({ queryKey: ["alerts-counts"], queryFn: getAlertCounts });
  const alerts = useQuery({
    queryKey: ["alerts", open],
    queryFn: () => listAlerts({ status: "OPEN", perPage: 50 }),
    enabled: open
  });
  const ackMut = useMutation({ mutationFn: ackAlert, onSuccess: () => { qc.invalidateQueries({ queryKey: ["alerts", true] }); qc.invalidateQueries({ queryKey: ["alerts-counts"] }); } });
  const resMut = useMutation({ mutationFn: resolveAlert, onSuccess: () => { qc.invalidateQueries({ queryKey: ["alerts", true] }); qc.invalidateQueries({ queryKey: ["alerts-counts"] }); } });

  const openCount = counts.data?.open ?? 0;
  const critical = counts.data?.critical ?? 0;

  const { user } = useAuth(); // se existir

  return (
    <>
      <Button variant="outline" className="relative" onClick={() => setOpen(true)}>
        <Bell className="h-4 w-4" />
        {openCount > 0 && (
          <Badge className="absolute -top-1 -right-1 px-1.5 py-0 text-[10px]">{openCount}</Badge>
        )}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[680px]">
          <DialogHeader>
            <DialogTitle>Alertas {critical ? <span className="text-red-600">({critical} críticos)</span> : null}</DialogTitle>
          </DialogHeader>
          <div className="divide-y">
            {alerts.isLoading ? <div className="p-4 text-sm">Carregando…</div> : null}
            {(alerts.data?.data ?? []).map((a) => (
              <div key={a.id} className="flex items-start justify-between gap-3 p-3">
                <div>
                  <div className="text-sm font-medium">
                    {a.title}{" "}
                    <span className={`ml-2 text-xs ${a.severity === "CRITICAL" ? "text-red-600" : a.severity === "WARNING" ? "text-yellow-600" : "text-slate-500"}`}>
                      {a.severity}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">{a.message || "—"}</div>
                  <div className="text-[11px] text-muted-foreground mt-1">
                    {a.stage ? `Etapa: ${a.stage}` : ""} {a.cycleId ? `· Ciclo: ${a.cycleId}` : ""}
                  </div>
                </div>
                <div className="shrink-0 flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { setSelected(a); setDetailOpen(true); }}
                  >
                    Detalhes
                  </Button>
                    <Button
                        size="sm"
                        variant="outline"
                        disabled={!a.cycleId}
                        onClick={() => {
                        if (!a.cycleId) return;
                        const params = new URLSearchParams();
                        params.set("focus", a.cycleId);
                        if (a.stage && a.stage !== "RECEBIMENTO") params.set("openStage", a.stage);
                        setOpen(false);
                        navigate(`/cycles?${params.toString()}`);
                        }}
                    >
                        Ver
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => ackMut.mutate(a.id)}>Acusar</Button>
                  <Button size="sm" variant="destructive" onClick={() => resMut.mutate(a.id)}>Resolver</Button>
                </div>
              </div>
            ))}
            {(alerts.data?.data?.length ?? 0) === 0 && !alerts.isLoading && (
              <div className="p-4 text-sm text-muted-foreground">Sem alertas abertos.</div>
            )}
            <AlertDetailsDrawer
              open={detailOpen}
              onOpenChange={setDetailOpen}
              alert={selected}
              currentUserName={user?.name} // se existir
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
