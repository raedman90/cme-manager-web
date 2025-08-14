// src/pages/Settings.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { api } from "@/api/axios";
import { useToast } from "@/hooks/use-toast";
import {
  Card, CardContent, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Camera, QrCode, ShieldCheck, Download } from "lucide-react";

/* ----------------------- tipos & helpers ----------------------- */
type Role = "ADMIN" | "TECH" | "AUDITOR";
type Me = { id: string; name: string; email: string; role: Role; badgeCode: string; photoUrl?: string | null };

async function getMe(): Promise<Me> {
  const { data } = await api.get("/me");
  return {
    id: data.id,
    name: data.name ?? data.nome ?? "—",
    email: data.email,
    role: data.role,
    badgeCode: data.badgeCode ?? data.badge ?? data.codigoCracha ?? "—",
    photoUrl: data.photoUrl ?? data.fotoUrl ?? null,
  };
}

async function putMe(payload: { name: string }) {
  const { data } = await api.put("/me", payload);
  return data;
}

async function postAvatar(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  const { data } = await api.post("/me/avatar", fd, { headers: { "Content-Type": "multipart/form-data" } });
  return data?.photoUrl ?? data?.url ?? "";
}

async function postPassword(payload: { current: string; next: string }) {
  const { data } = await api.post("/me/password", payload);
  return data;
}

/* ----------------------- gerar PDF do crachá ----------------------- */
/** Gera e baixa um PDF horizontal com QR, nome, função e código do crachá */
async function emitBadgePdf(user: Me) {
  const [{ jsPDF }, QRCode] = await Promise.all([
    import("jspdf"),
    import("qrcode"),
  ]);

  // Tamanho cartão (CR80): 85.6 × 54 mm (paisagem)
  const w = 85.6, h = 54;
  const doc = new jsPDF({ unit: "mm", format: [w, h], orientation: "landscape" });

  // Paleta do sistema
  const emerald = "#059669";      // primary
  const ink = "#0f172a";          // título
  const text = "#334155";         // corpo
  const bg = "#ffffff";           // fundo
  const band = "#e6f4ef";         // faixa clara

  // fundo
  doc.setFillColor(bg);
  doc.rect(0, 0, w, h, "F");

  // faixa lateral (brand)
  doc.setFillColor(emerald);
  doc.rect(0, 0, 22, h, "F");

  // faixa superior suave
  doc.setFillColor(band);
  doc.rect(22, 0, w - 22, 12, "F");

  // Título (app)
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("CME Manager", 4, 7);

  // Nome
  doc.setTextColor(ink);
  doc.setFontSize(12);
  doc.text(user.name || "—", 26, 18, { maxWidth: w - 26 - 36 });

  // Role + email
  doc.setTextColor(text);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(`Função: ${user.role}`, 26, 24);
  doc.text(String(user.email ?? ""), 26, 29, { maxWidth: w - 26 - 36 });

  // Código do crachá (com fundo)
  doc.setFillColor("#f1f5f9");
  doc.roundedRect(26, 33, 36, 10, 2, 2, "F");
  doc.setTextColor(ink);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(user.badgeCode || "—", 28, 39);

  // QR Code (com margem para não cortar)
  const qrText = user.badgeCode || user.id;
  const qrDataUrl = await QRCode.toDataURL(qrText, {
    errorCorrectionLevel: "M",
    margin: 1,           // margem branca para evitar corte
    scale: 8,            // boa definição
    color: { dark: "#111111", light: "#ffffff" },
  });
  const qrSize = 28;     // mm
  const qrX = w - qrSize - 6;
  const qrY = (h - qrSize) / 2;
  doc.addImage(qrDataUrl, "PNG", qrX, qrY, qrSize, qrSize, undefined, "FAST");

  // Selo "verificado"
  doc.setTextColor(emerald);
  doc.setFontSize(8);
  doc.text("Identificação com QR", 26, 49);

  // salva
  const fileNameSafe = (user.name || "cracha").replace(/[^\p{L}\p{N}\-_. ]/gu, "");
  doc.save(`cracha-${fileNameSafe}.pdf`);
}

/* ----------------------- schemas forms ----------------------- */
const profileSchema = z.object({ name: z.string().min(2, "Informe seu nome") });
type ProfileInput = z.infer<typeof profileSchema>;

const passSchema = z.object({
  current: z.string().min(6, "Mínimo 6 caracteres"),
  next: z.string().min(6, "Mínimo 6 caracteres"),
  confirm: z.string().min(6, "Mínimo 6 caracteres"),
}).refine(v => v.next === v.confirm, { path: ["confirm"], message: "Senhas não coincidem" });
type PassInput = z.infer<typeof passSchema>;

