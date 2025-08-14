// src/pages/MaterialsHistoryIndex.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { listMaterials } from "@/api/materials";
import type { Material } from "@/types/material";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function MaterialsHistoryIndex() {
  const navigate = useNavigate();

  // ===== Busca/lista =====
  const [qRaw, setQRaw] = useState("");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Material | null>(null);

  // debounce da busca
  useEffect(() => {
    const t = setTimeout(() => setQ(qRaw.trim()), 300);
    return () => clearTimeout(t);
  }, [qRaw]);

  // Sempre buscar (com ou sem q) para listar materiais
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["materials-search", q],
    queryFn: async () => {
      const params: any = { perPage: 12, page: 1 };
      if (q.length) params.q = q;
      return listMaterials(params);
    },
    enabled: true, // ⬅️ antes estava desabilitado quando q = ""
    placeholderData: keepPreviousData,
    staleTime: 5_000,
  });

  const list = useMemo(() => data?.data ?? [], [data]);

  function openHistoryById(id: string) {
    if (!id) return;
    navigate(`/materials/${encodeURIComponent(id)}/history`);
  }

  function onEnter(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    if (selected?.id) return openHistoryById(selected.id);
    if (list.length === 1) return openHistoryById(list[0].id);
    if (!q && !qRaw) {
      toast.message("Selecione um material na lista ou use o scanner.");
      return;
    }
    setQ(qRaw.trim());
  }

  // ===== Scanner (QR) =====
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState<string | null>(null);
  const scannerRef = useRef<any>(null);

  // Para e limpa ao desmontar
  useEffect(() => {
    return () => {
      stopScan();
    };
  }, []);

  async function startScan() {
    try {
      if (scanning) return;
      setScanMsg("Inicializando câmera…");
      setScanning(true);

      // aguarda o container ficar visível no DOM
      await new Promise((r) => requestAnimationFrame(() => r(null)));

      const { Html5Qrcode } = await import("html5-qrcode");

      // Precisa existir no DOM e estar visível
      const elementId = "qr-reader-materials";
      const el = document.getElementById(elementId);
      if (!el) {
        setScanMsg("Container do scanner não encontrado.");
        setScanning(false);
        return;
      }

      const html5QrCode = new Html5Qrcode(elementId);
      scannerRef.current = html5QrCode;

      const config: any = {
        fps: 10,
        qrbox: { width: 240, height: 240 },
        aspectRatio: 1.0,
        rememberLastUsedCamera: true,
      };

      await html5QrCode.start(
        { facingMode: "environment" },
        config,
        async (decodedText: string) => {
          setScanMsg(`Código lido.`);
          await stopScan();
          toast.success("Código lido!");
          resolveByScan(decodedText);
        },
        () => {
          // onScanFailure: ignorar erros por frame
        }
      );

      setScanMsg("Câmera ativa. Aponte para o QR.");
    } catch (e) {
      console.error(e);
      setScanMsg("Erro ao acessar a câmera.");
      setScanning(false);
      toast.error("Não foi possível acessar a câmera.");
    }
  }

  async function stopScan() {
    try {
      const s = scannerRef.current;
      if (s) {
        await s.stop(); // para stream
        await s.clear(); // limpa UI
      }
    } catch {
      // noop
    } finally {
      scannerRef.current = null;
      setScanning(false);
    }
  }

  async function resolveByScan(code: string) {
    try {
      // tenta buscar pelo texto do QR
      const resp = await listMaterials({ q: code, perPage: 10, page: 1 });
      if (resp.data.length === 1) {
        return openHistoryById(resp.data[0].id);
      }
      if (resp.data.length > 1) {
        setQRaw(code);
        setSelected(resp.data[0]);
        toast.message("Vários materiais encontrados para esse código. Selecione na lista.");
        return;
      }
      // fallback: usar o próprio texto como ID
      openHistoryById(code);
    } catch {
      openHistoryById(code);
    }
  }

  return (
    <div className="grid gap-6 max-w-5xl">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Histórico de Materiais</h1>
        <p className="text-sm text-muted-foreground">
          Pesquise pelo material ou escaneie o QR da etiqueta para abrir a timeline (DB + Ledger).
        </p>
      </div>

      {/* Busca + ações */}
      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="Buscar por nome, código ou ID do material…"
            value={qRaw}
            onChange={(e) => setQRaw(e.target.value)}
            onKeyDown={onEnter}
            className="w-80"
          />
          <Button variant="secondary" onClick={() => setQ(qRaw.trim())}>
            {isFetching ? "Buscando…" : "Buscar"}
          </Button>

          <div className="ms-auto flex items-center gap-2">
            {!scanning ? (
              <Button onClick={startScan}>Scanear QR</Button>
            ) : (
              <Button variant="destructive" onClick={stopScan}>Parar câmera</Button>
            )}
          </div>
        </div>

        {/* Scanner */}
        <div className={cn("mt-3", scanning ? "block" : "hidden")}>
          <div className="rounded-xl border p-2">
            {/* O html5-qrcode vai montar o vídeo dentro deste container */}
            <div id="qr-reader-materials" className="w-full flex justify-center min-h-[260px]" />
          </div>
          <div className="text-xs text-muted-foreground mt-2">
            {scanMsg ?? "Pronto para escanear."}
          </div>
        </div>
      </Card>

      {/* Lista de resultados */}
      <Card className="p-0 overflow-hidden">
        <div className="px-3 py-2 border-b flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            {q ? <>Resultados para <strong>{q}</strong></> : "Materiais cadastrados"}
          </div>
          <div className="text-sm text-muted-foreground">
            {isLoading ? "Carregando…" : `${list.length} item(ns)`}
          </div>
        </div>

        <div className="max-h-[420px] overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="[&>th]:px-3 [&>th]:py-2 text-left">
                <th>Nome</th>
                <th>Código</th>
                <th>Categoria</th>
                <th>Tipo</th>
                <th>Reprocessos</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 && !isLoading && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                    Nenhum material encontrado.
                  </td>
                </tr>
              )}

              {list.map((m) => {
                const isSel = selected?.id === m.id;
                return (
                  <tr
                    key={m.id}
                    className={cn(
                      "border-t [&>td]:px-3 [&>td]:py-2 cursor-pointer",
                      isSel ? "bg-secondary/30" : "hover:bg-muted/50"
                    )}
                    onClick={() => setSelected(m)}
                    onDoubleClick={() => openHistoryById(m.id)}
                  >
                    <td className="font-medium">{m.name}</td>
                    <td className="font-mono text-xs">{m.code ?? "—"}</td>
                    <td>{m.category ?? "—"}</td>
                    <td>{m.type ?? "—"}</td>
                    <td className="text-center">{(m as any).reprocessamentos ?? 0}</td>
                    <td className="text-right">
                      <Button size="sm" variant="secondary" onClick={() => openHistoryById(m.id)}>
                        Abrir histórico
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="px-3 py-2 border-t flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            {selected ? (
              <>Selecionado: <code className="bg-muted/60 px-1 rounded">{selected.name}</code></>
            ) : (
              <>Selecione um material na lista</>
            )}
          </div>
          <Button disabled={!selected} onClick={() => selected && openHistoryById(selected.id)}>
            Abrir histórico
          </Button>
        </div>
      </Card>
    </div>
  );
}
