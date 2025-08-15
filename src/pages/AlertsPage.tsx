import * as React from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { listAlerts, ackAlert, resolveAlert } from "@/api/alerts";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import AlertDetailsDrawer from "@/components/alerts/AlertDetailsDrawer";

export default function AlertsPage() {
  const qc = useQueryClient();
  const [status, setStatus] = React.useState<"" | "OPEN" | "ACKED" | "RESOLVED">("OPEN");
  const [severity, setSeverity] = React.useState<"" | "INFO" | "WARNING" | "CRITICAL">("");
  const [q, setQ] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [perPage, setPerPage] = React.useState(10);
  const [detailOpen, setDetailOpen] = React.useState(false);
  const [selected, setSelected] = React.useState<any | null>(null);

  const query = useQuery({
    queryKey: ["alerts", { status, severity, q, page, perPage }],
    queryFn: () => listAlerts({
      status: status || undefined,
      severity: severity || undefined,
      q: q || undefined,
      page,
      perPage,
    }),
    placeholderData: keepPreviousData,
  });

  const ackMut = useMutation({
    mutationFn: (id: string) => ackAlert(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["alerts"] });
      qc.invalidateQueries({ queryKey: ["alerts-counts"] });
      qc.invalidateQueries({ queryKey: ["alerts", "open-map"] });
    },
  });
  const resMut = useMutation({
    mutationFn: (id: string) => resolveAlert(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["alerts"] });
      qc.invalidateQueries({ queryKey: ["alerts-counts"] });
      qc.invalidateQueries({ queryKey: ["alerts", "open-map"] });
    },
  });

  const rows = query.data?.data ?? [];
  const total = query.data?.total ?? rows.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));

  return (
    <section className="space-y-4">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">Alertas</h2>
          <p className="text-sm opacity-70">Gerencie não conformidades e prazos de validade.</p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <Input placeholder="Buscar por título/mensagem" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} className="w-64" />
          <select className="rounded-md border bg-background px-2 py-2 text-sm" value={status} onChange={(e) => { setStatus(e.target.value as any); setPage(1); }}>
            <option value="">Status (todos)</option>
            <option value="OPEN">Abertos</option>
            <option value="ACKED">Acusados</option>
            <option value="RESOLVED">Resolvidos</option>
          </select>
          <select className="rounded-md border bg-background px-2 py-2 text-sm" value={severity} onChange={(e) => { setSeverity(e.target.value as any); setPage(1); }}>
            <option value="">Severidade (todas)</option>
            <option value="CRITICAL">Crítico</option>
            <option value="WARNING">Aviso</option>
            <option value="INFO">Info</option>
          </select>
          <select className="rounded-md border bg-background px-2 py-2 text-sm" value={perPage} onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }}>
            {[10, 20, 50].map(n => <option key={n} value={n}>{n}/página</option>)}
          </select>
        </div>
      </header>

      <Card>
        <CardHeader><CardTitle>Lista</CardTitle></CardHeader>
        <CardContent className="divide-y">
          {rows.map(a => (
            <div key={a.id} className="py-3 flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-medium">
                  {a.title}{" "}
                  <span className={`ml-2 text-xs ${a.severity === "CRITICAL" ? "text-red-600" : a.severity === "WARNING" ? "text-yellow-700" : "text-slate-500"}`}>{a.severity}</span>
                </div>
                <div className="text-xs text-muted-foreground">{a.message || "—"}</div>
                <div className="text-[11px] text-muted-foreground mt-1">
                  {a.stage ? `Etapa: ${a.stage}` : ""} {a.cycleId ? `· Ciclo: ${a.cycleId}` : ""} {a.dueAt ? `· Venc.: ${new Date(a.dueAt).toLocaleString("pt-BR", { timeZone: "America/Fortaleza" })}` : ""}
                </div>
              </div>
              <div className="shrink-0 flex gap-2">
                 <Button size="sm" variant="outline" onClick={() => { setSelected(a); setDetailOpen(true); }}>Detalhes</Button>
                {a.status === "OPEN" && <Button size="sm" variant="outline" onClick={() => ackMut.mutate(a.id)}>Acusar</Button>}
                {a.status !== "RESOLVED" && <Button size="sm" variant="destructive" onClick={() => resMut.mutate(a.id)}>Resolver</Button>}
              </div>
            </div>
          ))}
          {rows.length === 0 && <div className="py-6 text-sm text-muted-foreground">Sem resultados.</div>}

          <div className="flex items-center justify-between mt-4">
            <div className="text-sm opacity-70">Página {page} de {totalPages} · {total} itens</div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>Anterior</Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>Próxima</Button>
            </div>
          </div>
        </CardContent>
      </Card>
      <AlertDetailsDrawer open={detailOpen} onOpenChange={setDetailOpen} alert={selected} />
    </section>
  );
}