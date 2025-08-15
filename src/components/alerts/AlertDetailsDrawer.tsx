import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listAlertComments, createAlertComment, ackAlert, resolveAlert } from "@/api/alerts";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useCommentSignature } from "@/hooks/useCommentSignature";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  alert?: any | null;
  currentUserName?: string; // opcional: prioridade sobre a assinatura local
};

export default function AlertDetailsDrawer({ open, onOpenChange, alert, currentUserName }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const alertId = alert?.id as string | undefined;

  const comments = useQuery({
    queryKey: ["alert-comments", alertId],
    queryFn: () => listAlertComments(alertId!),
    enabled: open && !!alertId,
  });

  const [text, setText] = React.useState("");
  React.useEffect(() => { if (!open) setText(""); }, [open]);

  // assinatura local (persistida). Se o caller passar currentUserName, ele prevalece.
  const { name: signatureName, setName: setSignatureName } = useCommentSignature();
  const effectiveAuthor = (currentUserName && currentUserName.trim()) ? currentUserName : signatureName;


  const addMut = useMutation({
    mutationFn: () => createAlertComment(alertId!, { text, author: effectiveAuthor }),
    onSuccess: () => {
      setText("");
      qc.invalidateQueries({ queryKey: ["alert-comments", alertId] });
    },
    onError: (e: any) => toast({ title: "Falha ao comentar", description: e?.response?.data?.message || e?.message || "Erro", variant: "destructive" }),
  });

  const ackMut = useMutation({
    mutationFn: () => ackAlert(alertId!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["alerts"] });
      qc.invalidateQueries({ queryKey: ["alerts-counts"] });
      qc.invalidateQueries({ queryKey: ["alerts", "open-map"] });
      toast({ title: "Alerta acusado" });
    },
  });
  const resMut = useMutation({
    mutationFn: () => resolveAlert(alertId!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["alerts"] });
      qc.invalidateQueries({ queryKey: ["alerts-counts"] });
      qc.invalidateQueries({ queryKey: ["alerts", "open-map"] });
      toast({ title: "Alerta resolvido" });
      onOpenChange(false);
    },
  });

  const fmt = (s?: string) => s ? new Date(s).toLocaleString("pt-BR", { timeZone: "America/Fortaleza" }) : "—";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[720px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Alerta — {alert?.title ?? "—"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-2 text-sm">
          <div><b>Severidade:</b> {alert?.severity}</div>
          <div><b>Status:</b> {alert?.status}</div>
          <div><b>Etapa:</b> {alert?.stage || "—"}</div>
          <div><b>Ciclo:</b> {alert?.cycleId || "—"}</div>
          <div><b>Vencimento:</b> {fmt(alert?.dueAt)}</div>
          {alert?.message && <div className="text-muted-foreground">{alert.message}</div>}
          <div className="pt-2">
            <span className="text-xs text-muted-foreground">Assinando comentários como:</span>{" "}
            <input
              className="inline-block rounded border px-2 py-1 text-sm w-[220px]"
              placeholder="Seu nome"
              value={effectiveAuthor || ""}
              onChange={(e) => setSignatureName(e.target.value)}
              disabled={!!currentUserName} // se veio do caller, mantém bloqueado
              title={currentUserName ? "Nome vindo da sessão" : "Edite sua assinatura"}
            />
          </div>
        </div>

        <div className="mt-4">
          <div className="font-medium mb-2">Comentários</div>
          <div className="space-y-2 max-h-[240px] overflow-y-auto border rounded p-2">
            {(comments.data?.data ?? []).map((c) => (
              <div key={c.id} className="text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{c.author || "—"}</span>
                  <span className="text-xs text-muted-foreground">{fmt(c.createdAt)}</span>
                </div>
                <div className="whitespace-pre-wrap">{c.text}</div>
              </div>
            ))}
            {(comments.data?.data ?? []).length === 0 && <div className="text-xs text-muted-foreground">Sem comentários.</div>}
          </div>

          <div className="mt-2 space-y-2">
            <Textarea
              placeholder="Adicionar comentário / causa raiz / ação corretiva…"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
            />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => ackMut.mutate()} disabled={!alertId || ackMut.isPending}>Acusar</Button>
              <Button variant="destructive" size="sm" onClick={() => resMut.mutate()} disabled={!alertId || resMut.isPending}>Resolver</Button>
              <Button
                size="sm"
                onClick={() => addMut.mutate()}
                disabled={!text.trim() || addMut.isPending || !effectiveAuthor?.trim()}
                title={!effectiveAuthor?.trim() ? "Informe seu nome para assinar o comentário" : undefined}
              >
                Comentar
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