/* ----------------------- page ----------------------- */
export default function Settings() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: me, isLoading } = useQuery({ queryKey: ["me"], queryFn: getMe, staleTime: 60_000 });

  const profileForm = useForm<ProfileInput>({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: me?.name ?? "" },
  });
  useEffect(() => { if (me) profileForm.reset({ name: me.name ?? "" }); }, [me?.name]);

  const passForm = useForm<PassInput>({ resolver: zodResolver(passSchema) });

  const updateProfile = useMutation({
    mutationFn: (vals: ProfileInput) => putMe({ name: vals.name.trim() }),
    onSuccess: () => { toast({ title: "Perfil atualizado" }); qc.invalidateQueries({ queryKey: ["me"] }); },
    onError: (e: any) => toast({ title: "Falha ao atualizar", description: e?.response?.data?.message ?? "—", variant: "destructive" }),
  });

  const changePass = useMutation({
    mutationFn: (vals: PassInput) => postPassword({ current: vals.current, next: vals.next }),
    onSuccess: () => { toast({ title: "Senha alterada" }); passForm.reset(); },
    onError: (e: any) => toast({ title: "Falha ao alterar senha", description: e?.response?.data?.message ?? "—", variant: "destructive" }),
  });

  const [avatarUploading, setAvatarUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  async function onPickAvatar() {
    fileRef.current?.click();
  }

  async function onAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setAvatarUploading(true);
      const url = await postAvatar(file);
      toast({ title: "Foto atualizada" });
      qc.setQueryData<Me>(["me"], (old) => old ? ({ ...old, photoUrl: url }) : old);
    } catch (err: any) {
      toast({ title: "Falha ao enviar foto", description: err?.message ?? "—", variant: "destructive" });
    } finally {
      setAvatarUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const initials = useMemo(() => (me?.name || "U").split(" ").slice(0,2).map(s => s[0]).join("").toUpperCase(), [me?.name]);

  return (
    <section className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Configurações da conta</h2>
          <p className="text-sm text-muted-foreground">Gerencie seu perfil, senha e crachá.</p>
        </div>
        <Button variant="secondary" disabled={!me} onClick={() => me && emitBadgePdf(me)}>
          <QrCode className="h-4 w-4 mr-2" /> Emitir crachá (PDF)
        </Button>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        {/* Perfil */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Perfil</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-[120px_1fr]">
              {/* Avatar */}
              <div className="flex items-start">
                <div className="relative">
                  {me?.photoUrl ? (
                    <img
                      src={me.photoUrl}
                      alt={me.name}
                      className="h-24 w-24 rounded-xl object-cover border"
                    />
                  ) : (
                    <div className="h-24 w-24 rounded-xl grid place-items-center border bg-muted text-xl font-semibold">
                      {initials}
                    </div>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="absolute -bottom-2 left-1/2 -translate-x-1/2"
                    onClick={onPickAvatar}
                    disabled={avatarUploading}
                  >
                    <Camera className="h-4 w-4 mr-1" /> {avatarUploading ? "Enviando…" : "Foto"}
                  </Button>
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onAvatarChange} />
                </div>
              </div>

              {/* Campos */}
              <form
                className="grid gap-3"
                onSubmit={profileForm.handleSubmit((vals) => updateProfile.mutate(vals))}
              >
                <div>
                  <Label>Nome</Label>
                  <Input
                    {...profileForm.register("name")}
                    placeholder="Seu nome"
                    disabled={isLoading || updateProfile.isPending}
                  />
                  {profileForm.formState.errors.name && (
                    <p className="text-xs text-destructive mt-1">{profileForm.formState.errors.name.message}</p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>E-mail</Label>
                    <Input value={me?.email || ""} disabled />
                  </div>
                  <div>
                    <Label>Função</Label>
                    <Input value={me?.role || ""} disabled />
                  </div>
                </div>

                <div>
                  <Label>Código do crachá</Label>
                  <div className="flex items-center gap-2">
                    <Input value={me?.badgeCode || ""} readOnly />
                    <Badge variant="secondary" className="shrink-0">
                      <ShieldCheck className="h-3.5 w-3.5 mr-1" /> QR
                    </Badge>
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button type="submit" disabled={updateProfile.isPending || isLoading}>
                    {updateProfile.isPending ? "Salvando…" : "Salvar alterações"}
                  </Button>
                </div>
              </form>
            </div>
          </CardContent>
        </Card>

        {/* Senha */}
        <Card>
          <CardHeader>
            <CardTitle>Segurança</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="grid gap-3"
              onSubmit={passForm.handleSubmit((vals) => changePass.mutate(vals))}
            >
              <div>
                <Label>Senha atual</Label>
                <Input type="password" {...passForm.register("current")} placeholder="••••••••" />
                {passForm.formState.errors.current && (
                  <p className="text-xs text-destructive mt-1">{passForm.formState.errors.current.message}</p>
                )}
              </div>
              <div>
                <Label>Nova senha</Label>
                <Input type="password" {...passForm.register("next")} placeholder="••••••••" />
                {passForm.formState.errors.next && (
                  <p className="text-xs text-destructive mt-1">{passForm.formState.errors.next.message}</p>
                )}
              </div>
              <div>
                <Label>Confirmar nova senha</Label>
                <Input type="password" {...passForm.register("confirm")} placeholder="••••••••" />
                {passForm.formState.errors.confirm && (
                  <p className="text-xs text-destructive mt-1">{passForm.formState.errors.confirm.message}</p>
                )}
              </div>

              <Separator />

              <div className="flex justify-end">
                <Button type="submit" variant="outline" disabled={changePass.isPending}>
                  {changePass.isPending ? "Alterando…" : "Alterar senha"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* Dica de impressão do crachá */}
      <Card>
        <CardHeader>
          <CardTitle>Crachá de identificação</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Use <b>Emitir crachá (PDF)</b> para gerar um cartão horizontal com QR. O arquivo já sai no tamanho padrão
          (85,6 × 54 mm) com margens para não cortar o QR na impressão.
        </CardContent>
      </Card>
    </section>
  );
}
