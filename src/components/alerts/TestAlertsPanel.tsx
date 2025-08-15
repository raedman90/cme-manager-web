import * as React from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { listCycles } from "@/api/cycles";
import { attachDisinfectionMeta, attachSterilizationMeta, attachStorageMeta } from "@/api/stageMeta";
import type { ListCyclesParams } from "@/types/cycle";

type Kind = "DISINFECTION_FAIL" | "STERILIZATION_CI_FAIL" | "STORAGE_EXPIRED" | "STORAGE_SOON";

const OPTIONS: { value: Kind; label: string; stage: "DESINFECCAO" | "ESTERILIZACAO" | "ARMAZENAMENTO" }[] = [
  { value: "DISINFECTION_FAIL", label: "Desinfecção — Fita FAIL", stage: "DESINFECCAO" },
  { value: "STERILIZATION_CI_FAIL", label: "Esterilização — CI FAIL", stage: "ESTERILIZACAO" },
  { value: "STORAGE_EXPIRED", label: "Armazenamento — Validade expirada", stage: "ARMAZENAMENTO" },
  { value: "STORAGE_SOON", label: "Armazenamento — Vence em 2 dias", stage: "ARMAZENAMENTO" },
];

export default function TestAlertsPanel() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [kind, setKind] = React.useState<Kind>("DISINFECTION_FAIL");
  const [q, setQ] = React.useState("");
  const [page, setPage] = React.useState(1);
  const perPage = 20;
  const stageNeeded = React.useMemo(() => OPTIONS.find(o => o.value === kind)!.stage, [kind]);

  const params: ListCyclesParams = React.useMemo(() => ({
    page, perPage, etapa: stageNeeded, q: q || undefined
  }) as any, [page, perPage, stageNeeded, q]);

  const cycles = useQuery({
    queryKey: ["cycles", "for-test-alerts", params],
    queryFn: () => listCycles(params),
    placeholderData: keepPreviousData,
  });

  const [selectedId, setSelectedId] = React.useState<string>("");
  React.useEffect(() => { setSelectedId(""); setPage(1); }, [kind, stageNeeded]);

  const genMut = useMutation({
    mutationFn: async () => {
      if (!selectedId) throw new Error("Selecione um ciclo.");
      if (kind === "DISINFECTION_FAIL") {
        return attachDisinfectionMeta(selectedId, {
          agent: "PERACETICO",
          concentration: "0.2%",
          contactMin: 10,
          testStripResult: "FAIL",
        } as any, "teste: gerar alerta");
      }
      if (kind === "STERILIZATION_CI_FAIL") {
        return attachSterilizationMeta(selectedId, {
          method: "STEAM_134",
          ci: "FAIL",
        } as any, "teste: gerar alerta");
      }
      if (kind === "STORAGE_EXPIRED") {
        const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        return attachStorageMeta(selectedId, { expiresAt: past }, "teste: gerar alerta");
      }
      // STORAGE_SOON
      const soon = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
      return attachStorageMeta(selectedId, { expiresAt: soon }, "teste: gerar alerta");
    },
    onSuccess: () => {
      toast({ title: "Alerta gerado" });
      qc.invalidateQueries({ queryKey: ["alerts-counts"] });
      qc.invalidateQueries({ queryKey: ["alerts", "open-map"] });
    },
    onError: (e: any) => toast({ title: "Falha ao gerar alerta", description: e?.response?.data?.message || e?.message || "Erro", variant: "destructive" }),
  });

  const rows = cycles.data?.data ?? [];
  const total = cycles.data?.total ?? rows.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <label className="text-sm font-medium">Tipo de alerta</label>
          <select
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            value={kind}
            onChange={(e) => setKind(e.target.value as Kind)}
          >
            {OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <div className="text-xs text-muted-foreground mt-1">Requer ciclo na etapa: <b>{stageNeeded}</b></div>
        </div>
        <div>
          <label className="text-sm font-medium">Buscar ciclo</label>
          <Input
            placeholder="material/lote/responsável…"
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1); }}
          />
        </div>
      </div>

      <div>
        <label className="text-sm font-medium">Ciclo</label>
        <select
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
        >
          <option value="">Selecione…</option>
          {rows.map((c: any) => (
            <option key={c.id} value={c.id}>
              {c.materialName ?? "—"} {c.materialCode ? `(${c.materialCode})` : ""} · {c.etapa} · {c.loteNumero ?? "—"}
            </option>
          ))}
        </select>
        <div className="flex items-center justify-between mt-2">
          <div className="text-xs opacity-70">Página {page} de {totalPages} · {total} itens</div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>Anterior</Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>Próxima</Button>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={() => genMut.mutate()} disabled={!selectedId || genMut.isPending}>
          {genMut.isPending ? "Gerando…" : "Gerar alerta"}
        </Button>
      </div>
    </div>
  );
}

