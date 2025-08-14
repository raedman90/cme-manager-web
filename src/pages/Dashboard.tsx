import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from "recharts";

import {
  Package,
  Boxes,
  Activity,
  RefreshCcw,
  AlertTriangle,
  Lock,
  Database,
  Droplets,
  ShieldCheck,
  Flame,
  Archive,
  Clock,
} from "lucide-react";

import { getMetricsOverview, type MetricsOverview } from "@/api/metrics";

/* ---------------------------- helpers ---------------------------- */
const numberFmt = (n?: number | null) =>
  n === null || n === undefined ? "—" : new Intl.NumberFormat("pt-BR").format(n);
const percentFmt = (p?: number | null) =>
  p === null || p === undefined ? "—" : `${Math.round((p || 0) * 100)}%`;

const STAGE_COLORS: Record<string, string> = {
  RECEBIMENTO: "#0ea5e9", // sky-500
  LAVAGEM: "#06b6d4", // cyan-500
  DESINFECCAO: "#f59e0b", // amber-500
  ESTERILIZACAO: "#ef4444", // red-500
  ARMAZENAMENTO: "#10b981", // emerald-500
};

const SOURCE_COLORS = { LEDGER: "#10b981", DB: "#64748b" };

/* --------------------------- subcomponents --------------------------- */
function StatCard({
  title,
  value,
  subtitle,
  icon,
  onClick,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <Card className={onClick ? "hover:bg-muted/40 cursor-pointer transition" : ""} onClick={onClick}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
      </CardContent>
    </Card>
  );
}

function LegendDot({ color }: { color: string }) {
  return <span className="inline-block size-2 rounded-full mr-2" style={{ backgroundColor: color }} />;
}

function StageLegend() {
  return (
    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
      {Object.entries(STAGE_COLORS).map(([k, color]) => (
        <span key={k} className="inline-flex items-center">
          <LegendDot color={color} /> {k}
        </span>
      ))}
    </div>
  );
}

