import * as React from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { listAlerts, ackAlert, resolveAlert, getAlertStats } from "@/api/alerts";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, Legend, CartesianGrid } from "recharts";
import { saveAs } from "file-saver";
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


  // -------- KPIs --------
  const [from, setFrom] = React.useState<string>(() => {
    const d = new Date(); d.setDate(d.getDate() - 29);
    return d.toISOString().slice(0,10);
  });
  const [to, setTo] = React.useState<string>(() => new Date().toISOString().slice(0,10));
  const tz = "America/Fortaleza";
  const stats = useQuery({
    queryKey: ["alerts-stats", from, to, tz],
    queryFn: () => getAlertStats({ from: new Date(from).toISOString(), to: new Date(to + "T23:59:59").toISOString(), tz }),
  });

  function exportCsv() {
    const data = stats.data?.byDay ?? [];
    const header = "day,total,CRITICAL,WARNING,INFO\n";
    const body = data.map(r => `${r.day},${r.total},${r.CRITICAL},${r.WARNING},${r.INFO}`).join("\n");
    const blob = new Blob([header + body], { type: "text/csv;charset=utf-8" });
    saveAs(blob, `alerts_kpis_${from}_to_${to}.csv`);
  }

  return (
    <section className="space-y-4">
      {/* KPIs */}
      <Card>
        <CardHeader>
          <CardTitle>KPIs de Alertas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2 items-end">
            <div>
              <div className="text-sm font-medium">De</div>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div>
              <div className="text-sm font-medium">Até</div>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <Button variant="outline" onClick={exportCsv} disabled={!stats.data}>Exportar CSV</Button>
            <div className="ml-auto text-sm">
              <span className="mr-3">Total: <b>{stats.data?.totals.total ?? "…"}</b></span>
              <span className="mr-3 text-red-600">Crítico: <b>{stats.data?.totals.CRITICAL ?? "…"}</b></span>
              <span className="mr-3 text-yellow-700">Aviso: <b>{stats.data?.totals.WARNING ?? "…"}</b></span>
              <span className="text-slate-600">Info: <b>{stats.data?.totals.INFO ?? "…"}</b></span>
            </div>
          </div>

          <div className="h-56 w-full">
            <ResponsiveContainer>
              <LineChart data={(stats.data?.byDay ?? []).map(d => ({ ...d, dayLabel: d.day.slice(5) }))}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="dayLabel" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="total" name="Total/dia" dot={false} />
                <Line type="monotone" dataKey="CRITICAL" name="Crítico" dot={false} />
                <Line type="monotone" dataKey="WARNING" name="Aviso" dot={false} />
                <Line type="monotone" dataKey="INFO" name="Info" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="h-56 w-full">
            <ResponsiveContainer>
              <BarChart data={stats.data?.byKind ?? []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="kind" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" name="Alertas por tipo" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
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