/* ------------------------------- page ------------------------------- */
export default function Dashboard() {
  const navigate = useNavigate();
  const [days, setDays] = useState<7 | 14 | 30>(7);

  const { data, isLoading, isError, refetch, error } = useQuery<MetricsOverview>({
    queryKey: ["metrics", { days }],
    queryFn: () => getMetricsOverview({ days }),
    staleTime: 60_000,
  });

  const totals = data?.totals;

  // trend de reprocessamentos: usa série por etapa ESTERILIZACAO
  const reprocTrend = useMemo(() => {
    if (!data?.series7d) return [] as { date: string; value: number }[];
    return data.series7d.map((d) => ({ date: d.date, value: (d as any).ESTERILIZACAO ?? 0 }));
  }, [data]);

  const lastLedgerAgo = useMemo(() => {
    if (!data?.lastLedgerAt) return "—";
    try {
      return formatDistanceToNow(new Date(data.lastLedgerAt), { addSuffix: true, locale: ptBR });
    } catch {
      return data.lastLedgerAt;
    }
  }, [data?.lastLedgerAt]);

  // alertas simples
  const alerts: { level: "warn" | "danger"; text: string; href?: string }[] = useMemo(() => {
    if (!data) return [];
    const a: { level: "warn" | "danger"; text: string; href?: string }[] = [];
    if ((data.totals.reprocess24h ?? 0) >= 10) a.push({ level: "warn", text: `Reprocessamentos 24h: ${numberFmt(data.totals.reprocess24h)}` });
    if ((data.totals.events24h ?? 0) === 0) a.push({ level: "danger", text: "Nenhum evento nas últimas 24h" });
    if (data.lastLedgerAt) {
      const hrs = (Date.now() - new Date(data.lastLedgerAt).getTime()) / 3600000;
      if (hrs > 2) a.push({ level: "warn", text: `Último evento no Ledger há ${Math.floor(hrs)}h` });
    }
    return a;
  }, [data]);

  return (
    <section className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Dashboard</h2>
          <p className="text-sm text-muted-foreground">Visão geral · últimos {days} dias.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg border p-1 text-xs bg-background">
            {[7, 14, 30].map((d) => (
              <Button
                key={d}
                variant={days === d ? "default" : "ghost"}
                size="sm"
                className="h-7 px-3"
                onClick={() => setDays(d as 7 | 14 | 30)}
              >
                {d}d
              </Button>
            ))}
          </div>
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCcw className="h-4 w-4 mr-2" />Atualizar
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
        <StatCard
          onClick={() => navigate("/materials")}
          title="Materiais"
          value={isLoading ? "…" : numberFmt(totals?.materials)}
          subtitle={`Ativos: ${isLoading ? "…" : numberFmt(totals?.materialsActive)}`}
          icon={<Package className="h-4 w-4" />}
        />
        <StatCard
          onClick={() => navigate("/batches")}
          title="Lotes"
          value={isLoading ? "…" : numberFmt(totals?.lotes)}
          subtitle="Contagem geral"
          icon={<Boxes className="h-4 w-4" />}
        />
        <StatCard
          title="Reprocessamentos"
          value={isLoading ? "…" : numberFmt(totals?.reprocessTotal)}
          subtitle={`Últimas 24h: ${isLoading ? "…" : numberFmt(totals?.reprocess24h)}`}
          icon={<Flame className="h-4 w-4" />}
        />
        <StatCard
          title="Eventos (24h)"
          value={isLoading ? "…" : numberFmt(totals?.events24h)}
          subtitle={`Ledger: ${isLoading ? "…" : percentFmt(totals?.ledgerShare24h)}`}
          icon={<Activity className="h-4 w-4" />}
        />
        <StatCard
          title="Último no Ledger"
          value={lastLedgerAgo}
          subtitle={data?.lastLedgerAt ? format(new Date(data.lastLedgerAt), "dd/MM/yyyy HH:mm", { locale: ptBR }) : "—"}
          icon={<Lock className="h-4 w-4" />}
        />
        <StatCard
          title="Hoje por etapa"
          value={isLoading ? "…" : numberFmt(Object.values(data?.stagesToday ?? {}).reduce((a, b) => a + b, 0))}
          subtitle={Object.entries(data?.stagesToday ?? {})
            .map(([k, v]) => `${k.slice(0, 3)}:${v}`)
            .join(" · ") || "—"}
          icon={<Clock className="h-4 w-4" />}
        />
      </div>

      {/* Alertas */}
      {alerts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Alertas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {alerts.map((a, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <Badge variant={a.level === "danger" ? "destructive" : "secondary"} className="shrink-0">
                  <AlertTriangle className="h-3 w-3 mr-1" /> {a.level === "danger" ? "Crítico" : "Atenção"}
                </Badge>
                <span>{a.text}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Gráficos */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Eventos por etapa • últimos {days} dias</CardTitle>
              <StageLegend />
            </div>
          </CardHeader>
          <CardContent className="h-[300px]">
            {isLoading ? (
              <div className="h-full grid place-items-center text-sm text-muted-foreground">Carregando…</div>
            ) : data?.series7d?.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.series7d} margin={{ left: 8, right: 8, top: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  {Object.keys(STAGE_COLORS).map((k) => (
                    <Area key={k} type="monotone" dataKey={k} name={k} stackId="1" stroke={STAGE_COLORS[k]} fill={STAGE_COLORS[k]} />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full grid place-items-center text-sm text-muted-foreground">Sem dados</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Origem dos eventos (24h)</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            {isLoading ? (
              <div className="h-full grid place-items-center text-sm text-muted-foreground">Carregando…</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie dataKey="value" nameKey="name" data={[
                    { name: "Ledger", value: data?.sourceSplit24h?.LEDGER ?? 0 },
                    { name: "DB", value: data?.sourceSplit24h?.DB ?? 0 },
                  ]} outerRadius={100}>
                    <Cell fill={SOURCE_COLORS.LEDGER} />
                    <Cell fill={SOURCE_COLORS.DB} />
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top reprocessados + Trend */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Top 5 reprocessados (DB)</CardTitle>
          </CardHeader>
          <CardContent>
            {!data?.topReprocessed?.length ? (
              <div className="text-sm text-muted-foreground">Sem dados</div>
            ) : (
              <div className="rounded-md border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-3 py-2">Material</th>
                      <th className="text-left px-3 py-2">Código</th>
                      <th className="text-right px-3 py-2">Reprocessos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topReprocessed.map((m) => (
                      <tr key={m.materialId} className="border-t">
                        <td className="px-3 py-2">{m.name ?? "—"}</td>
                        <td className="px-3 py-2 font-mono text-xs">{m.code ?? "—"}</td>
                        <td className="px-3 py-2 text-right">{numberFmt(m.count)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Tendência de reprocessamentos</CardTitle>
          </CardHeader>
          <CardContent className="h-[240px]">
            {!reprocTrend.length ? (
              <div className="h-full grid place-items-center text-sm text-muted-foreground">Sem dados</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={reprocTrend} margin={{ left: 8, right: 8, top: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="value" name="Esterilização (eventos)" fill={STAGE_COLORS.ESTERILIZACAO} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recentes */}
      <Card>
        <CardHeader>
          <CardTitle>Eventos recentes</CardTitle>
        </CardHeader>
        <CardContent>
          {isError && (
            <div className="text-red-500 text-sm mb-2">Erro ao carregar métricas: {(error as any)?.message ?? "—"}</div>
          )}

          {!data?.recentEvents?.length ? (
            <div className="text-sm text-muted-foreground">Nada por aqui ainda.</div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-3 py-2">Material</th>
                    <th className="text-left px-3 py-2">Código</th>
                    <th className="text-left px-3 py-2">Etapa</th>
                    <th className="text-left px-3 py-2">Fonte</th>
                    <th className="text-left px-3 py-2">Responsável</th>
                    <th className="text-left px-3 py-2">Data/Hora</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentEvents.map((ev) => (
                    <tr key={ev.id} className="border-t">
                      <td className="px-3 py-2">{ev.materialName ?? "—"}</td>
                      <td className="px-3 py-2 font-mono text-xs">{ev.materialCode ?? "—"}</td>
                      <td className="px-3 py-2">
                        <Badge variant="outline" className="gap-1">
                          {ev.stage === "RECEBIMENTO" && <Package className="h-3.5 w-3.5" />}
                          {ev.stage === "LAVAGEM" && <Droplets className="h-3.5 w-3.5" />}
                          {ev.stage === "DESINFECCAO" && <ShieldCheck className="h-3.5 w-3.5" />}
                          {ev.stage === "ESTERILIZACAO" && <Flame className="h-3.5 w-3.5" />}
                          {ev.stage === "ARMAZENAMENTO" && <Archive className="h-3.5 w-3.5" />}
                          {ev.stage}
                        </Badge>
                      </td>
                      <td className="px-3 py-2">
                        {ev.source === "LEDGER" ? (
                          <span className="inline-flex items-center text-emerald-700 gap-1 text-xs"><Lock className="h-3.5 w-3.5" /> Ledger</span>
                        ) : (
                          <span className="inline-flex items-center text-slate-600 gap-1 text-xs"><Database className="h-3.5 w-3.5" /> DB</span>
                        )}
                      </td>
                      <td className="px-3 py-2">{ev.operator ?? "—"}</td>
                      <td className="px-3 py-2">
                        {format(new Date(ev.timestamp), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="text-xs text-muted-foreground">
        {data?.generatedAt ? `Atualizado em ${format(new Date(data.generatedAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}` : "—"}
      </div>
    </section>
  );
}
